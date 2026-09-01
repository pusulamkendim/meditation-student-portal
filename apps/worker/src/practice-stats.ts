import { PracticeSessionStatus, type Prisma } from '@meditation/database';

const DAY_MS = 86_400_000;

type PracticeStatsDatabase = Pick<Prisma.TransactionClient, 'practiceSession'>;

export type PracticeStats = {
  periodStart: Date;
  periodEndExclusive: Date;
  weeklyPlannedPracticeCount: number;
  weeklyCompletedPracticeCount: number;
  weeklySkippedPracticeCount: number;
  weeklyMissedPracticeCount: number;
  weeklyCompletedMinutes: number;
  weeklyReflectionCount: number;
  totalCompletedPracticeCount: number;
  totalCompletedMinutes: number;
};

export async function calculatePracticeStats(
  database: PracticeStatsDatabase,
  studentId: string,
  periodEndExclusive: Date,
): Promise<PracticeStats> {
  const periodStart = new Date(periodEndExclusive.getTime() - 7 * DAY_MS);
  const [weeklySessions, lifetime] = await Promise.all([
    database.practiceSession.findMany({
      where: {
        studentId,
        startAt: { gte: periodStart, lt: periodEndExclusive },
        status: {
          notIn: [PracticeSessionStatus.CANCELLED, PracticeSessionStatus.SUPPRESSED],
        },
      },
      select: {
        status: true,
        durationMinutes: true,
        reflection: { select: { id: true } },
      },
    }),
    database.practiceSession.aggregate({
      where: {
        studentId,
        startAt: { lt: periodEndExclusive },
        status: PracticeSessionStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { durationMinutes: true },
    }),
  ]);

  const completed = weeklySessions.filter(
    (session) => session.status === PracticeSessionStatus.COMPLETED,
  );

  return {
    periodStart,
    periodEndExclusive,
    weeklyPlannedPracticeCount: weeklySessions.length,
    weeklyCompletedPracticeCount: completed.length,
    weeklySkippedPracticeCount: weeklySessions.filter(
      (session) => session.status === PracticeSessionStatus.SKIPPED,
    ).length,
    weeklyMissedPracticeCount: weeklySessions.filter(
      (session) => session.status === PracticeSessionStatus.MISSED,
    ).length,
    weeklyCompletedMinutes: completed.reduce(
      (total, session) => total + session.durationMinutes,
      0,
    ),
    weeklyReflectionCount: weeklySessions.filter((session) => session.reflection).length,
    totalCompletedPracticeCount: lifetime._count._all,
    totalCompletedMinutes: lifetime._sum.durationMinutes ?? 0,
  };
}

export function practiceStatsVariables(stats: PracticeStats): Record<string, string> {
  return {
    weeklyCompletedPracticeCountText: String(stats.weeklyCompletedPracticeCount),
    weeklyPlannedPracticeCountText: String(stats.weeklyPlannedPracticeCount),
    weeklyCompletedMinutesText: String(stats.weeklyCompletedMinutes),
    weeklyReflectionCountText: String(stats.weeklyReflectionCount),
    totalCompletedPracticeCountText: String(stats.totalCompletedPracticeCount),
    totalCompletedMinutesText: String(stats.totalCompletedMinutes),
  };
}
