import type { Clock } from './clock.js';

export interface SendPolicyInput {
  dueAt: Date;
  expiresAt: Date;
  studentActive: boolean;
  messagingEnabled: boolean;
  identityActive: boolean;
  channel: 'WHATSAPP' | 'TELEGRAM';
  lastInboundAt?: Date;
  approvedTemplate: boolean;
  aggregateVersionMatches: boolean;
}
export type SendPolicyDecision = { allowed: true } | { allowed: false; reason: string };

export function evaluateSendPolicy(input: SendPolicyInput, clock: Clock): SendPolicyDecision {
  const now = clock.now();
  if (!input.studentActive) return { allowed: false, reason: 'STUDENT_INACTIVE' };
  if (!input.messagingEnabled) return { allowed: false, reason: 'MESSAGING_DISABLED' };
  if (!input.identityActive) return { allowed: false, reason: 'IDENTITY_INACTIVE' };
  if (!input.aggregateVersionMatches) return { allowed: false, reason: 'STALE_AGGREGATE' };
  if (input.dueAt > now) return { allowed: false, reason: 'NOT_DUE' };
  if (input.expiresAt <= now) return { allowed: false, reason: 'EXPIRED' };
  if (input.channel === 'WHATSAPP') {
    const windowOpen =
      input.lastInboundAt && now.getTime() - input.lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
    if (!windowOpen && !input.approvedTemplate)
      return { allowed: false, reason: 'WHATSAPP_TEMPLATE_REQUIRED' };
  }
  return { allowed: true };
}
