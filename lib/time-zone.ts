type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function localParts(date: Date, timeZone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function localTimestamp(parts: LocalDateTime) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function isValidLocalDateTime(parts: LocalDateTime) {
  if (
    !Number.isInteger(parts.year)
    || parts.year < 1
    || parts.year > 9_999
    || !Number.isInteger(parts.month)
    || parts.month < 1
    || parts.month > 12
    || !Number.isInteger(parts.day)
    || parts.day < 1
    || parts.day > 31
    || !Number.isInteger(parts.hour)
    || parts.hour < 0
    || parts.hour > 23
    || !Number.isInteger(parts.minute)
    || parts.minute < 0
    || parts.minute > 59
  ) return false;

  const normalized = new Date(localTimestamp(parts));
  return normalized.getUTCFullYear() === parts.year
    && normalized.getUTCMonth() + 1 === parts.month
    && normalized.getUTCDate() === parts.day
    && normalized.getUTCHours() === parts.hour
    && normalized.getUTCMinutes() === parts.minute;
}

export function dateTimeInZone(parts: LocalDateTime, timeZone: string) {
  if (!isValidLocalDateTime(parts)) return null;
  const target = localTimestamp(parts);
  let candidate = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adjustment = target - localTimestamp(localParts(new Date(candidate), timeZone));
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const result = new Date(candidate);
  return localTimestamp(localParts(result, timeZone)) === target ? result : null;
}

export function localDateTimeInputInZone(raw: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const result = dateTimeInZone({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }, timeZone);
  return result && Number.isFinite(result.getTime()) ? result : null;
}

export function nextBroadcastMorning(
  now = new Date(),
  timeZone = "America/New_York",
) {
  const today = localParts(now, timeZone);
  const nextCalendarDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const result = dateTimeInZone({
    year: nextCalendarDay.getUTCFullYear(),
    month: nextCalendarDay.getUTCMonth() + 1,
    day: nextCalendarDay.getUTCDate(),
    hour: 6,
    minute: 0,
  }, timeZone);

  if (!result) throw new Error(`Unable to calculate the next broadcast morning for ${timeZone}.`);
  return result;
}

export function broadcastDayWindow(
  now = new Date(),
  timeZone = "America/New_York",
) {
  const localNow = localParts(now, timeZone);
  const localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  if (localNow.hour < 6) localDate.setUTCDate(localDate.getUTCDate() - 1);

  const start = dateTimeInZone({
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: 6,
    minute: 0,
  }, timeZone);
  localDate.setUTCDate(localDate.getUTCDate() + 1);
  const end = dateTimeInZone({
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: 6,
    minute: 0,
  }, timeZone);

  if (!start || !end) throw new Error(`Unable to calculate the broadcast day for ${timeZone}.`);
  return { start, end };
}
