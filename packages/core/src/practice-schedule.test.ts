import { describe, expect, it } from 'vitest';
import {
  generatePracticeSchedule,
  parsePracticeResponsePayload,
  createPracticeResponsePayload,
  practiceTiming,
} from './practice-schedule.js';

describe('practice schedule', () => {
  it('generates active local slots with independent fixed durations', () => {
    const sessions = generatePracticeSchedule({
      startDate: new Date('2026-07-01T00:00:00Z'),
      endExclusive: new Date('2026-07-03T00:00:00Z'),
      timezone: 'Europe/Istanbul',
      slots: [
        { slotKey: 'MORNING', localTime: '08:00', active: true, durationMinutes: 15 },
        { slotKey: 'EVENING', localTime: '20:00', active: true, durationMinutes: 25 },
      ],
    });
    expect(sessions).toHaveLength(4);
    expect(sessions[0]?.startAt.toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(sessions.map((item) => item.durationMinutes)).toEqual([15, 25, 15, 25]);
    expect(practiceTiming(sessions[0]!.startAt, 15).checkinDueAt.toISOString()).toBe(
      '2026-07-01T05:25:00.000Z',
    );
  });
  it('only generates selected ISO weekdays without changing slot duration', () => {
    const sessions = generatePracticeSchedule({
      startDate: new Date('2026-07-06T00:00:00Z'),
      endExclusive: new Date('2026-07-13T00:00:00Z'),
      timezone: 'Europe/Istanbul',
      activeWeekdays: [1, 3, 5],
      slots: [{ slotKey: 'MORNING', localTime: '08:00', active: true, durationMinutes: 15 }],
    });
    expect(sessions.map((item) => item.serviceDate.toISOString().slice(0, 10))).toEqual([
      '2026-07-06',
      '2026-07-08',
      '2026-07-10',
    ]);
    expect(new Set(sessions.map((item) => item.durationMinutes))).toEqual(new Set([15]));
  });
  it('rejects DST gaps and chooses the earlier instant for folds', () => {
    expect(() =>
      generatePracticeSchedule({
        startDate: new Date('2026-03-08T00:00:00Z'),
        endExclusive: new Date('2026-03-09T00:00:00Z'),
        timezone: 'America/New_York',
        slots: [{ slotKey: 'MORNING', localTime: '02:30', active: true, durationMinutes: 15 }],
      }),
    ).toThrow('does not exist');
    const folded = generatePracticeSchedule({
      startDate: new Date('2026-11-01T00:00:00Z'),
      endExclusive: new Date('2026-11-02T00:00:00Z'),
      timezone: 'America/New_York',
      slots: [{ slotKey: 'MORNING', localTime: '01:30', active: true, durationMinutes: 15 }],
    });
    expect(folded[0]?.startAt.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });
  it('parses only bound practice response payloads', () => {
    expect(
      parsePracticeResponsePayload(
        'practice:10000000-0000-4000-8000-000000000001:abcdefghijklmnop:COMPLETED',
      ),
    ).toEqual({
      sessionId: '10000000-0000-4000-8000-000000000001',
      nonce: 'abcdefghijklmnop',
      response: 'COMPLETED',
    });
    expect(parsePracticeResponsePayload('Yaptım')).toBeUndefined();
  });

  it('creates Telegram-safe compact response payloads', () => {
    const sessionId = '10000000-0000-4000-8000-000000000003';
    const nonce = '12345678901234567890123456789012';
    const payload = createPracticeResponsePayload(sessionId, nonce, 'COMPLETED');

    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(64);
    expect(parsePracticeResponsePayload(payload)).toEqual({
      sessionId,
      nonce,
      response: 'COMPLETED',
    });
  });
});
