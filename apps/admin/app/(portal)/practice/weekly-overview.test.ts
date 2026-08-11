import { describe, expect, it } from 'vitest';

import { calculatePracticeWeeklyOverview } from './weekly-overview';

describe('calculatePracticeWeeklyOverview', () => {
  it('compares the current partial week with the same elapsed period of the previous week', () => {
    const now = new Date(2026, 7, 11, 12, 0, 0);
    const session = (status: string, startAt: Date, durationMinutes = 10) => ({
      status,
      startAt: startAt.toISOString(),
      durationMinutes,
    });
    const items = [
      session('COMPLETED', new Date(2026, 7, 10, 8, 0, 0)),
      session('COMPLETED', new Date(2026, 7, 11, 9, 0, 0)),
      session('COMPLETED', new Date(2026, 7, 3, 8, 0, 0)),
      session('COMPLETED', new Date(2026, 7, 4, 9, 0, 0)),
      session('COMPLETED', new Date(2026, 7, 5, 9, 0, 0)),
    ];

    const result = calculatePracticeWeeklyOverview(items, now);

    expect(result.current.completed).toBe(2);
    expect(result.current.minutes).toBe(20);
    expect(result.weeks.at(-2)?.completed).toBe(3);
    expect(result.change).toBe(0);
  });

  it('does not include future current-week outcomes in the incomplete count', () => {
    const now = new Date(2026, 7, 11, 12, 0, 0);
    const result = calculatePracticeWeeklyOverview(
      [
        {
          status: 'MISSED',
          startAt: new Date(2026, 7, 11, 9, 0, 0).toISOString(),
          durationMinutes: 10,
        },
        {
          status: 'MISSED',
          startAt: new Date(2026, 7, 12, 9, 0, 0).toISOString(),
          durationMinutes: 10,
        },
      ],
      now,
    );

    expect(result.incomplete).toBe(1);
  });
});
