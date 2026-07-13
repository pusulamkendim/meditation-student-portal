const PRACTICE_RESPONSE_EVENTS = new Set([
  'PRACTICE_CHECKIN',
  'PRACTICE_REFLECTION_REQUEST',
]);

export function shouldRouteToPractice(input: {
  text?: string;
  replyEvent?: string;
  recentEvent?: string;
  hasAwaitingPractice: boolean;
}): boolean {
  const text = input.text?.trim() ?? '';
  const normalized = text.toLocaleUpperCase('tr-TR');
  if (text.startsWith('practice:')) return true;
  if (input.replyEvent) return PRACTICE_RESPONSE_EVENTS.has(input.replyEvent);
  if (input.hasAwaitingPractice && (normalized === 'YAPTIM' || normalized === 'YAPAMADIM'))
    return true;
  return Boolean(input.recentEvent && PRACTICE_RESPONSE_EVENTS.has(input.recentEvent));
}
