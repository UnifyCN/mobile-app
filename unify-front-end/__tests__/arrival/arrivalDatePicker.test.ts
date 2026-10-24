import {
  getArrivalDateRange,
  isArrivalDateInRange,
  shouldStackPickerColumns,
} from '@/helpers/arrivalDatePicker';
import { formatLocalDate } from '@/helpers/arrivalDate';

const TODAY = new Date(2026, 9, 23, 12, 0, 0);

describe('getArrivalDateRange', () => {
  it('runs from exactly 5 years back to exactly 3 years ahead', () => {
    const { min, max } = getArrivalDateRange(TODAY);
    expect(formatLocalDate(min)).toBe('2021-10-23');
    expect(formatLocalDate(max)).toBe('2029-10-23');
  });

  it('uses local midnight bounds', () => {
    const { min, max } = getArrivalDateRange(TODAY);
    expect(min.getHours()).toBe(0);
    expect(max.getHours()).toBe(0);
  });

  it('keeps a leap day inside the range on the nearest real day', () => {
    const { min, max } = getArrivalDateRange(new Date(2024, 1, 29, 9));
    expect(formatLocalDate(min)).toBe('2019-02-28');
    expect(formatLocalDate(max)).toBe('2027-02-28');
  });
});

describe('isArrivalDateInRange', () => {
  it.each([
    ['2021-10-23', true],
    ['2021-10-22', false],
    ['2029-10-23', true],
    ['2029-10-24', false],
    ['2026-10-23', true],
  ])('%s -> %s', (value, expected) => {
    expect(isArrivalDateInRange(value, TODAY)).toBe(expected);
  });

  it.each(['', 'nope', '2026-02-30', null, undefined])(
    'rejects unparseable value %p',
    value => {
      expect(isArrivalDateInRange(value as string, TODAY)).toBe(false);
    }
  );
});

import { getPickerOptions, setPickerPart } from '@/helpers/arrivalDatePicker';

const range = getArrivalDateRange(TODAY);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const ymd = (d: Date) => formatLocalDate(d);

describe('getPickerOptions with a shown date outside the range', () => {
  it('adds only the shown year, month and day', () => {
    const options = getPickerOptions(at(2031, 5, 1), range);
    expect(options.years).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2031,
    ]);
    // 2031 is outside the range, so no month is range-limited.
    expect(options.months).toHaveLength(12);
    expect(options.days).toContain(1);
  });

  it('keeps a saved day after the last allowed day as the only extra day', () => {
    const options = getPickerOptions(at(2029, 10, 30), range);
    expect(options.days.at(-1)).toBe(30);
    expect(options.days.at(-2)).toBe(23);
    expect(options.months.at(-1)).toBe(9);
  });

  it('does not change the options for an in-range date', () => {
    expect(getPickerOptions(at(2029, 10, 5), range).days.at(-1)).toBe(23);
  });
});

describe('getPickerOptions', () => {
  it('lists every year in range', () => {
    expect(getPickerOptions(at(2026, 5, 5), range).years).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029,
    ]);
  });

  it('limits months in the first and last year', () => {
    expect(getPickerOptions(at(2021, 11, 5), range).months).toEqual([
      9, 10, 11,
    ]);
    expect(getPickerOptions(at(2029, 1, 5), range).months).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(getPickerOptions(at(2025, 6, 5), range).months).toHaveLength(12);
  });

  it('limits days at the range edges', () => {
    const first = getPickerOptions(at(2021, 10, 25), range).days;
    expect(first[0]).toBe(23);
    expect(first[first.length - 1]).toBe(31);
    const last = getPickerOptions(at(2029, 10, 5), range).days;
    expect(last[0]).toBe(1);
    expect(last[last.length - 1]).toBe(23);
  });

  it('uses real month lengths including leap years', () => {
    expect(getPickerOptions(at(2028, 2, 1), range).days).toHaveLength(29);
    expect(getPickerOptions(at(2027, 2, 1), range).days).toHaveLength(28);
    expect(getPickerOptions(at(2026, 4, 1), range).days).toHaveLength(30);
  });
});

describe('setPickerPart', () => {
  it('changes only the chosen part when the result is valid', () => {
    expect(ymd(setPickerPart(at(2026, 5, 5), 'day', 20, range))).toBe(
      '2026-05-20'
    );
    expect(ymd(setPickerPart(at(2026, 5, 5), 'month', 7, range))).toBe(
      '2026-08-05'
    );
    expect(ymd(setPickerPart(at(2026, 5, 5), 'year', 2028, range))).toBe(
      '2028-05-05'
    );
  });

  it('clamps the day to the new month length', () => {
    expect(ymd(setPickerPart(at(2026, 1, 31), 'month', 1, range))).toBe(
      '2026-02-28'
    );
    expect(ymd(setPickerPart(at(2028, 2, 29), 'year', 2027, range))).toBe(
      '2027-02-28'
    );
  });

  it('clamps into the allowed range', () => {
    expect(ymd(setPickerPart(at(2026, 3, 5), 'year', 2021, range))).toBe(
      '2021-10-23'
    );
    expect(ymd(setPickerPart(at(2026, 12, 31), 'year', 2029, range))).toBe(
      '2029-10-23'
    );
  });
});

describe('shouldStackPickerColumns', () => {
  const months = (language: string) =>
    Array.from({ length: 12 }, (_, m) =>
      new Intl.DateTimeFormat(language, { month: 'long' }).format(
        new Date(2026, m, 1)
      )
    );
  // Sheet content width: 272 on a 320 pt phone, 350 on a 390 pt phone.
  const SMALL = 272;
  const STANDARD = 350;

  it.each([
    ['en', STANDARD, 1],
    ['en', SMALL, 1],
    ['fr-CA', SMALL, 1],
    ['ar', STANDARD, 1.3],
    ['en', STANDARD, 1.3],
  ])(
    'keeps one row of columns for %s at width %i, text scale %s',
    (lang, width, fontScale) => {
      expect(
        shouldStackPickerColumns({
          width,
          fontScale,
          monthLabels: months(lang),
        })
      ).toBe(false);
    }
  );

  it.each([
    ['en', SMALL, 2],
    ['en', SMALL, 3],
    ['fr-CA', SMALL, 2],
    ['fr-CA', SMALL, 3],
    ['ar', SMALL, 3],
    ['en', STANDARD, 2],
  ])(
    'stacks the month above day and year for %s at width %i, text scale %s',
    (lang, width, fontScale) => {
      expect(
        shouldStackPickerColumns({
          width,
          fontScale,
          monthLabels: months(lang),
        })
      ).toBe(true);
    }
  );

  it('never stacks before the width is known', () => {
    expect(
      shouldStackPickerColumns({
        width: 0,
        fontScale: 3,
        monthLabels: months('en'),
      })
    ).toBe(false);
  });
});
