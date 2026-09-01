import { PracticeSessionStatus } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateMeetingPracticeStats,
  meetingPracticeStatsVariables,
} from './meeting-practice-stats.js';

describe('meeting practice stats', () => {
  it('calculates the rolling weekly summary and lifetime completed totals', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        status: PracticeSessionStatus.COMPLETED,
        durationMinutes: 15,
        reflection: { id: 'reflection-1' },
      },
      {
        status: PracticeSessionStatus.COMPLETED,
        durationMinutes: 20,
        reflection: null,
      },
      {
        status: PracticeSessionStatus.SKIPPED,
        durationMinutes: 10,
        reflection: { id: 'reflection-2' },
      },
      {
        status: PracticeSessionStatus.MISSED,
        durationMinutes: 15,
        reflection: null,
      },
      {
        status: PracticeSessionStatus.SCHEDULED,
        durationMinutes: 25,
        reflection: null,
      },
    ]);
    const aggregate = vi.fn().mockResolvedValue({
      _count: { _all: 12 },
      _sum: { durationMinutes: 240 },
    });
    const database = { practiceSession: { findMany, aggregate } };
    const periodEnd = new Date('2026-09-01T10:00:00.000Z');

    const stats = await calculateMeetingPracticeStats(database as never, 'student-1', periodEnd);

    expect(stats).toEqual({
      periodStart: new Date('2026-08-25T10:00:00.000Z'),
      periodEndExclusive: periodEnd,
      weeklyPlannedPracticeCount: 5,
      weeklyCompletedPracticeCount: 2,
      weeklySkippedPracticeCount: 1,
      weeklyMissedPracticeCount: 1,
      weeklyCompletedMinutes: 35,
      weeklyReflectionCount: 2,
      totalCompletedPracticeCount: 12,
      totalCompletedMinutes: 240,
    });
    expect(meetingPracticeStatsVariables(stats)).toEqual({
      weeklyCompletedPracticeCountText: '2',
      weeklyPlannedPracticeCountText: '5',
      weeklyCompletedMinutesText: '35',
      weeklyReflectionCountText: '2',
      totalCompletedPracticeCountText: '12',
      totalCompletedMinutesText: '240',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        startAt: {
          gte: new Date('2026-08-25T10:00:00.000Z'),
          lt: periodEnd,
        },
        status: {
          notIn: [PracticeSessionStatus.CANCELLED, PracticeSessionStatus.SUPPRESSED],
        },
      },
      select: {
        status: true,
        durationMinutes: true,
        reflection: { select: { id: true } },
      },
    });
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        startAt: { lt: periodEnd },
        status: PracticeSessionStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { durationMinutes: true },
    });
  });

  it('uses zero when there is no completed meditation duration', async () => {
    const database = {
      practiceSession: {
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { durationMinutes: null },
        }),
      },
    };

    const stats = await calculateMeetingPracticeStats(
      database as never,
      'student-1',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(stats.weeklyCompletedMinutes).toBe(0);
    expect(stats.totalCompletedMinutes).toBe(0);
  });
});
