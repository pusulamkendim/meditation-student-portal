import { describe, expect, it } from 'vitest';
import { sectionForQuestion } from './llm-agent.js';
import { sectionForEvent } from './conversation-context.js';

describe('agent question routing', () => {
  it('routes personal operational questions to a typed context section', () => {
    expect(sectionForQuestion('Pratik saatlerim kaçtaydı?')).toBe('PRACTICE');
    expect(sectionForQuestion('Görüşmem ne zaman?')).toBe('MEETINGS');
    expect(sectionForQuestion('Paketim ne zaman bitiyor?')).toBe('MEMBERSHIP');
    expect(sectionForQuestion('Ödeme durumum nedir?')).toBe('PAYMENT');
  });

  it('uses the active system event for short contextual follow-ups', () => {
    expect(sectionForEvent('MEETING_REMINDER_1H')).toBe('MEETINGS');
    expect(sectionForEvent('PRACTICE_REMINDER')).toBe('PRACTICE');
  });

  it('does not guess a context section for general questions', () => {
    expect(sectionForQuestion('Bugün kendimi dalgın hissediyorum.')).toBeNull();
  });
});
