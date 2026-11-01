// UTC calendar-date helpers. A stored date (`YYYY-MM-DD`) or timestamp is read
// as the UTC calendar date it falls on; the machine's time zone is never used.

export type UtcDate = { year: number; month: number; day: number };

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** The UTC calendar date of an ISO date or timestamp, or null when it is not a real one. */
export function parseUtcDate(value: unknown): UtcDate | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = h === undefined ? 0 : Number(h);
  const minute = mi === undefined ? 0 : Number(mi);
  const second = s === undefined ? 0 : Number(s);
  if (hour > 23 || minute > 59 || second > 59) return null;

  // Built in the input year (setUTCFullYear keeps years 0-99 as written), so
  // the offset below moves the date through that year's own calendar.
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  if (
    month < 1 ||
    month > 12 ||
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (zone && zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offsetHours = Number(digits.slice(0, 2));
    const offsetMins = digits.length > 2 ? Number(digits.slice(2)) : 0;
    if (offsetHours > 23 || offsetMins > 59) return null;
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }

  const instant = new Date(local.getTime() - offsetMinutes * 60_000);
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

/** The UTC calendar date of an instant. */
export function utcDateOf(instant: Date): UtcDate {
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

/** Negative when a is before b, 0 on the same day, positive when a is after b. */
export function compareUtcDates(a: UtcDate, b: UtcDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** `2026-11-03` */
export function formatIsoDate(date: UtcDate): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** `November 3, 2026` */
export function formatLongDate(date: UtcDate): string {
  return `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}
