export type PracticeSlotInput = {
  slotKey: string;
  localTime: string;
  active: boolean;
  durationMinutes: number;
};

export type GeneratedPracticeSession = {
  serviceDate: Date;
  startAt: Date;
  durationMinutes: number;
  slotKey: string;
};

const dayMs = 86_400_000;

export function generatePracticeSchedule(input: {
  startDate: Date;
  endExclusive: Date;
  timezone: string;
  slots: PracticeSlotInput[];
  activeWeekdays?: readonly number[];
}): GeneratedPracticeSession[] {
  const activeWeekdays = new Set(input.activeWeekdays ?? [1, 2, 3, 4, 5, 6, 7]);
  if (!activeWeekdays.size || [...activeWeekdays].some((day) => day < 1 || day > 7))
    throw new Error('At least one valid ISO weekday is required.');
  const result: GeneratedPracticeSession[] = [];
  for (
    let date = new Date(input.startDate);
    date < input.endExclusive;
    date = new Date(date.getTime() + dayMs)
  ) {
    const isoWeekday = date.getUTCDay() || 7;
    if (!activeWeekdays.has(isoWeekday)) continue;
    for (const slot of input.slots.filter((item) => item.active)) {
      if (!Number.isInteger(slot.durationMinutes) || slot.durationMinutes < 1)
        throw new Error('Practice duration must be a positive integer.');
      result.push({
        serviceDate: new Date(date),
        startAt: zonedDateTime(date, slot.localTime, input.timezone),
        durationMinutes: slot.durationMinutes,
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
  const compact = /^p:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{16,32}):([cs])$/i.exec(value);
  if (compact) {
    const hex = Buffer.from(compact[1]!, 'base64url').toString('hex');
    if (hex.length !== 32) return undefined;
    return {
      sessionId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      nonce: compact[2]!,
      response: compact[3]!.toLowerCase() === 'c' ? 'COMPLETED' : 'SKIPPED',
    };
  }
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

export function createPracticeResponsePayload(
  sessionId: string,
  nonce: string,
  response: 'COMPLETED' | 'SKIPPED',
): string {
  const hex = sessionId.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('Practice session id must be a UUID.');
  const encodedId = Buffer.from(hex, 'hex').toString('base64url');
  const payload = `p:${encodedId}:${nonce}:${response === 'COMPLETED' ? 'c' : 's'}`;
  if (Buffer.byteLength(payload, 'utf8') > 64)
    throw new Error('Practice response payload exceeds the Telegram callback_data limit.');
  return payload;
}

export function humanizePracticeResponsePayload(value: string): string {
  const parsed = parsePracticeResponsePayload(value);
  if (!parsed) return value;
  return parsed.response === 'COMPLETED' ? 'Yaptım' : 'Yapamadım';
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
