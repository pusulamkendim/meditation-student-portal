export interface WeeklyPracticeSession {
  status: string;
  startAt: string;
  durationMinutes: number;
}

function startOfWeek(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

export function calculatePracticeWeeklyOverview(
  items: readonly WeeklyPracticeSession[],
  now: Date,
) {
  const currentWeek = startOfWeek(now);
  const weeks = Array.from({ length: 6 }, (_, index) => {
    const start = addDays(currentWeek, (index - 5) * 7);
    const end = addDays(start, 7);
    const completedSessions = items.filter((item) => {
      const timestamp = new Date(item.startAt).getTime();
      return (
        item.status === 'COMPLETED' && timestamp >= start.getTime() && timestamp < end.getTime()
      );
    });
    return {
      start,
      completed: completedSessions.length,
      minutes: completedSessions.reduce((sum, item) => sum + item.durationMinutes, 0),
    };
  });
  const current = weeks.at(-1)!;
  const previous = weeks.at(-2)!;
  const previousComparableEnd = addDays(now, -7);
  const previousComparableCompleted = items.filter((item) => {
    const timestamp = new Date(item.startAt).getTime();
    return (
      item.status === 'COMPLETED' &&
      timestamp >= previous.start.getTime() &&
      timestamp <= previousComparableEnd.getTime()
    );
  }).length;
  const currentItems = items.filter((item) => {
    const timestamp = new Date(item.startAt).getTime();
    return timestamp >= currentWeek.getTime() && timestamp <= now.getTime();
  });

  return {
    weeks,
    current,
    change: current.completed - previousComparableCompleted,
    incomplete: currentItems.filter((item) => ['MISSED', 'SKIPPED'].includes(item.status)).length,
    awaiting: items.filter((item) => item.status === 'AWAITING_RESPONSE').length,
    maximum: Math.max(1, ...weeks.map((week) => week.completed)),
  };
}
