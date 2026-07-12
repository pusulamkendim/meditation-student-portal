export type PracticeSlotInput = {
  slotKey: string;
  localTime: string;
  active: boolean;
};

export type GeneratedPracticeSession = {
  serviceDate: Date;
  startAt: Date;
  durationMinutes: number;
  slotKey: string;
};

const dayMs = 86_400_000;

export function durationForPackageDay(
  day: number,
  isFirstPackage: boolean,
  override?: number,
): number {
  if (override !== undefined) return override;
  if (!isFirstPackage) return 30;
  if (day <= 7) return 15;
  if (day <= 14) return 20;
  if (day <= 21) return 25;
  return 30;
}

export function generatePracticeSchedule(input: {
  startDate: Date;
  endExclusive: Date;
  timezone: string;
  slots: PracticeSlotInput[];
  isFirstPackage: boolean;
  durationOverride?: number;
}): GeneratedPracticeSession[] {
  const result: GeneratedPracticeSession[] = [];
  for (
    let date = new Date(input.startDate);
    date < input.endExclusive;
    date = new Date(date.getTime() + dayMs)
  ) {
    const day = Math.floor((date.getTime() - input.startDate.getTime()) / dayMs) + 1;
    const durationMinutes = durationForPackageDay(
      day,
      input.isFirstPackage,
      input.durationOverride,
    );
    for (const slot of input.slots.filter((item) => item.active)) {
      result.push({
        serviceDate: new Date(date),
        startAt: zonedDateTime(date, slot.localTime, input.timezone),
        durationMinutes,
        slotKey: slot.slotKey,
      });
    }
  }
  return result;
}

export function practiceTiming(startAt: Date, durationMinutes: number) {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  return {
    reminderDueAt: new Date(startAt.getTime() - 10 * 60_000),
    checkinDueAt: new Date(endAt.getTime() + 10 * 60_000),
    endAt,
  };
}

export function endOfLocalServiceDate(serviceDate: Date, timezone: string): Date {
  return zonedDateTime(new Date(serviceDate.getTime() + dayMs), '00:00', timezone);
}

export function parsePracticeResponsePayload(
  value: string,
): { sessionId: string; nonce: string; response: 'COMPLETED' | 'SKIPPED' } | undefined {
  const match =
    /^practice:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9_-]{16,256}):(COMPLETED|SKIPPED)$/i.exec(
      value,
    );
  return match
    ? {
        sessionId: match[1]!,
        nonce: match[2]!,
        response: match[3]! as 'COMPLETED' | 'SKIPPED',
      }
    : undefined;
}

function zonedDateTime(date: Date, localTime: string, timezone: string): Date {
  const [hour, minute] = localTime.split(':').map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error('Practice time must be HH:mm.');
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const desired = Date.UTC(year, month, day, hour, minute);
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const observedInstant = (instant: number) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
  };
  for (let i = 0; i < 4; i += 1) {
    const observed = observedInstant(candidate);
    const delta = desired - observed;
    if (delta === 0) {
      const alternatives = [candidate - 3_600_000, candidate, candidate + 3_600_000].filter(
        (instant) => observedInstant(instant) === desired,
      );
      return new Date(Math.min(...alternatives));
    }
    candidate += delta;
  }
  throw new Error(`Local practice time does not exist in ${timezone}.`);
}
