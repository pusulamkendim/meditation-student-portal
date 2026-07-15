import { describe, expect, it } from 'vitest';
import {
  durationForPackageDay,
  generatePracticeSchedule,
  parsePracticeResponsePayload,
  createPracticeResponsePayload,
  practiceTiming,
} from './practice-schedule.js';

describe('practice schedule', () => {
  it('applies the first-package duration ladder then keeps 30 minutes', () => {
    expect([1, 7, 8, 14, 15, 21, 22, 35].map((day) => durationForPackageDay(day, true))).toEqual([
      15, 15, 20, 20, 25, 25, 30, 30,
    ]);
    expect(durationForPackageDay(1, false)).toBe(30);
  });
  it('generates each active local slot and exact reminder/check-in timing', () => {
    const sessions = generatePracticeSchedule({
      startDate: new Date('2026-07-01T00:00:00Z'),
      endExclusive: new Date('2026-07-03T00:00:00Z'),
      timezone: 'Europe/Istanbul',
      slots: [
        { slotKey: 'MORNING', localTime: '08:00', active: true },
        { slotKey: 'EVENING', localTime: '20:00', active: false },
      ],
      isFirstPackage: true,
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.startAt.toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(practiceTiming(sessions[0]!.startAt, 15).checkinDueAt.toISOString()).toBe(
      '2026-07-01T05:25:00.000Z',
    );
  });
  it('rejects DST gaps and chooses the earlier instant for folds', () => {
    expect(() =>
      generatePracticeSchedule({
        startDate: new Date('2026-03-08T00:00:00Z'),
        endExclusive: new Date('2026-03-09T00:00:00Z'),
        timezone: 'America/New_York',
        slots: [{ slotKey: 'MORNING', localTime: '02:30', active: true }],
        isFirstPackage: true,
      }),
    ).toThrow('does not exist');
    const folded = generatePracticeSchedule({
      startDate: new Date('2026-11-01T00:00:00Z'),
      endExclusive: new Date('2026-11-02T00:00:00Z'),
      timezone: 'America/New_York',
      slots: [{ slotKey: 'MORNING', localTime: '01:30', active: true }],
      isFirstPackage: true,
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
