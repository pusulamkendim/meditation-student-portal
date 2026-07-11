export const registrationSteps = [
  'STARTED',
  'PRIVACY_NOTICE',
  'CHANNEL_OPT_IN',
  'AI_PREFERENCE',
  'NAME',
  'PAYMENT_INSTRUCTIONS',
  'PAYMENT_REVIEW',
  'COMPLETE',
] as const;
export type RegistrationStep = (typeof registrationSteps)[number];
export type RegistrationCommand =
  | 'START'
  | 'PRIVACY_ACCEPTED'
  | 'CHANNEL_ACCEPTED'
  | 'AI_ACCEPTED'
  | 'AI_DECLINED'
  | 'NAME_RECEIVED'
  | 'PAYMENT_REPORTED'
  | 'PAYMENT_APPROVED';

const transitions: Record<
  RegistrationStep,
  Partial<Record<RegistrationCommand, RegistrationStep>>
> = {
  STARTED: { START: 'PRIVACY_NOTICE' },
  PRIVACY_NOTICE: { PRIVACY_ACCEPTED: 'CHANNEL_OPT_IN' },
  CHANNEL_OPT_IN: { CHANNEL_ACCEPTED: 'AI_PREFERENCE' },
  AI_PREFERENCE: { AI_ACCEPTED: 'NAME', AI_DECLINED: 'NAME' },
  NAME: { NAME_RECEIVED: 'PAYMENT_INSTRUCTIONS' },
  PAYMENT_INSTRUCTIONS: { PAYMENT_REPORTED: 'PAYMENT_REVIEW' },
  PAYMENT_REVIEW: { PAYMENT_APPROVED: 'COMPLETE' },
  COMPLETE: {},
};

export function transitionRegistration(
  step: RegistrationStep,
  command: RegistrationCommand,
): RegistrationStep {
  const next = transitions[step][command];
  if (!next) throw new Error(`Registration command ${command} is invalid in ${step}.`);
  return next;
}

export function normalizeExactCommand(
  text: string,
): 'KAYIT' | 'RIZA_IPTAL' | 'MESAJ_IZNI_IPTAL' | undefined {
  const normalized = text
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replaceAll('İ', 'I')
    .replace(/\s+/g, ' ');
  if (normalized === 'KAYIT') return 'KAYIT';
  if (normalized === 'RIZA IPTAL') return 'RIZA_IPTAL';
  if (normalized === 'MESAJ IZNI IPTAL') return 'MESAJ_IZNI_IPTAL';
  return undefined;
}
