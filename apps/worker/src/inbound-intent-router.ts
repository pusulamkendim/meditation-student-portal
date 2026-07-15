import type { ApplicationConfig, Clock, StudentContextSection } from '@meditation/core';
import type { PrismaClient } from '@meditation/database';
import type { InboundIntentClassifier, IntentRoutingDecision } from './inbound-intent.js';
import { sectionForIntentDomain } from './inbound-intent.js';
import type { LlmAgentProcessor } from './llm-agent.js';
import { processPracticeResponse } from './practice-response.js';

export class InboundIntentRouter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
    private readonly classifier: InboundIntentClassifier,
    private readonly agent: LlmAgentProcessor,
  ) {}

  async process(inboxEventId: string) {
    const inbox = await this.prisma.inboxEvent.findUniqueOrThrow({
      where: { id: inboxEventId },
      select: { processedAt: true },
    });
    if (inbox.processedAt) {
      await this.prisma.inboundIntentDecision.updateMany({
        where: { inboxEventId, status: 'CLASSIFIED' },
        data: { status: 'APPLIED', appliedAt: inbox.processedAt },
      });
      return 'ignored' as const;
    }
    const classification = await this.classifier.classify(inboxEventId);
    if (classification.status === 'not-eligible') {
      if (await processPracticeResponse(this.prisma, this.clock, this.config, inboxEventId))
        return 'practice' as const;
      return this.agent.process(inboxEventId);
    }
    if (classification.status === 'failed')
      return this.agent.handoff(
        inboxEventId,
        'Mesajını şu anda güvenle sınıflandıramadım. Herhangi bir değişiklik yapmadan not aldım.',
      );
    if (classification.status !== 'classified') return 'ignored' as const;

    const result = await this.applyDecision(classification.decision);
    await this.prisma.inboundIntentDecision.updateMany({
      where: { id: classification.decision.id, status: 'CLASSIFIED' },
      data: { status: 'APPLIED', appliedAt: this.clock.now() },
    });
    return result;
  }

  private async applyDecision(decision: IntentRoutingDecision) {
    if (decision.domain === 'SAFETY' || decision.action === 'HANDOFF')
      return this.agent.handoff(
        decision.inboxEventId,
        'Mesajını önemsiyorum ve güvenli biçimde değerlendirilmesi için not aldım.',
      );
    if (decision.action === 'CHANGE')
      return this.agent.handoff(
        decision.inboxEventId,
        'İstediğin değişikliği doğrudan uygulamadım; uygun düzenlemeyi yapmak üzere not aldım.',
      );

    if (decision.domain === 'PRACTICE') {
      const classifiedResponse = this.practiceResponseFor(decision);
      if (classifiedResponse) {
        const processed = await processPracticeResponse(
          this.prisma,
          this.clock,
          this.config,
          decision.inboxEventId,
          classifiedResponse,
        );
        if (processed) return 'practice' as const;
      }
      if (
        (decision.action === 'COMPLETE' || decision.action === 'SKIP') &&
        decision.confidence < 90
      ) {
        const clarified = await processPracticeResponse(
          this.prisma,
          this.clock,
          this.config,
          decision.inboxEventId,
        );
        if (clarified) return 'practice-clarification' as const;
      }
    }

    return this.agent.process(decision.inboxEventId, undefined, {
      domain: decision.domain,
      action: decision.action,
      confidence: decision.confidence,
      section: sectionForIntentDomain(decision.domain) as StudentContextSection | null,
    });
  }

  private practiceResponseFor(
    decision: IntentRoutingDecision,
  ): 'COMPLETED' | 'SKIPPED' | 'REFLECT' | undefined {
    if (decision.action === 'COMPLETE' && decision.confidence >= 90) return 'COMPLETED';
    if (decision.action === 'SKIP' && decision.confidence >= 90) return 'SKIPPED';
    if (decision.action === 'REFLECT' && decision.confidence >= 80) return 'REFLECT';
    return undefined;
  }
}
