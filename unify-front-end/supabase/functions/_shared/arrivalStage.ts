// supabase/functions/_shared/arrivalStage.ts
//
// The one arrival-date stage rule. No imports, so the Expo app, jest, and the
// Deno edge functions all load this same file. The app helper in
// helpers/arrivalDate.ts delegates here.

export type ArrivalStage = 0 | 1 | 2 | 3 | 4;

const ARRIVAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Strict YYYY-MM-DD to calendar parts. Anything else, including 2026-02-30, is null. */
export function parseCalendarDate(
  value: string | null | undefined
): CalendarDate | null {
  const match =
    typeof value === 'string' ? ARRIVAL_DATE_PATTERN.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isRealDate ? { year, month, day } : null;
}

// A Postgres timestamptz as PostgREST or psql prints it, for example
// "2026-12-02T00:00:00+00:00", "2026-12-02T00:00:00.000Z" or
// "2026-12-02 00:00:00+00". An offset is required: without one the value is
// not an instant.
const STORED_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}(?::?\d{2})?)$/;
const MS_PER_MINUTE = 60_000;

const pad = (value: number, width: number): string =>
  String(value).padStart(width, '0');

/**
 * The one place that turns a stored arrival_date into the calendar date it
 * stands for. Every read boundary (database rows, edge function rows, the
 * public profile response, cached profiles) calls this, so the rest of the
 * code only ever sees YYYY-MM-DD or null.
 *
 * Semantics:
 * - The hosted column is a timestamptz. The app writes a calendar date; the
 *   database stores it as midnight UTC and returns, for example,
 *   "2026-12-02T00:00:00+00:00". The chosen date is the UTC calendar date of
 *   that instant. It is never the device date: in Vancouver that instant is
 *   still 2026-12-01 at 16:00, and the user chose 2026-12-02.
 * - A timestamp with another offset is moved to UTC first, then read the same
 *   way. A time other than midnight is not an error: the UTC date still wins.
 * - A plain YYYY-MM-DD passes through unchanged when it is a real date.
 * - Anything else is unknown (null): null, undefined, non-strings, a timestamp
 *   with no offset, an impossible date or time ("2026-02-30", hour 24), or
 *   any other text. Callers must not guess a date from such a value.
 *
 * The strict parser parseCalendarDate still accepts only YYYY-MM-DD.
 */
export function normalizeStoredArrivalDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = parseCalendarDate(value);
  if (date)
    return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;

  const match = STORED_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(part => (part === undefined ? 0 : Number(part)));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const offset = match[7];
  let offsetMinutes = 0;
  if (offset !== 'Z') {
    const digits = offset.slice(1).replace(':', '');
    const offsetHours = Number(digits.slice(0, 2));
    const offsetRest = Number(digits.slice(2) || '0');
    if (offsetHours > 23 || offsetRest > 59) return null;
    offsetMinutes =
      (offset[0] === '-' ? -1 : 1) * (offsetHours * 60 + offsetRest);
  }

  // setUTCFullYear keeps years 0 to 99 as written (Date.UTC maps them to 19xx).
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  const isRealDate =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day;
  if (!isRealDate) return null;

  const utc = new Date(instant.getTime() - offsetMinutes * MS_PER_MINUTE);
  const normalized = `${pad(utc.getUTCFullYear(), 4)}-${pad(utc.getUTCMonth() + 1, 2)}-${pad(utc.getUTCDate(), 2)}`;
  // The result must pass the strict parser, so no caller can see a date it
  // would reject.
  return parseCalendarDate(normalized) ? normalized : null;
}

const localCalendarDate = (date: Date): CalendarDate => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});

// Anchor to UTC midnight so 23h/25h DST days count as one day.
const toCalendarDay = (date: CalendarDate): number =>
  Date.UTC(date.year, date.month - 1, date.day);

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/** Signed calendar days from today to arrival (tomorrow = 1). Null if invalid. */
export function getDaysUntilArrival(
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): number | null {
  const arrival = parseCalendarDate(arrivalDate);
  if (!arrival) return null;
  return Math.round(
    (toCalendarDay(arrival) - toCalendarDay(localCalendarDate(today))) /
      MS_PER_DAY
  );
}

/**
 * Whole months from arrival to today (arrival must not be after today).
 * Same result as dayjs `today.diff(arrival, 'month')` for calendar dates:
 * a month-end arrival counts a full month on the last day of a shorter month.
 */
function wholeMonthsSince(arrival: CalendarDate, today: CalendarDate): number {
  const monthIndexDiff =
    (today.year - arrival.year) * 12 + (today.month - arrival.month);
  const anchorDay = Math.min(
    arrival.day,
    daysInMonth(today.year, today.month)
  );
  return today.day >= anchorDay ? monthIndexDiff : monthIndexDiff - 1;
}

/** Whole months since arrival. Null for a missing or invalid date, or a future date. */
export function getMonthsSinceArrival(
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): number | null {
  const arrival = parseCalendarDate(arrivalDate);
  if (!arrival) return null;
  const now = localCalendarDate(today);
  if (toCalendarDay(arrival) > toCalendarDay(now)) return null;
  return wholeMonthsSince(arrival, now);
}

/** Stage 0-4 from an arrival date and local today. Null (unknown) for a missing or invalid date. */
export function getArrivalStage(
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): ArrivalStage | null {
  const months = getMonthsSinceArrival(arrivalDate, today);
  if (months === null) {
    return parseCalendarDate(arrivalDate) === null ? null : 0;
  }
  if (months < 3) return 1;
  if (months < 12) return 2;
  if (months < 36) return 3;
  return 4;
}

/**
 * Read a stored stage cache value. The hosted column is an enum whose labels
 * are "0" to "4", so the API returns strings; a numeric column returns numbers.
 * Anything else is unknown (null).
 */
export function resolveStoredStage(value: unknown): ArrivalStage | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[0-4]$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 4 ? (n as ArrivalStage) : null;
}

export const STAGE_DESCRIPTIONS: Record<ArrivalStage, string> = {
  0: 'pre-arrival',
  1: 'arrived under 3 months',
  2: '3-12 months',
  3: '1-3 years',
  4: '3+ years',
};

/** Prompt wording for a stage. Unknown has no description. */
export function getStageDescription(stage: unknown): string | null {
  const resolved = resolveStoredStage(stage);
  return resolved === null ? null : STAGE_DESCRIPTIONS[resolved];
}
