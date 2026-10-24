import {
  formatLocalDate,
  getArrivalCountdown,
  getArrivalStage,
  getDaysUntilArrival,
  parseArrivalDate,
} from '@/helpers/arrivalDate';
import { stageNumberToStageSlug } from '@/helpers/dateHelpers';

// Frozen "today": Fri 2026-10-23, 12:00 local.
const TODAY = new Date(2026, 9, 23, 12, 0, 0);

describe('getArrivalStage', () => {
  it.each([
    ['tomorrow', '2026-10-24', 0],
    ['20 days ahead', '2026-11-12', 0],
    ['200 days ahead', '2027-05-11', 0],
    ['today', '2026-10-23', 1],
    ['2 months ago', '2026-08-23', 1],
    ['3 months minus 1 day ago', '2026-07-24', 1],
    ['exactly 3 months ago', '2026-07-23', 2],
    ['6 months ago', '2026-04-23', 2],
    ['12 months minus 1 day ago', '2025-10-24', 2],
    ['exactly 12 months ago', '2025-10-23', 3],
    ['2 years ago', '2024-10-23', 3],
    ['36 months minus 1 day ago', '2023-10-24', 3],
    ['exactly 36 months ago', '2023-10-23', 4],
    ['10 years ago', '2016-10-23', 4],
  ])('%s -> stage %s', (_label, date, stage) => {
    expect(getArrivalStage(date, TODAY)).toBe(stage);
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-1-5',
    '2026-10-23T00:00:00Z',
    ' 2026-10-23',
    '23/10/2026',
  ])('invalid date %p -> unknown (null)', value => {
    expect(getArrivalStage(value, TODAY)).toBeNull();
  });

  describe('month-end arrivals (dayjs whole-month rule)', () => {
    it('Jan 31 arrival is 1 month old on Feb 28 (shorter month)', () => {
      expect(getArrivalStage('2026-01-31', new Date(2026, 1, 28))).toBe(1);
      // Prove it is a full month: Nov 30 -> Feb 28 is 3 months, stage 2.
      expect(getArrivalStage('2025-11-30', new Date(2026, 1, 28))).toBe(2);
    });

    it('Nov 30 arrival is not yet 3 months old on Feb 27', () => {
      expect(getArrivalStage('2025-11-30', new Date(2026, 1, 27))).toBe(1);
    });

    it('Feb 29 leap-day arrival hits 12 months on Feb 28 next year', () => {
      expect(getArrivalStage('2024-02-29', new Date(2025, 1, 27))).toBe(2);
      expect(getArrivalStage('2024-02-29', new Date(2025, 1, 28))).toBe(3);
    });
  });

  it.each([null, undefined, '', 'not-a-date'])(
    '%p -> unknown (null)',
    value => {
      expect(getArrivalStage(value, TODAY)).toBeNull();
    }
  );
});

describe('parseArrivalDate / formatLocalDate', () => {
  it('parses a strict date to local midnight', () => {
    const parsed = parseArrivalDate('2026-03-08');
    expect(parsed?.year()).toBe(2026);
    expect(parsed?.month()).toBe(2);
    expect(parsed?.date()).toBe(8);
    expect(parsed?.hour()).toBe(0);
  });

  it.each([null, undefined, '', '2026-02-30', '2026-10-23T00:00:00Z'])(
    'rejects %p',
    value => {
      expect(parseArrivalDate(value)).toBeNull();
    }
  );

  it('formats local date parts, not UTC', () => {
    // 23:30 local on Oct 23 is already Oct 24 in UTC for every zone west of UTC-0.5.
    expect(formatLocalDate(new Date(2026, 9, 23, 23, 30))).toBe('2026-10-23');
    expect(formatLocalDate(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });

  it('round-trips parse and format', () => {
    const parsed = parseArrivalDate('2024-02-29');
    expect(parsed && formatLocalDate(parsed)).toBe('2024-02-29');
  });
});

describe('getDaysUntilArrival', () => {
  it.each([
    ['tomorrow', '2026-10-24', 1],
    ['today', '2026-10-23', 0],
    ['yesterday', '2026-10-22', -1],
    ['40 days ahead', '2026-12-02', 40],
    ['30 days ago', '2026-09-23', -30],
  ])('%s -> %s days', (_label, date, days) => {
    expect(getDaysUntilArrival(date, TODAY)).toBe(days);
  });

  it('is null for missing or invalid dates', () => {
    expect(getDaysUntilArrival(null, TODAY)).toBeNull();
    expect(getDaysUntilArrival('2026-02-30', TODAY)).toBeNull();
  });

  it('ignores the time of day', () => {
    expect(
      getDaysUntilArrival('2026-10-24', new Date(2026, 9, 23, 0, 0, 1))
    ).toBe(1);
    expect(
      getDaysUntilArrival('2026-10-24', new Date(2026, 9, 23, 23, 59, 59))
    ).toBe(1);
  });

  describe('DST in America/Toronto', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/Toronto';
    });
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('runs in the DST zone', () => {
      // Spring forward 2026-03-08: local midnight to midnight is 23 hours.
      const start = new Date(2026, 2, 8, 0, 0).getTime();
      const end = new Date(2026, 2, 9, 0, 0).getTime();
      expect((end - start) / 3_600_000).toBe(23);
    });

    it('counts the 23-hour spring-forward day as one day', () => {
      expect(
        getDaysUntilArrival('2026-03-09', new Date(2026, 2, 8, 0, 30))
      ).toBe(1);
      expect(
        getDaysUntilArrival('2026-03-09', new Date(2026, 2, 8, 23, 30))
      ).toBe(1);
      expect(
        getDaysUntilArrival('2026-03-08', new Date(2026, 2, 7, 23, 59))
      ).toBe(1);
    });

    it('counts the 25-hour fall-back day as one day', () => {
      // Fall back 2026-11-01.
      expect(
        getDaysUntilArrival('2026-11-02', new Date(2026, 10, 1, 0, 30))
      ).toBe(1);
      expect(
        getDaysUntilArrival('2026-11-02', new Date(2026, 10, 1, 23, 30))
      ).toBe(1);
      expect(
        getDaysUntilArrival('2026-11-01', new Date(2026, 9, 31, 23, 59))
      ).toBe(1);
    });

    it('counts days across a DST change', () => {
      expect(
        getDaysUntilArrival('2026-03-15', new Date(2026, 2, 1, 12, 0))
      ).toBe(14);
      expect(
        getDaysUntilArrival('2026-11-08', new Date(2026, 10, 1, 12, 0))
      ).toBe(7);
    });

    it('keeps stage and countdown on arrival day across DST', () => {
      expect(getArrivalStage('2026-03-08', new Date(2026, 2, 8, 0, 5))).toBe(1);
      expect(getArrivalStage('2026-03-09', new Date(2026, 2, 8, 23, 55))).toBe(
        0
      );
    });
  });
});

describe('getArrivalCountdown', () => {
  it('tomorrow -> pre_arrival with 1 day', () => {
    expect(getArrivalCountdown('2026-10-24', TODAY)).toEqual({
      state: 'pre_arrival',
      days: 1,
    });
  });

  it('40 days ahead -> pre_arrival with 40 days', () => {
    expect(getArrivalCountdown('2026-12-02', TODAY)).toEqual({
      state: 'pre_arrival',
      days: 40,
    });
  });

  it('arrival day -> first_30_days', () => {
    expect(getArrivalCountdown('2026-10-23', TODAY)).toEqual({
      state: 'first_30_days',
    });
  });

  it('29 days after arrival (day 30) -> first_30_days', () => {
    expect(getArrivalCountdown('2026-09-24', TODAY)).toEqual({
      state: 'first_30_days',
    });
  });

  it('30 days after arrival -> hidden', () => {
    expect(getArrivalCountdown('2026-09-23', TODAY)).toEqual({
      state: 'hidden',
    });
  });

  it.each([null, undefined, '', '2026-02-30'])('%p -> hidden', value => {
    expect(getArrivalCountdown(value, TODAY)).toEqual({ state: 'hidden' });
  });

  it('rolls over at local midnight', () => {
    expect(
      getArrivalCountdown('2026-10-24', new Date(2026, 9, 23, 23, 59))
    ).toEqual({
      state: 'pre_arrival',
      days: 1,
    });
    expect(
      getArrivalCountdown('2026-10-24', new Date(2026, 9, 24, 0, 0))
    ).toEqual({
      state: 'first_30_days',
    });
  });
});

describe('stageNumberToStageSlug', () => {
  it.each([
    [0, 'not_arrived'],
    [1, 'arrived_0_3_months'],
    [2, 'months_3_12'],
    [3, 'years_1_3'],
    [4, 'years_3_plus'],
  ] as const)('stage %s -> %s', (stage, slug) => {
    expect(stageNumberToStageSlug(stage)).toBe(slug);
  });

  it('unknown stage (null) -> arrived_0_3_months', () => {
    expect(stageNumberToStageSlug(getArrivalStage(null, TODAY))).toBe(
      'arrived_0_3_months'
    );
  });

  it('maps the stage computed from a real date', () => {
    expect(stageNumberToStageSlug(getArrivalStage('2026-11-12', TODAY))).toBe(
      'not_arrived'
    );
  });
});
