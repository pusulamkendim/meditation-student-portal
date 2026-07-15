export function shouldRouteToPractice(input: {
  text?: string;
  replyEvent?: string;
  recentEvent?: string;
  hasAwaitingPractice: boolean;
}): boolean {
  const text = input.text?.trim() ?? '';
  return text.startsWith('practice:') || text.startsWith('p:');
}
