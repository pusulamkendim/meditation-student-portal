import type { ApplicationConfig, Clock } from '@meditation/core';
import type { PrismaClient } from '@meditation/database';
import type { LlmAgentProcessor } from './llm-agent.js';
import { processPracticeResponse } from './practice-response.js';

export class InboundIntentRouter {
  constructor(
    private readonly agent: LlmAgentProcessor,
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly config: ApplicationConfig,
  ) {}

  async process(inboxEventId: string) {
    if (await processPracticeResponse(this.prisma, this.clock, this.config, inboxEventId))
      return 'processed';
    return this.agent.process(inboxEventId);
  }
}
