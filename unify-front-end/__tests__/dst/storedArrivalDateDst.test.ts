/**
 * A stored arrival timestamp is read in UTC, so daylight-saving changes in the
 * device zone cannot move it. Started with TZ=America/Toronto by
 * `npm run test:dst`; the first test fails if the zone is wrong.
 */
import {
  getArrivalStage,
  getDaysUntilArrival,
  normalizeStoredArrivalDate,
} from '@/helpers/arrivalDate';

describe('stored arrival timestamps in America/Toronto', () => {
  it('runs in the Toronto zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      'America/Toronto'
    );
  });

  it.each([
    ['2026-03-08T00:00:00+00:00', '2026-03-08'], // spring-forward day
    ['2026-03-09T00:00:00+00:00', '2026-03-09'],
    ['2026-11-01T00:00:00+00:00', '2026-11-01'], // fall-back day
    ['2026-11-02T00:00:00+00:00', '2026-11-02'],
  ])('reads %s as %s', (stored, expected) => {
    expect(normalizeStoredArrivalDate(stored)).toBe(expected);
  });

  it('counts whole days across a clock change from a stored timestamp', () => {
    const arrival = normalizeStoredArrivalDate('2026-11-02T00:00:00+00:00');
    // Evening of the fall-back day: arrival is tomorrow, not today.
    expect(getDaysUntilArrival(arrival, new Date(2026, 10, 1, 23, 30))).toBe(1);
    expect(getArrivalStage(arrival, new Date(2026, 10, 1, 23, 30))).toBe(0);
    expect(getArrivalStage(arrival, new Date(2026, 10, 2, 0, 5))).toBe(1);
  });
});
