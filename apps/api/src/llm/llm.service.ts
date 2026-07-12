import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  GeminiPaidAdapter,
  llmTaskSchema,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { LlmTask, Prisma } from '@meditation/database';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

const microUsd = (value: bigint | number | null | undefined) =>
  value === null || value === undefined ? '0' : value.toString();

@Injectable()
export class LlmService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async providers() {
    const items = await this.prisma.llmProvider.findMany({
      include: {
        models: {
          orderBy: { createdAt: 'asc' },
          include: { priceVersions: { orderBy: { version: 'desc' }, take: 1 } },
        },
      },
      orderBy: { displayName: 'asc' },
    });
    return items.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({
        ...model,
        priceVersions: model.priceVersions.map((price) => ({
          ...price,
          inputMicroUsdPerM: microUsd(price.inputMicroUsdPerM),
          outputMicroUsdPerM: microUsd(price.outputMicroUsdPerM),
        })),
      })),
    }));
  }

  async enableProvider(adapterId: string) {
    const provider = await this.prisma.llmProvider.findUnique({ where: { adapterId } });
    if (!provider) throw new NotFoundException('LLM provider not found.');
    return this.prisma.llmProvider.update({
      where: { id: provider.id },
      data: { status: 'ENABLED' },
    });
  }

  async models() {
    const items = await this.prisma.llmModel.findMany({
      include: { provider: true, priceVersions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((model) => ({
      ...model,
      priceVersions: model.priceVersions.map((price) => ({
        ...price,
        inputMicroUsdPerM: microUsd(price.inputMicroUsdPerM),
        outputMicroUsdPerM: microUsd(price.outputMicroUsdPerM),
      })),
    }));
  }

  async createModel(input: {
    adapterId: string;
    providerModelId: string;
    displayName: string;
    inputTokenLimit: number;
    outputTokenLimit: number;
    supportsTools: boolean;
    supportsStructured: boolean;
    inputMicroUsdPerM: string;
    outputMicroUsdPerM: string;
  }) {
    const provider = await this.prisma.llmProvider.findUnique({
      where: { adapterId: input.adapterId },
    });
    if (!provider) throw new NotFoundException('LLM provider not found.');
    if (!/^[0-9]+$/.test(input.inputMicroUsdPerM) || !/^[0-9]+$/.test(input.outputMicroUsdPerM))
      throw new BadRequestException('Price values must be non-negative integer micro-USD values.');
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.llmModel.create({
        data: {
          providerId: provider.id,
          providerModelId: input.providerModelId,
          displayName: input.displayName,
          inputTokenLimit: input.inputTokenLimit,
          outputTokenLimit: input.outputTokenLimit,
          supportsTools: input.supportsTools,
          supportsStructured: input.supportsStructured,
          status: 'INACTIVE',
        },
      });
      await tx.llmModelPriceVersion.create({
        data: {
          modelId: model.id,
          version: 1,
          inputMicroUsdPerM: BigInt(input.inputMicroUsdPerM),
          outputMicroUsdPerM: BigInt(input.outputMicroUsdPerM),
          effectiveAt: new Date(),
        },
      });
      return model;
    });
  }

  async testModel(modelId: string) {
    const model = await this.prisma.llmModel.findUnique({
      include: { provider: true },
      where: { id: modelId },
    });
    if (!model) throw new NotFoundException('LLM model not found.');
    if (model.provider.adapterId !== 'gemini' || !this.config.GEMINI_API_KEY)
      throw new BadRequestException('Gemini API key is not configured for this provider.');
    const adapter = new GeminiPaidAdapter(this.config.GEMINI_API_KEY);
    const result = await adapter.generateStructured({
      model: {
        id: model.id,
        providerId: model.providerId,
        providerModelId: model.providerModelId,
        status: 'ACTIVE',
      },
      operationId: `admin-test-${model.id}-${this.clock.now().getTime()}`,
      systemPrompt:
        'Return JSON with answer, usedSections, asOf, evidenceRecordHashes, handoffRequired.',
      userPrompt:
        'Return a valid empty test response. Use the current ISO timestamp and no evidence.',
      maxOutputTokens: Math.min(model.outputTokenLimit, 256),
    });
    return { modelId: model.id, providerModelId: model.providerModelId, usage: result };
  }

  async setModelStatus(modelId: string, status: 'ACTIVE' | 'INACTIVE') {
    const model = await this.prisma.llmModel.findUnique({ where: { id: modelId } });
    if (!model) throw new NotFoundException('LLM model not found.');
    return this.prisma.llmModel.update({ where: { id: modelId }, data: { status } });
  }

  async taskConfigs() {
    return this.prisma.llmTaskConfig.findMany({
      include: { primaryModel: true, fallbackModel: true, promptVersion: true },
      orderBy: { task: 'asc' },
    });
  }

  async updateTaskConfig(
    taskInput: string,
    input: {
      primaryModelId?: string;
      fallbackModelId?: string;
      promptVersionId?: string;
      enabled?: boolean;
    },
  ) {
    const parsed = llmTaskSchema.safeParse(taskInput);
    if (!parsed.success) throw new BadRequestException('Unsupported LLM task.');
    const task = parsed.data as LlmTask;
    if (
      input.primaryModelId &&
      input.fallbackModelId &&
      input.primaryModelId === input.fallbackModelId
    )
      throw new BadRequestException('Primary and fallback models must differ.');
    return this.prisma.llmTaskConfig.upsert({
      where: { task },
      create: {
        task,
        primaryModelId: input.primaryModelId,
        fallbackModelId: input.fallbackModelId,
        promptVersionId: input.promptVersionId,
        enabled: input.enabled ?? false,
      },
      update: {
        primaryModelId: input.primaryModelId,
        fallbackModelId: input.fallbackModelId,
        promptVersionId: input.promptVersionId,
        enabled: input.enabled,
        version: { increment: 1 },
      },
      include: { primaryModel: true, fallbackModel: true, promptVersion: true },
    });
  }

  async usage(query: { from?: Date; to?: Date; task?: LlmTask; studentId?: string }) {
    const items = await this.prisma.llmUsageLog.findMany({
      where: {
        createdAt: { gte: query.from, lte: query.to },
        task: query.task,
        studentId: query.studentId,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return items.map((item) => ({ ...item, estimatedMicroUsd: microUsd(item.estimatedMicroUsd) }));
  }

  async budget() {
    const value = await this.prisma.llmBudget.findUnique({ where: { id: 'default' } });
    return value
      ? {
          ...value,
          dailyLimitMicroUsd: microUsd(value.dailyLimitMicroUsd),
          monthlyLimitMicroUsd: microUsd(value.monthlyLimitMicroUsd),
        }
      : null;
  }

  async updateBudget(input: {
    dailyLimitMicroUsd: string;
    monthlyLimitMicroUsd: string;
    warningPercent?: number;
    criticalPercent?: number;
    hardLimitEnabled?: boolean;
    timezone?: string;
  }) {
    if (!/^[0-9]+$/.test(input.dailyLimitMicroUsd) || !/^[0-9]+$/.test(input.monthlyLimitMicroUsd))
      throw new BadRequestException('Budget values must be non-negative integer micro-USD values.');
    const value = await this.prisma.llmBudget.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        dailyLimitMicroUsd: BigInt(input.dailyLimitMicroUsd),
        monthlyLimitMicroUsd: BigInt(input.monthlyLimitMicroUsd),
        warningPercent: input.warningPercent ?? 80,
        criticalPercent: input.criticalPercent ?? 100,
        hardLimitEnabled: input.hardLimitEnabled ?? false,
        timezone: input.timezone ?? 'Europe/Istanbul',
      },
      update: {
        dailyLimitMicroUsd: BigInt(input.dailyLimitMicroUsd),
        monthlyLimitMicroUsd: BigInt(input.monthlyLimitMicroUsd),
        warningPercent: input.warningPercent,
        criticalPercent: input.criticalPercent,
        hardLimitEnabled: input.hardLimitEnabled,
        timezone: input.timezone,
        version: { increment: 1 },
      },
    });
    return {
      ...value,
      dailyLimitMicroUsd: microUsd(value.dailyLimitMicroUsd),
      monthlyLimitMicroUsd: microUsd(value.monthlyLimitMicroUsd),
    };
  }

  async contextReads(query: { studentId?: string }) {
    return this.prisma.agentContextRead.findMany({
      where: { studentId: query.studentId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async promptVersions(task?: LlmTask) {
    return this.prisma.llmPromptVersion.findMany({
      where: { task },
      orderBy: [{ task: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async setPromptVersion(taskInput: string, promptVersionId: string) {
    const task = llmTaskSchema.parse(taskInput) as LlmTask;
    const prompt = await this.prisma.llmPromptVersion.findFirst({
      where: { id: promptVersionId, task },
    });
    if (!prompt) throw new NotFoundException('Prompt version not found for task.');
    return this.prisma.llmTaskConfig.upsert({
      where: { task },
      create: { task, promptVersionId, enabled: false },
      update: { promptVersionId, version: { increment: 1 } },
    });
  }

  async retry(operationId: string) {
    const usage = await this.prisma.llmUsageLog.findFirst({
      where: { operationId },
      orderBy: { attempt: 'desc' },
    });
    if (!usage) throw new NotFoundException('LLM operation not found.');
    const metadata = (usage.metadata ?? {}) as Prisma.JsonObject;
    const inboxEventId =
      typeof metadata.inboxEventId === 'string' ? metadata.inboxEventId : undefined;
    if (!inboxEventId || !usage.studentId)
      throw new BadRequestException('Operation cannot be retried without an inbound source.');
    const event = await this.prisma.outboxEvent.create({
      data: {
        topic: 'llm.agent-reply',
        aggregateType: 'LlmUsageLog',
        aggregateId: usage.id,
        eventType: 'LlmRetryRequested',
        payload: {
          inboxEventId,
          studentId: usage.studentId,
          retryOperationId: `${operationId}-retry-${this.clock.now().getTime()}`,
        },
      },
    });
    return { accepted: true, outboxEventId: event.id };
  }
}
