import dayjs, { type Dayjs } from 'dayjs';
import {
  getArrivalStage as getSharedArrivalStage,
  getDaysUntilArrival as getSharedDaysUntilArrival,
  parseCalendarDate,
  type ArrivalStage,
} from '@/supabase/functions/_shared/arrivalStage';

// The stage rule lives in the shared module so the edge functions use the same code.
export type { ArrivalStage };
// The one normalizer for a stored arrival_date (a database timestamp or a plain date).
export { normalizeStoredArrivalDate } from '@/supabase/functions/_shared/arrivalStage';

export type ArrivalCountdown =
  | { state: 'pre_arrival'; days: number }
  | { state: 'first_30_days' }
  | { state: 'hidden' };

const FIRST_PERIOD_DAYS = 30;

/** Strict local YYYY-MM-DD to a local-midnight dayjs. Anything else is null. */
export const parseArrivalDate = (
  value: string | null | undefined
): Dayjs | null => {
  const parts = parseCalendarDate(value);
  return parts ? dayjs(new Date(parts.year, parts.month - 1, parts.day)) : null;
};

/** Local calendar date as YYYY-MM-DD (never UTC). */
export const formatLocalDate = (date: Date | Dayjs): string =>
  dayjs(date).format('YYYY-MM-DD');

/** Signed calendar days from today to arrival (tomorrow = 1). Null if invalid. */
export const getDaysUntilArrival = (
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): number | null => getSharedDaysUntilArrival(arrivalDate, today);

export const getArrivalStage = (
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): ArrivalStage | null => getSharedArrivalStage(arrivalDate, today);

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
