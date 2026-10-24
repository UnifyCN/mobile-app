import dayjs, { type Dayjs } from 'dayjs';

export type ArrivalStage = 0 | 1 | 2 | 3 | 4;

export type ArrivalCountdown =
  | { state: 'pre_arrival'; days: number }
  | { state: 'first_30_days' }
  | { state: 'hidden' };

const ARRIVAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const FIRST_PERIOD_DAYS = 30;

/** Strict local YYYY-MM-DD to a local-midnight dayjs. Anything else is null. */
export const parseArrivalDate = (
  value: string | null | undefined
): Dayjs | null => {
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
  return isRealDate ? dayjs(date) : null;
};

/** Local calendar date as YYYY-MM-DD (never UTC). */
export const formatLocalDate = (date: Date | Dayjs): string =>
  dayjs(date).format('YYYY-MM-DD');

// Anchor a local calendar day to UTC midnight so 23h/25h DST days count as one day.
const toCalendarDay = (date: Dayjs): number =>
  Date.UTC(date.year(), date.month(), date.date());

/** Signed calendar days from today to arrival (tomorrow = 1). Null if invalid. */
export const getDaysUntilArrival = (
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): number | null => {
  const arrival = parseArrivalDate(arrivalDate);
  if (!arrival) return null;
  return Math.round(
    (toCalendarDay(arrival) - toCalendarDay(dayjs(today))) / MS_PER_DAY
  );
};

export const getArrivalStage = (
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): ArrivalStage | null => {
  const daysUntil = getDaysUntilArrival(arrivalDate, today);
  if (daysUntil === null) return null;
  if (daysUntil > 0) return 0;
  const arrival = parseArrivalDate(arrivalDate);
  if (!arrival) return null;
  const months = dayjs(today).startOf('day').diff(arrival, 'month');
  if (months < 3) return 1;
  if (months < 12) return 2;
  if (months < 36) return 3;
  return 4;
};

export const getArrivalCountdown = (
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): ArrivalCountdown => {
  const daysUntil = getDaysUntilArrival(arrivalDate, today);
  if (daysUntil === null) return { state: 'hidden' };
  if (daysUntil > 0) return { state: 'pre_arrival', days: daysUntil };
  if (-daysUntil < FIRST_PERIOD_DAYS) return { state: 'first_30_days' };
  return { state: 'hidden' };
};
