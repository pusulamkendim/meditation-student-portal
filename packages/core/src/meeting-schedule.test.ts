import { describe, expect, it } from 'vitest';

import { generateMeetingOccurrences } from './meeting-schedule.js';

describe('meeting schedule', () => {
  it('creates four one-hour meetings at the same local time', () => {
    const meetings = generateMeetingOccurrences(
      new Date('2026-07-13T07:00:00.000Z'),
      'Europe/Istanbul',
    );
    expect(meetings).toHaveLength(4);
    expect(meetings.map((meeting) => meeting.occurrenceNumber)).toEqual([1, 2, 3, 4]);
    expect(
      meetings.every(
        (meeting) => meeting.endsAt.getTime() - meeting.startsAt.getTime() === 60 * 60_000,
      ),
    ).toBe(true);
    expect(
      meetings.map((meeting) =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Istanbul',
          hour: '2-digit',
          minute: '2-digit',
        }).format(meeting.startsAt),
      ),
    ).toEqual(['10:00', '10:00', '10:00', '10:00']);
  });

  it('keeps local wall-clock time across daylight-saving changes', () => {
    const meetings = generateMeetingOccurrences(
      new Date('2026-03-01T15:00:00.000Z'),
      'America/New_York',
    );
    expect(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(meetings[0]!.startsAt),
    ).toContain('10:00');
    expect(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(meetings[1]!.startsAt),
    ).toContain('10:00');
    expect(meetings[1]!.startsAt.getTime() - meetings[0]!.startsAt.getTime()).toBe(
      7 * 24 * 60 * 60_000 - 60 * 60_000,
    );
  });
});
