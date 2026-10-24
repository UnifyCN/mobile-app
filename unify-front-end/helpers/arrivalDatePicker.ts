import dayjs from 'dayjs';
import { formatLocalDate, parseArrivalDate } from '@/helpers/arrivalDate';

export const ARRIVAL_DATE_YEARS_BACK = 5;
export const ARRIVAL_DATE_YEARS_AHEAD = 3;

/** Allowed arrival dates: 5 years before today to 3 years after, local midnight. */
export const getArrivalDateRange = (today: Date = new Date()) => {
  const start = dayjs(today).startOf('day');
  return {
    min: start.subtract(ARRIVAL_DATE_YEARS_BACK, 'year').toDate(),
    max: start.add(ARRIVAL_DATE_YEARS_AHEAD, 'year').toDate(),
  };
};

export const isArrivalDateInRange = (
  value: string | null | undefined,
  today: Date = new Date()
): boolean => {
  const parsed = parseArrivalDate(value);
  if (!parsed) return false;
  const { min, max } = getArrivalDateRange(today);
  const day = formatLocalDate(parsed);
  return day >= formatLocalDate(min) && day <= formatLocalDate(max);
};

export type PickerPart = 'year' | 'month' | 'day';

type PickerRange = { min: Date; max: Date };

const sequence = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** Values the year, month, and day wheels may show for the selected date. */
export const getPickerOptions = (selected: Date, range: PickerRange) => {
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const { min, max } = range;
  const monthFrom = year === min.getFullYear() ? min.getMonth() : 0;
  const monthTo = year === max.getFullYear() ? max.getMonth() : 11;
  const atMinMonth = year === min.getFullYear() && month === min.getMonth();
  const atMaxMonth = year === max.getFullYear() && month === max.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return {
    years: sequence(min.getFullYear(), max.getFullYear()),
    months: sequence(monthFrom, monthTo),
    days: sequence(
      atMinMonth ? min.getDate() : 1,
      atMaxMonth ? max.getDate() : daysInMonth
    ),
  };
};

/** Replace one part, keep the day inside the month, then clamp into range. */
export const setPickerPart = (
  selected: Date,
  part: PickerPart,
  value: number,
  range: PickerRange
): Date => {
  const year = part === 'year' ? value : selected.getFullYear();
  const month = part === 'month' ? value : selected.getMonth();
  const day = part === 'day' ? value : selected.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const next = new Date(year, month, Math.min(day, daysInMonth));
  if (next < range.min) return new Date(range.min);
  if (next > range.max) return new Date(range.max);
  return next;
};
