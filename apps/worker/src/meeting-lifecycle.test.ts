import { FakeClock } from '@meditation/core';
import { describe, expect, it } from 'vitest';

import { isReminderDue } from './meeting-lifecycle.js';

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
});
