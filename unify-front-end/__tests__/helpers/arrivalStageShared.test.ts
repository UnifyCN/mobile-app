import dayjs from 'dayjs';
import {
  getArrivalStage,
  getStageDescription,
  resolveStoredStage,
} from '@/supabase/functions/_shared/arrivalStage';

// Frozen "today": local Fri 2026-10-23, mid-afternoon.
const TODAY = new Date(2026, 9, 23, 15, 30);

describe('resolveStoredStage', () => {
  it.each([
    [0, 0],
    [4, 4],
    ['0', 0],
    ['3', 3],
  ])('reads %p as stage %p', (stored, expected) => {
    expect(resolveStoredStage(stored)).toBe(expected);
  });

  it.each([null, undefined, '', ' ', '5', '-1', '1.5', 'abc', 5, -1, 1.5, NaN, {}])(
    'reads %p as unknown',
    stored => {
      expect(resolveStoredStage(stored)).toBeNull();
    }
  );
});

describe('shared getArrivalStage', () => {
  it.each([
    ['2026-10-24', 0],
    ['2026-11-12', 0],
    ['2027-05-11', 0],
    ['2026-10-23', 1],
    ['2026-08-23', 1],
    ['2026-07-23', 2],
    ['2026-04-23', 2],
    ['2025-10-23', 3],
    ['2024-10-23', 3],
    ['2023-10-23', 4],
    ['2010-01-01', 4],
  ])('arrival %s is stage %i', (arrival, stage) => {
    expect(getArrivalStage(arrival, TODAY)).toBe(stage);
  });

  it.each([null, undefined, '', 'garbage', '2026-02-30', '2026-13-01', '2026-10-23T00:00:00Z'])(
    'arrival %p is unknown',
    arrival => {
      expect(getArrivalStage(arrival, TODAY)).toBeNull();
    }
  );

  it('counts a month-end arrival as a full month on the last day of a shorter month', () => {
    // Jan 31 -> Apr 30 is 3 months in dayjs terms, so stage 2 (not 1).
    expect(getArrivalStage('2026-01-31', new Date(2026, 3, 30))).toBe(2);
    expect(getArrivalStage('2026-01-31', new Date(2026, 3, 29))).toBe(1);
  });

  it('matches the dayjs month rule from the spec for every arrival date', () => {
    const todays = [
      new Date(2023, 2, 12, 0, 30), // US DST start
      new Date(2023, 10, 5, 23, 59), // US DST end
      new Date(2026, 1, 28),
      new Date(2026, 2, 31),
      new Date(2026, 9, 23, 15, 30),
      new Date(2027, 0, 31),
    ];
    const reference = (arrival: dayjs.Dayjs, today: Date) => {
      const t = dayjs(today).startOf('day');
      if (arrival.isAfter(t, 'day')) return 0;
      const m = t.diff(arrival, 'month');
      return m < 3 ? 1 : m < 12 ? 2 : m < 36 ? 3 : 4;
    };
    let compared = 0;
    for (
      let d = dayjs(new Date(2019, 0, 1));
      d.isBefore(dayjs(new Date(2028, 0, 1)));
      d = d.add(1, 'day')
    ) {
      for (const today of todays) {
        const expected = reference(d, today);
        const actual = getArrivalStage(d.format('YYYY-MM-DD'), today);
        if (actual !== expected) {
          throw new Error(
            `arrival ${d.format('YYYY-MM-DD')} today ${dayjs(today).format('YYYY-MM-DD')}: ${actual} != ${expected}`
          );
        }
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(19000);
  });
});

describe('getStageDescription', () => {
  it.each([
    [0, 'pre-arrival'],
    [1, 'arrived under 3 months'],
    [2, '3-12 months'],
    [3, '1-3 years'],
    [4, '3+ years'],
    ['2', '3-12 months'],
  ])('describes stage %p as %p', (stage, text) => {
    expect(getStageDescription(stage)).toBe(text);
  });

  it.each([null, undefined, 'unknown', '9', ''])(
    'has no description for %p',
    stage => {
      expect(getStageDescription(stage)).toBeNull();
    }
  );
});
