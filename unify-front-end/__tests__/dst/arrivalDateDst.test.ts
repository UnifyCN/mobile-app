/**
 * Calendar-day rules across daylight-saving changes. The process time zone
 * cannot change after Node starts, so `npm run test:dst` starts this file with
 * TZ=America/Toronto. `npm run test:ci` runs it after the main suite, which
 * leaves it out. The first test fails if the zone is wrong, so a missing zone
 * never passes silently.
 */
import { getArrivalStage, getDaysUntilArrival } from '@/helpers/arrivalDate';

const HOUR = 3_600_000;

describe('DST in America/Toronto', () => {
  it('runs in the Toronto zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      'America/Toronto'
    );
  });

  it('has a 23-hour spring-forward day', () => {
    const start = new Date(2026, 2, 8, 0, 0).getTime();
    const end = new Date(2026, 2, 9, 0, 0).getTime();
    expect((end - start) / HOUR).toBe(23);
  });

  it('has a 25-hour fall-back day', () => {
    const start = new Date(2026, 10, 1, 0, 0).getTime();
    const end = new Date(2026, 10, 2, 0, 0).getTime();
    expect((end - start) / HOUR).toBe(25);
  });

  it('counts the 23-hour spring-forward day as one day', () => {
    expect(getDaysUntilArrival('2026-03-09', new Date(2026, 2, 8, 0, 30))).toBe(
      1
    );
    expect(
      getDaysUntilArrival('2026-03-09', new Date(2026, 2, 8, 23, 30))
    ).toBe(1);
    expect(
      getDaysUntilArrival('2026-03-08', new Date(2026, 2, 7, 23, 59))
    ).toBe(1);
  });

  it('counts the 25-hour fall-back day as one day', () => {
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
    expect(getDaysUntilArrival('2026-03-15', new Date(2026, 2, 1, 12, 0))).toBe(
      14
    );
    expect(
      getDaysUntilArrival('2026-11-08', new Date(2026, 10, 1, 12, 0))
    ).toBe(7);
  });

  it('keeps stage and countdown on arrival day across DST', () => {
    expect(getArrivalStage('2026-03-08', new Date(2026, 2, 8, 0, 5))).toBe(1);
    expect(getArrivalStage('2026-03-09', new Date(2026, 2, 8, 23, 55))).toBe(0);
  });
});
