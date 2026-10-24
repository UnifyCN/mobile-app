/**
 * The edge functions take "today" from the device that asked, so a stage and
 * an arrival line match what that user's app shows. Callers that send no date
 * keep the server clock. A supplied value must be a real calendar date.
 */
import { getArrivalStage } from '@/helpers/arrivalDate';
import {
  LOCAL_DATE_HEADER,
  readRequestToday,
  resolveRequestToday,
} from '@/supabase/functions/_shared/requestToday';
import {
  buildArrivalLine,
  buildCompanionProfile,
} from '@/supabase/functions/_shared/stageContext';
import { buildPool } from '@/supabase/functions/_shared/companionTemplates';

// 2026-10-24 00:30 UTC is still 2026-10-23 17:30 in Vancouver.
const SERVER_NOW = new Date(Date.UTC(2026, 9, 24, 0, 30));

const expectToday = (result: ReturnType<typeof resolveRequestToday>) => {
  if (!result.ok) throw new Error('expected a valid date');
  return result.today;
};

describe('resolveRequestToday', () => {
  it('uses the supplied device date, not the server date', () => {
    const today = expectToday(resolveRequestToday('2026-10-23', SERVER_NOW));
    expect([
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
    ]).toEqual([2026, 10, 23]);
  });

  it('keeps the server clock for a legacy caller with no date', () => {
    expect(resolveRequestToday(null, SERVER_NOW)).toEqual({
      ok: true,
      today: SERVER_NOW,
    });
    expect(resolveRequestToday(undefined, SERVER_NOW)).toEqual({
      ok: true,
      today: SERVER_NOW,
    });
  });

  it.each([
    '',
    ' ',
    '2026-02-30',
    '2026-13-01',
    '2026-10-23T00:00:00Z',
    '2026/10/23',
    '20261023',
    'tomorrow',
    '2026-10-23 ',
  ])('rejects the supplied value %p', value => {
    expect(resolveRequestToday(value, SERVER_NOW).ok).toBe(false);
  });

  it('gives the same stage, starters and wording as the device for a Vancouver arrival day', () => {
    const today = expectToday(resolveRequestToday('2026-10-23', SERVER_NOW));
    // Arrival is Oct 24 for the user. On the device it is Oct 23: stage 0.
    expect(getArrivalStage('2026-10-24', today)).toBe(0);
    const pool = buildPool(
      buildCompanionProfile(
        { arrival_date: '2026-10-24', persona: 'skilled_worker' },
        today
      )
    ).map(starter => starter.id);
    expect(pool).toContain('stage_planning');
    expect(pool).not.toContain('stage_recently_arrived');
    expect(buildArrivalLine('2026-10-24', today)).toBe(
      '- Has not yet arrived in Canada'
    );
  });
});

describe('readRequestToday', () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request('https://example.test/functions/v1/personalize', { headers });

  it('reads the date from the x-local-date header', () => {
    expect(LOCAL_DATE_HEADER).toBe('x-local-date');
    const today = expectToday(
      readRequestToday(request({ 'x-local-date': '2026-10-23' }), SERVER_NOW)
    );
    expect(today.getDate()).toBe(23);
  });

  it('falls back to the server clock when the header is missing', () => {
    expect(readRequestToday(request(), SERVER_NOW)).toEqual({
      ok: true,
      today: SERVER_NOW,
    });
  });

  it('rejects an invalid header', () => {
    expect(
      readRequestToday(request({ 'x-local-date': '2026-02-30' }), SERVER_NOW).ok
    ).toBe(false);
  });
});
