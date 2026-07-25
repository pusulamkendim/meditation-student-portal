import { FakeClock } from '@meditation/core';
import { describe, expect, it } from 'vitest';

import { isReminderDue, shouldSendMeetingReminder } from './meeting-lifecycle.js';

describe('meeting lifecycle timing', () => {
  it('uses an injectable clock and remains due after a delayed worker run', () => {
    const clock = new FakeClock('2026-07-13T08:00:00.000Z');
    const meeting = new Date('2026-07-14T08:00:00.000Z');
    expect(isReminderDue(clock.now(), meeting, 24 * 60 * 60_000)).toBe(true);
    clock.advanceBy(17 * 60_000);
    expect(isReminderDue(clock.now(), meeting, 24 * 60 * 60_000)).toBe(true);
    clock.advanceTo('2026-07-14T07:59:00.000Z');
    expect(isReminderDue(clock.now(), meeting, 60 * 60_000)).toBe(true);
  });

  it('does not fire before the lead window or after the meeting starts', () => {
    const now = new Date('2026-07-13T00:00:00.000Z');
    const meeting = new Date('2026-07-14T08:00:00.000Z');
    expect(isReminderDue(now, meeting, 24 * 60 * 60_000)).toBe(false);
    expect(isReminderDue(new Date('2026-07-14T08:00:00.000Z'), meeting, 60 * 60_000)).toBe(false);
  });

  it('suppresses the 24-hour reminder when a same-day reschedule already informed the student', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');
    const rescheduledAt = new Date('2026-07-25T09:52:00.000Z');

    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-25T09:53:00.000Z'),
        startsAt,
        24 * 60 * 60_000,
        rescheduledAt,
      ),
    ).toBe(false);
    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-25T11:15:00.000Z'),
        startsAt,
        60 * 60_000,
        rescheduledAt,
      ),
    ).toBe(true);
  });

  it('suppresses an immediate 1-hour reminder when the meeting changes inside that window', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');

    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-25T11:45:00.000Z'),
        startsAt,
        60 * 60_000,
        new Date('2026-07-25T11:44:00.000Z'),
      ),
    ).toBe(false);
  });

  it('keeps normal reminders when the schedule was known before the reminder boundary', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');

    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-24T12:15:00.000Z'),
        startsAt,
        24 * 60 * 60_000,
        new Date('2026-07-20T08:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('still sends a delayed reminder when the schedule predates the boundary', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');

    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-24T15:15:00.000Z'),
        startsAt,
        24 * 60 * 60_000,
        new Date('2026-07-20T08:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('does not duplicate the scheduling message when the schedule changes at the boundary', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');
    const boundary = new Date('2026-07-24T12:15:00.000Z');

    expect(shouldSendMeetingReminder(boundary, startsAt, 24 * 60 * 60_000, boundary)).toBe(false);
  });

  it('sends at the boundary when the schedule was known beforehand', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');
    const boundary = new Date('2026-07-24T12:15:00.000Z');

    expect(
      shouldSendMeetingReminder(
        boundary,
        startsAt,
        24 * 60 * 60_000,
        new Date(boundary.getTime() - 1),
      ),
    ).toBe(true);
  });

  it('reminds normally after a meeting is moved beyond the lead window', () => {
    const startsAt = new Date('2026-08-01T12:15:00.000Z');
    const rescheduledAt = new Date('2026-07-25T09:52:00.000Z');

    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-31T12:15:00.000Z'),
        startsAt,
        24 * 60 * 60_000,
        rescheduledAt,
      ),
    ).toBe(true);
  });

  it('does not send before the lead window even when the schedule is old', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');

    expect(
      shouldSendMeetingReminder(
        new Date('2026-07-24T12:14:59.999Z'),
        startsAt,
        24 * 60 * 60_000,
        new Date('2026-07-20T08:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('never sends a reminder at or after the meeting start', () => {
    const startsAt = new Date('2026-07-25T12:15:00.000Z');
    const scheduledAt = new Date('2026-07-20T08:00:00.000Z');

    expect(shouldSendMeetingReminder(startsAt, startsAt, 60 * 60_000, scheduledAt)).toBe(false);
    expect(
      shouldSendMeetingReminder(
        new Date(startsAt.getTime() + 1),
        startsAt,
        60 * 60_000,
        scheduledAt,
      ),
    ).toBe(false);
  });
});
