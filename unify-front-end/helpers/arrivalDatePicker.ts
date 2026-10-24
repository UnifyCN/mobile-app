import dayjs from 'dayjs';
import { formatLocalDate, parseArrivalDate } from '@/helpers/arrivalDate';
import { typography } from '@/constants/Typography';

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

const withValue = (options: number[], value: number): number[] =>
  options.includes(value)
    ? options
    : [...options, value].sort((left, right) => left - right);

/**
 * Values the year, month, and day wheels may show for the selected date. The
 * selected value is always shown, so a saved date outside the range stays
 * visible. Every other choice is inside the range.
 */
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
    years: withValue(sequence(min.getFullYear(), max.getFullYear()), year),
    months: withValue(sequence(monthFrom, monthTo), month),
    days: withValue(
      sequence(
        atMinMonth ? min.getDate() : 1,
        atMaxMonth ? max.getDate() : daysInMonth
      ),
      selected.getDate()
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

/** Share of the row width each column gets when the three sit side by side. */
export const PICKER_COLUMN_FLEX: Record<PickerPart, number> = {
  month: 2.2,
  day: 0.8,
  year: 1.2,
};
export const PICKER_COLUMN_GAP = 4;
export const PICKER_ROW_PADDING_X = 4;

// Widest glyph advance of the semi-bold selected label, as a share of font
// size. Measured at 0.58 to 0.63 for month names and digits; rounded up so a
// borderline label stacks instead of clipping.
const GLYPH_ADVANCE = 0.65;

const longest = (labels: string[]) =>
  labels.reduce((max, label) => Math.max(max, label.length), 0);

/**
 * True when the month, day, and year labels do not fit in one row of columns
 * at the user's text scale. The picker then puts the month in its own row, so
 * every date part stays on one line at full size. An unknown width never
 * stacks.
 */
export const shouldStackPickerColumns = ({
  width,
  fontScale,
  monthLabels,
}: {
  width: number;
  fontScale: number;
  monthLabels: string[];
}): boolean => {
  if (width <= 0) return false;
  const fontSize = typography.cardTitle.fontSize * fontScale;
  const available = width - PICKER_COLUMN_GAP * 2;
  const totalFlex = Object.values(PICKER_COLUMN_FLEX).reduce(
    (sum, flex) => sum + flex,
    0
  );
  const widest: Record<PickerPart, number> = {
    month: longest(monthLabels),
    day: 2,
    year: 4,
  };
  return (Object.keys(widest) as PickerPart[]).some(part => {
    const needed =
      widest[part] * fontSize * GLYPH_ADVANCE + PICKER_ROW_PADDING_X * 2;
    return needed > (available * PICKER_COLUMN_FLEX[part]) / totalFlex;
  });
};
