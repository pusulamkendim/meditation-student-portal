const dayMs = 86_400_000;

export type MeetingOccurrence = {
  occurrenceNumber: number;
  startsAt: Date;
  endsAt: Date;
};

/** Builds weekly occurrences from the local wall-clock time of the first meeting. */
export function generateMeetingOccurrences(
  firstStartsAt: Date,
  timezone: string,
  durationMinutes = 60,
  count = 4,
): MeetingOccurrence[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    throw new Error('Meeting duration must be between 1 and 240 minutes.');
  }
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    throw new Error('Meeting occurrence count must be between 1 and 12.');
  }
  const parts = localParts(firstStartsAt, timezone);
  const localBase = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Array.from({ length: count }, (_, index) => {
    const localDate = new Date(localBase + index * 7 * dayMs);
    const startsAt = zonedDateTime(localDate, parts.hour, parts.minute, timezone);
    return {
      occurrenceNumber: index + 1,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    };
  });
}

export function meetingReference(seriesId: string): string {
  const compact = seriesId.replaceAll('-', '').slice(0, 10).toUpperCase();
  return `M-${compact}`;
}

function localParts(instant: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function zonedDateTime(date: Date, hour: number, minute: number, timezone: string): Date {
  const desired = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute,
  );
  let candidate = desired;
  const observedInstant = (instant: number) => {
    const parts = localParts(new Date(instant), timezone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const delta = desired - observedInstant(candidate);
    if (delta === 0) {
      const alternatives = [candidate - 3_600_000, candidate, candidate + 3_600_000].filter(
        (instant) => observedInstant(instant) === desired,
      );
      return new Date(Math.min(...alternatives));
    }
    candidate += delta;
  }
  throw new Error(`Meeting time does not exist in ${timezone}.`);
}
