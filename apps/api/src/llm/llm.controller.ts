import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { llmTaskSchema } from '@meditation/core';
import { LlmTask } from '@meditation/database';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { LlmService } from './llm.service.js';

const task = (value: string) => {
  const result = llmTaskSchema.safeParse(value);
  if (!result.success) throw new BadRequestException('Unsupported LLM task.');
  return result.data as LlmTask;
};
const modelSchema = z.object({
  adapterId: z.string().min(1).max(80),
  providerModelId: z.string().min(1).max(160),
  displayName: z.string().min(1).max(160),
  inputTokenLimit: z.number().int().positive(),
  outputTokenLimit: z.number().int().positive(),
  supportsTools: z.boolean().default(false),
  supportsStructured: z.boolean().default(true),
  inputMicroUsdPerM: z.string().regex(/^\d+$/),
  outputMicroUsdPerM: z.string().regex(/^\d+$/),
});
const taskConfigSchema = z.object({
  primaryModelId: z.string().uuid().optional(),
  fallbackModelId: z.string().uuid().optional(),
  promptVersionId: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
});
const budgetSchema = z.object({
  dailyLimitMicroUsd: z.string().regex(/^\d+$/),
  monthlyLimitMicroUsd: z.string().regex(/^\d+$/),
  warningPercent: z.number().int().min(1).max(100).optional(),
  criticalPercent: z.number().int().min(1).max(200).optional(),
  hardLimitEnabled: z.boolean().optional(),
  timezone: z.string().min(1).max(80).optional(),
});

@Controller('v1/admin/llm')
@UseGuards(AdminSessionGuard)
export class LlmController {
  constructor(@Inject(LlmService) private readonly service: LlmService) {}

  @Get('providers') providers() {
    return this.service.providers();
  }
  @Post('providers/:adapterId/enable') @UseGuards(AdminCsrfGuard) enable(
    @Param('adapterId') adapterId: string,
  ) {
    return this.service.enableProvider(adapterId);
  }
  @Get('models') models() {
    return this.service.models();
  }
  @Post('models') @UseGuards(AdminCsrfGuard) createModel(@Body() body: unknown) {
    const parsed = modelSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid model payload.');
    return this.service.createModel(parsed.data);
  }
  @Post('models/:id/test') @UseGuards(AdminCsrfGuard) test(@Param('id') id: string) {
    return this.service.testModel(id);
  }
  @Post('models/:id/status') @UseGuards(AdminCsrfGuard) status(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid model status.');
    return this.service.setModelStatus(id, parsed.data.status);
  }
  @Get('task-configs') taskConfigs() {
    return this.service.taskConfigs();
  }
  @Put('task-configs/:task') @UseGuards(AdminCsrfGuard) updateTask(
    @Param('task') name: string,
    @Body() body: unknown,
  ) {
    const parsed = taskConfigSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid task config.');
    return this.service.updateTaskConfig(task(name), parsed.data);
  }
  @Get('usage') usage(@Query() query: Record<string, string | undefined>) {
    return this.service.usage({
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      task: query.task ? task(query.task) : undefined,
      studentId: query.studentId,
    });
  }
  @Get('budget') budget() {
    return this.service.budget();
  }
  @Put('budget') @UseGuards(AdminCsrfGuard) updateBudget(@Body() body: unknown) {
    const parsed = budgetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid budget payload.');
    return this.service.updateBudget(parsed.data);
  }
  @Post('jobs/:operationId/retry') @UseGuards(AdminCsrfGuard) retry(
    @Param('operationId') operationId: string,
  ) {
    return this.service.retry(operationId);
  }
  @Get('context-reads') contextReads(@Query('studentId') studentId?: string) {
    return this.service.contextReads({ studentId });
  }
  @Get('prompt-versions') prompts(@Query('task') taskName?: string) {
    return this.service.promptVersions(taskName ? task(taskName) : undefined);
  }
  @Put('task-configs/:task/prompt-version') @UseGuards(AdminCsrfGuard) setPrompt(
    @Param('task') taskName: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ promptVersionId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid prompt version payload.');
    return this.service.setPromptVersion(task(taskName), parsed.data.promptVersionId);
  }
}
