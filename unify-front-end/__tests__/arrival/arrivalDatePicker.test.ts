import {
  getArrivalDateRange,
  isArrivalDateInRange,
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
