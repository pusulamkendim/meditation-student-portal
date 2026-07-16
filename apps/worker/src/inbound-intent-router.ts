import type { LlmAgentProcessor } from './llm-agent.js';

export class InboundIntentRouter {
  constructor(private readonly agent: LlmAgentProcessor) {}

  async process(inboxEventId: string) {
    return this.agent.process(inboxEventId);
  }
}
