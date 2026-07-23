import { z } from 'zod';

export const systemEventKeys = [
  'REGISTRATION_STARTED',
  'PRIVACY_NOTICE_SENT',
  'CHANNEL_OPT_IN_REQUEST',
  'REFLECTION_STORAGE_CONSENT_REQUEST',
  'REFLECTION_AI_CONSENT_REQUEST',
  'AGENT_REPLY_AI_CONSENT_REQUEST',
  'NAME_REQUEST',
  'REGISTRATION_ALREADY_EXISTS',
  'CONSENT_WITHDRAWN',
  'PAYMENT_INSTRUCTIONS',
  'PAYMENT_REPORTED',
  'PAYMENT_ACTION_REQUIRED',
  'PAYMENT_APPROVED',
  'PAYMENT_REFUNDED',
  'STUDENT_ACTIVATED',
  'SUBSCRIPTION_SCHEDULED',
  'SUBSCRIPTION_STARTED',
  'SUBSCRIPTION_RENEWAL_REMINDER',
  'SUBSCRIPTION_EXPIRED',
  'SUBSCRIPTION_CANCELLED',
  'PRACTICE_PLAN_CONFIRMATION_REQUEST',
  'PRACTICE_PLAN_CONFIRMED',
  'PRACTICE_PLAN_UPDATED',
  'PRACTICE_RESCHEDULED',
  'PRACTICE_REMINDER',
  'PRACTICE_CHECKIN',
  'PRACTICE_REFLECTION_REQUEST',
  'PRACTICE_REFLECTION_RECEIVED',
  'PRACTICE_COMPLETED_ACK',
  'PRACTICE_SKIPPED_ACK',
  'PRACTICE_RESPONSE_AMBIGUOUS',
  'PRACTICE_CANCELLED',
  'PRACTICE_RESTORED',
  'PRACTICE_PAUSED',
  'PRACTICE_RESUMED',
  'MEETING_SERIES_SCHEDULED',
  'MEETING_SCHEDULED',
  'MEETING_REMINDER_24H',
  'MEETING_REMINDER_1H',
  'MEETING_RESCHEDULED',
  'MEETING_CANCELLED',
  'MEETING_COMPLETED',
  'MEETING_NO_SHOW',
  'MEET_LINK_UNAVAILABLE',
  'STUDENT_CONTEXT_RESPONSE',
  'WEEKLY_SUMMARY_SHARED',
  'KNOWLEDGE_NOT_FOUND',
  'HANDOFF_OPENED',
  'HANDOFF_RESOLVED',
  'AGENT_UNAVAILABLE',
  'UNKNOWN_MESSAGE_FALLBACK',
  'UNSUPPORTED_MEDIA',
  'CHANNEL_LINK_REQUESTED',
  'CHANNEL_LINK_CONFIRMED',
  'DEFAULT_CHANNEL_CHANGED',
  'CHANNEL_OPT_IN_WITHDRAWN',
  'MESSAGING_PAUSED',
  'MESSAGING_RESUMED',
  'CHANNEL_DELIVERY_FAILED',
  'DELETION_REQUEST_RECEIVED',
  'DELETION_REQUEST_APPROVED',
  'DELETION_REQUEST_REJECTED',
  'DELETION_COMPLETED',
  'SAFETY_STUDENT_GUIDANCE',
  'SAFETY_ALERT_CLOSED',
  'ADMIN_PAYMENT_REVIEW_REQUIRED',
  'ADMIN_SUBSCRIPTION_EXPIRING',
  'ADMIN_WEEKLY_SUMMARY_READY',
  'ADMIN_HANDOFF_REQUIRED',
  'ADMIN_SAFETY_ALERT',
  'ADMIN_DELETION_REQUEST',
  'ADMIN_MESSAGE_DELIVERY_FAILED',
  'ADMIN_CALENDAR_DISCREPANCY',
  'ADMIN_KNOWLEDGE_INDEX_FAILED',
] as const;

export const systemEventKeySchema = z.enum(systemEventKeys);
export type SystemEventKey = z.infer<typeof systemEventKeySchema>;
export type EventAudience = 'STUDENT' | 'ADMIN';
export type EventChannel = 'WHATSAPP' | 'TELEGRAM' | 'EMAIL' | 'ADMIN_PANEL';

export interface EventVariableSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'number' | 'boolean' }>;
  required: string[];
  additionalProperties: false;
}

export interface SystemEventDefinition {
  key: SystemEventKey;
  audience: EventAudience;
  channels: readonly EventChannel[];
  protected: boolean;
  complianceClass: 'STANDARD' | 'PRIVACY' | 'SAFETY' | 'FINANCIAL';
  defaultTtlSeconds: number;
  variableSchema: EventVariableSchema;
}

const protectedPrefixes = ['PRIVACY_', 'CONSENT_', 'DELETION_', 'SAFETY_'];
const financialKeys = new Set<SystemEventKey>([
  'PAYMENT_INSTRUCTIONS',
  'PAYMENT_ACTION_REQUIRED',
  'PAYMENT_APPROVED',
  'PAYMENT_REFUNDED',
  'ADMIN_PAYMENT_REVIEW_REQUIRED',
]);

const noVariables = () => objectSchema();
const textVariables = (...required: string[]) =>
  objectSchema(Object.fromEntries(required.map((key) => [key, 'string'])), required);
const optionalTextVariables = (...keys: string[]) =>
  objectSchema(Object.fromEntries(keys.map((key) => [key, 'string'])));
const personalizedTextVariables = (...required: string[]) =>
  objectSchema(
    Object.fromEntries([...required, 'studentDisplayName'].map((key) => [key, 'string'])),
    required,
  );

const variableSchemas = {
  REGISTRATION_STARTED: noVariables(),
  PRIVACY_NOTICE_SENT: objectSchema({ privacyNoticeUrl: 'string', noticeVersion: 'string' }, [
    'privacyNoticeUrl',
  ]),
  CHANNEL_OPT_IN_REQUEST: textVariables('channelName'),
  REFLECTION_STORAGE_CONSENT_REQUEST: textVariables('privacyNoticeUrl'),
  REFLECTION_AI_CONSENT_REQUEST: textVariables('privacyNoticeUrl'),
  AGENT_REPLY_AI_CONSENT_REQUEST: textVariables('privacyNoticeUrl'),
  NAME_REQUEST: noVariables(),
  REGISTRATION_ALREADY_EXISTS: optionalTextVariables('studentDisplayName'),
  CONSENT_WITHDRAWN: textVariables('consentScope'),
  PAYMENT_INSTRUCTIONS: objectSchema(
    {
      amountText: 'string',
      iban: 'string',
      accountHolder: 'string',
      reference: 'string',
    },
    ['amountText', 'iban', 'accountHolder'],
  ),
  PAYMENT_REPORTED: textVariables('reference', 'reportedAtText'),
  PAYMENT_ACTION_REQUIRED: textVariables('reference', 'actionText'),
  PAYMENT_APPROVED: textVariables(
    'amountText',
    'subscriptionStartsAtText',
    'subscriptionEndsAtText',
  ),
  PAYMENT_REFUNDED: textVariables('amountText', 'refundedAtText'),
  STUDENT_ACTIVATED: personalizedTextVariables('subscriptionEndsAtText'),
  SUBSCRIPTION_SCHEDULED: textVariables('subscriptionStartsAtText', 'subscriptionEndsAtText'),
  SUBSCRIPTION_STARTED: textVariables('subscriptionEndsAtText'),
  SUBSCRIPTION_RENEWAL_REMINDER: personalizedTextVariables('subscriptionEndsAtText', 'amountText'),
  SUBSCRIPTION_EXPIRED: textVariables('expiredAtText'),
  SUBSCRIPTION_CANCELLED: textVariables('cancelledAtText'),
  PRACTICE_PLAN_CONFIRMATION_REQUEST: textVariables(
    'morningTimeText',
    'eveningTimeText',
    'durationText',
  ),
  PRACTICE_PLAN_CONFIRMED: personalizedTextVariables(
    'morningTimeText',
    'eveningTimeText',
    'durationText',
  ),
  PRACTICE_PLAN_UPDATED: textVariables('scheduleSummary'),
  PRACTICE_RESCHEDULED: textVariables('previousStartsAtText', 'startsAtText', 'durationText'),
  PRACTICE_REMINDER: personalizedTextVariables('startsAtText', 'durationText'),
  PRACTICE_CHECKIN: textVariables('durationText'),
  PRACTICE_REFLECTION_REQUEST: noVariables(),
  PRACTICE_REFLECTION_RECEIVED: noVariables(),
  PRACTICE_COMPLETED_ACK: optionalTextVariables('nextPracticeAtText'),
  PRACTICE_SKIPPED_ACK: optionalTextVariables('nextPracticeAtText'),
  PRACTICE_RESPONSE_AMBIGUOUS: noVariables(),
  PRACTICE_CANCELLED: textVariables('startsAtText'),
  PRACTICE_RESTORED: textVariables('startsAtText', 'durationText'),
  PRACTICE_PAUSED: optionalTextVariables('resumeAtText'),
  PRACTICE_RESUMED: textVariables('scheduleSummary'),
  MEETING_SERIES_SCHEDULED: personalizedTextVariables('meetingScheduleSummary', 'meetUrl'),
  MEETING_SCHEDULED: personalizedTextVariables('startsAtText', 'meetUrl'),
  MEETING_REMINDER_24H: personalizedTextVariables('startsAtText', 'meetUrl'),
  MEETING_REMINDER_1H: personalizedTextVariables('startsAtText', 'meetUrl'),
  MEETING_RESCHEDULED: personalizedTextVariables('previousStartsAtText', 'startsAtText', 'meetUrl'),
  MEETING_CANCELLED: textVariables('startsAtText'),
  MEETING_COMPLETED: optionalTextVariables('nextMeetingAtText'),
  MEETING_NO_SHOW: textVariables('startsAtText'),
  MEET_LINK_UNAVAILABLE: textVariables('startsAtText'),
  STUDENT_CONTEXT_RESPONSE: textVariables('answer', 'section'),
  WEEKLY_SUMMARY_SHARED: textVariables('summaryText'),
  KNOWLEDGE_NOT_FOUND: textVariables('questionSummary'),
  HANDOFF_OPENED: textVariables('handoffReference'),
  HANDOFF_RESOLVED: textVariables('resolutionSummary'),
  AGENT_UNAVAILABLE: noVariables(),
  UNKNOWN_MESSAGE_FALLBACK: noVariables(),
  UNSUPPORTED_MEDIA: textVariables('mediaType'),
  CHANNEL_LINK_REQUESTED: textVariables('channelName', 'linkUrl'),
  CHANNEL_LINK_CONFIRMED: textVariables('channelName'),
  DEFAULT_CHANNEL_CHANGED: textVariables('channelName'),
  CHANNEL_OPT_IN_WITHDRAWN: textVariables('channelName'),
  MESSAGING_PAUSED: optionalTextVariables('resumeAtText'),
  MESSAGING_RESUMED: noVariables(),
  CHANNEL_DELIVERY_FAILED: textVariables('channelName'),
  DELETION_REQUEST_RECEIVED: textVariables('requestReference', 'requestedAtText'),
  DELETION_REQUEST_APPROVED: textVariables('requestReference', 'deletionAtText'),
  DELETION_REQUEST_REJECTED: textVariables('requestReference', 'reasonText'),
  DELETION_COMPLETED: textVariables('requestReference', 'completedAtText'),
  SAFETY_STUDENT_GUIDANCE: textVariables('supportContactText'),
  SAFETY_ALERT_CLOSED: textVariables('closedAtText'),
  ADMIN_PAYMENT_REVIEW_REQUIRED: textVariables(
    'studentReference',
    'paymentReference',
    'reportedAtText',
  ),
  ADMIN_SUBSCRIPTION_EXPIRING: textVariables('studentReference', 'subscriptionEndsAtText'),
  ADMIN_WEEKLY_SUMMARY_READY: textVariables('studentReference', 'weekRangeText', 'summaryUrl'),
  ADMIN_HANDOFF_REQUIRED: textVariables('studentReference', 'handoffReference', 'questionSummary'),
  ADMIN_SAFETY_ALERT: textVariables('studentReference', 'alertReference', 'detectedAtText'),
  ADMIN_DELETION_REQUEST: textVariables('studentReference', 'requestReference', 'requestedAtText'),
  ADMIN_MESSAGE_DELIVERY_FAILED: textVariables('studentReference', 'channelName', 'eventKey'),
  ADMIN_CALENDAR_DISCREPANCY: textVariables('studentReference', 'meetingReference', 'detailsText'),
  ADMIN_KNOWLEDGE_INDEX_FAILED: textVariables('documentReference', 'errorReference'),
} satisfies Record<SystemEventKey, EventVariableSchema>;

function objectSchema(
  properties: Record<string, 'string' | 'number' | 'boolean'> = {},
  required: string[] = [],
): EventVariableSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, type]) => [key, { type }]),
    ),
    required,
    additionalProperties: false,
  };
}

function createDefinition(key: SystemEventKey): SystemEventDefinition {
  const admin = key.startsWith('ADMIN_');
  const safety = key.startsWith('SAFETY_') || key === 'ADMIN_SAFETY_ALERT';
  const financial = financialKeys.has(key);
  const privacy = protectedPrefixes.some((prefix) => key.startsWith(prefix));
  return {
    key,
    audience: admin ? 'ADMIN' : 'STUDENT',
    channels: admin ? ['EMAIL', 'ADMIN_PANEL'] : ['WHATSAPP', 'TELEGRAM'],
    protected: safety || financial || privacy,
    complianceClass: safety ? 'SAFETY' : financial ? 'FINANCIAL' : privacy ? 'PRIVACY' : 'STANDARD',
    defaultTtlSeconds: key.includes('REMINDER') ? 3600 : 86400,
    variableSchema: variableSchemas[key],
  };
}

export const systemEventRegistry = new Map<SystemEventKey, SystemEventDefinition>(
  systemEventKeys.map((key) => [key, createDefinition(key)]),
);

export function getSystemEvent(key: string): SystemEventDefinition {
  const parsed = systemEventKeySchema.safeParse(key);
  if (!parsed.success) throw new Error(`Unsupported system event: ${key}`);
  return systemEventRegistry.get(parsed.data)!;
}

export function validateEventVariables(
  definition: SystemEventDefinition,
  variables: Record<string, unknown>,
): void {
  const schema = definition.variableSchema;
  for (const required of schema.required) {
    if (variables[required] === undefined)
      throw new Error(`Missing required variable: ${required}`);
  }
  for (const [key, value] of Object.entries(variables)) {
    const property = schema.properties[key];
    if (!property) throw new Error(`Variable is not allowed for ${definition.key}: ${key}`);
    if (typeof value !== property.type) throw new Error(`Invalid variable type for ${key}`);
  }
}
