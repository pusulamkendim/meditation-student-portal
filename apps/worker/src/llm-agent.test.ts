import { describe, expect, it } from 'vitest';
import { sectionForEvent } from './conversation-context.js';

describe('agent conversation context', () => {
  it('uses the active system event for short contextual follow-ups', () => {
    expect(sectionForEvent('MEETING_REMINDER_1H')).toBe('MEETINGS');
    expect(sectionForEvent('PRACTICE_REMINDER')).toBe('PRACTICE');
  });
});
