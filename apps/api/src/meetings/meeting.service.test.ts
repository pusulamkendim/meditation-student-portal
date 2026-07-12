import { MeetingStatus } from '@meditation/database';
import { describe, expect, it } from 'vitest';

import { meetingCreditDelta } from './meeting.service.js';

describe('meeting credit ledger rules', () => {
  it('consumes one credit for completed/no-show and reverses corrections', () => {
    expect(meetingCreditDelta(MeetingStatus.SCHEDULED, MeetingStatus.COMPLETED)).toBe(-1);
    expect(meetingCreditDelta(MeetingStatus.SCHEDULED, MeetingStatus.NO_SHOW)).toBe(-1);
    expect(meetingCreditDelta(MeetingStatus.COMPLETED, MeetingStatus.SCHEDULED)).toBe(1);
    expect(meetingCreditDelta(MeetingStatus.NO_SHOW, MeetingStatus.COMPLETED)).toBe(0);
    expect(meetingCreditDelta(MeetingStatus.SCHEDULED, MeetingStatus.CANCELLED)).toBe(0);
  });
});
