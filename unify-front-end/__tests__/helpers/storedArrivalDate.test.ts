/**
 * normalizeStoredArrivalDate: the one owner that turns a stored arrival_date
 * (a hosted timestamptz or a plain date) into a calendar date. The public
 * YYYY-MM-DD parser stays strict. The suite is zone independent; run it under
 * TZ=America/Vancouver and TZ=UTC.
 */
import {
  getArrivalStage,
  getDaysUntilArrival,
  normalizeStoredArrivalDate,
  parseArrivalDate,
} from '@/helpers/arrivalDate';
import { parseCalendarDate } from '@/supabase/functions/_shared/arrivalStage';

describe('normalizeStoredArrivalDate', () => {
  it.each([
    // The exact shape the hosted API returns.
    ['2026-12-02T00:00:00+00:00', '2026-12-02'],
    // Other spellings of the same instant.
    ['2026-12-02T00:00:00Z', '2026-12-02'],
    ['2026-12-02T00:00:00.000Z', '2026-12-02'],
    ['2026-12-02T00:00:00.000000+00:00', '2026-12-02'],
    ['2026-12-02 00:00:00+00', '2026-12-02'],
    ['2026-12-02T00:00+00:00', '2026-12-02'],
    // Year, month and leap-day boundaries at UTC midnight.
    ['2026-01-01T00:00:00+00:00', '2026-01-01'],
    ['2026-12-31T00:00:00+00:00', '2026-12-31'],
    ['2028-02-29T00:00:00+00:00', '2028-02-29'],
    // The last second of the day is still that day.
    ['2026-12-02T23:59:59+00:00', '2026-12-02'],
  ])('reads %s as %s', (stored, expected) => {
    expect(normalizeStoredArrivalDate(stored)).toBe(expected);
  });

  it('never moves UTC midnight to the previous day, whatever the device zone', () => {
    // 2026-12-02T00:00Z is 2026-12-01 16:00 in Vancouver. The chosen date wins.
    // Under TZ=America/Vancouver the device day below is the 1st.
    const stored = '2026-12-02T00:00:00+00:00';
    const deviceDay = new Date(stored).getDate();
    expect([1, 2]).toContain(deviceDay);
    expect(normalizeStoredArrivalDate(stored)).toBe('2026-12-02');
  });

  it('moves another offset to UTC before it reads the date', () => {
    expect(normalizeStoredArrivalDate('2026-12-01T16:00:00-08:00')).toBe(
      '2026-12-02'
    );
    expect(normalizeStoredArrivalDate('2026-12-02T09:00:00+09:00')).toBe(
      '2026-12-02'
    );
    expect(normalizeStoredArrivalDate('2026-12-02T05:30:00+05:30')).toBe(
      '2026-12-02'
    );
    // An evening in Vancouver is already the next UTC day.
    expect(normalizeStoredArrivalDate('2026-12-01T20:00:00-08:00')).toBe(
      '2026-12-02'
    );
    expect(normalizeStoredArrivalDate('2026-12-02T01:00:00+02:00')).toBe(
      '2026-12-01'
    );
    expect(normalizeStoredArrivalDate('2027-01-01T00:30:00+01:00')).toBe(
      '2026-12-31'
    );
  });

  it('keeps a plain date as it is', () => {
    expect(normalizeStoredArrivalDate('2026-12-02')).toBe('2026-12-02');
    expect(normalizeStoredArrivalDate('2028-02-29')).toBe('2028-02-29');
  });

  it.each([
    null,
    undefined,
    '',
    'soon',
    12,
    {},
    // Impossible dates, plain and as a timestamp.
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2027-02-29',
    '2026-02-30T00:00:00+00:00',
    '2026-04-31T00:00:00+00:00',
    '2027-02-29T00:00:00+00:00',
    '2026-13-01T00:00:00+00:00',
    // Impossible times and offsets.
    '2026-12-02T24:00:00+00:00',
    '2026-12-02T00:60:00+00:00',
    '2026-12-02T00:00:60+00:00',
    '2026-12-02T00:00:00+24:00',
    '2026-12-02T00:00:00+00:60',
    // Not a stored timestamp: no offset, wrong shape, extra text.
    '2026-12-02T00:00:00',
    '2026-12-02T',
    '2026-12-2',
    '26-12-02',
    '2026/12/02',
    ' 2026-12-02',
    '2026-12-02 ',
    '2026-12-02T00:00:00+00:00 ',
    '2026-12-02T00:00:00+00:00junk',
    'Wed, 02 Dec 2026 00:00:00 GMT',
  ])('treats %p as unknown', value => {
    expect(normalizeStoredArrivalDate(value)).toBeNull();
  });

  it('is idempotent: its output normalizes to itself', () => {
    const once = normalizeStoredArrivalDate('2026-12-02T00:00:00+00:00');
    expect(normalizeStoredArrivalDate(once)).toBe(once);
  });
});

describe('the public parsers stay strict', () => {
  const stored = '2026-12-02T00:00:00+00:00';

  it('refuses a timestamp', () => {
    expect(parseCalendarDate(stored)).toBeNull();
    expect(parseArrivalDate(stored)).toBeNull();
    expect(getArrivalStage(stored, new Date(2026, 9, 23))).toBeNull();
    expect(getDaysUntilArrival(stored, new Date(2026, 9, 23))).toBeNull();
  });

  it('refuses an impossible plain date', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(getArrivalStage('2026-02-30', new Date(2026, 9, 23))).toBeNull();
  });

  it('reads a normalized stored date as the chosen day', () => {
    const today = new Date(2026, 9, 23, 12);
    const date = normalizeStoredArrivalDate(stored);
    expect(getArrivalStage(date, today)).toBe(0);
    expect(getDaysUntilArrival(date, today)).toBe(40);
  });
});
