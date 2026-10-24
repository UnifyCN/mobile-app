/**
 * The edge functions build the Companion profile and the daily-tip prompt
 * lines from the arrival date, never from the stored stage.
 * Frozen "today": local 2026-10-23.
 */
import {
  buildArrivalLine,
  buildCompanionProfile,
  buildStageLine,
} from '@/supabase/functions/_shared/stageContext';
import { buildPool } from '@/supabase/functions/_shared/companionTemplates';

const TODAY = new Date(2026, 9, 23, 15, 30);

const PLANNING = "I'm still planning my move - what documents do I need to start?";
const FIRST_MONTH = 'What should I prioritize in my first month here?';

const row = (over: Record<string, unknown> = {}) => ({
  persona: 'skilled_worker',
  city: null,
  province: null,
  arrival_date: null,
  stage: null,
  goals: [],
  learning_interests: [],
  hobbies: [],
  ...over,
});

const prompts = (r: Record<string, unknown>) =>
  buildPool(buildCompanionProfile(r, TODAY)).map(s => s.prompt);

describe('buildCompanionProfile', () => {
  it('ignores a stale stored stage that says first month', () => {
    // Arrived 8 months ago, but the cache still says 1.
    const out = prompts(row({ arrival_date: '2026-02-23', stage: '1' }));
    expect(out).not.toContain(FIRST_MONTH);
    expect(out).not.toContain(PLANNING);
  });

  it('ignores a stale stored stage that says arrived for a future date', () => {
    const profile = buildCompanionProfile(
      row({ arrival_date: '2026-11-12', stage: '3' }),
      TODAY
    );
    expect(profile.stage).toBe(0);
    expect(prompts(row({ arrival_date: '2026-11-12', stage: '3' }))).toContain(PLANNING);
  });

  it('reads the hosted timestamptz arrival date as the chosen day: stage 0, planning starter', () => {
    const stored = row({ arrival_date: '2026-12-02T00:00:00+00:00', stage: null });
    const profile = buildCompanionProfile(stored, TODAY);
    expect(profile.arrival_date).toBe('2026-12-02');
    expect(profile.stage).toBe(0);
    const out = prompts(stored);
    expect(out).toContain(PLANNING);
    expect(out).toContain('How should I prepare before arriving in Canada?');
  });

  it('reads a stored timestamp from the first month as stage 1', () => {
    const profile = buildCompanionProfile(
      row({ arrival_date: '2026-10-20T00:00:00+00:00' }),
      TODAY
    );
    expect(profile.arrival_date).toBe('2026-10-20');
    expect(profile.stage).toBe(1);
  });

  it('gives unknown for an unreadable stored timestamp', () => {
    const profile = buildCompanionProfile(
      row({ arrival_date: '2026-02-30T00:00:00+00:00', stage: '1' }),
      TODAY
    );
    expect(profile.arrival_date).toBeNull();
    expect(profile.stage).toBeNull();
  });

  it('gives first month from the arrival date even when no stage is stored', () => {
    expect(prompts(row({ arrival_date: '2026-10-20', stage: null }))).toContain(
      FIRST_MONTH
    );
  });

  it('gives unknown, and no stage starter, for a missing or invalid date', () => {
    for (const arrival_date of [null, '2026-02-30', 'soon']) {
      const out = prompts(row({ arrival_date, stage: '1' }));
      expect(buildCompanionProfile(row({ arrival_date, stage: '1' }), TODAY).stage).toBeNull();
      expect(out).not.toContain(FIRST_MONTH);
      expect(out).not.toContain(PLANNING);
    }
  });

  it('works for a user with no persona', () => {
    const out = prompts(row({ persona: null, arrival_date: '2026-11-12' }));
    expect(out).toContain(PLANNING);
  });

  it('keeps the other profile fields', () => {
    const profile = buildCompanionProfile(
      row({ city: 'Toronto', goals: ['learn_something'], hobbies: undefined }),
      TODAY
    );
    expect(profile).toMatchObject({
      persona: 'skilled_worker',
      city: 'Toronto',
      goals: ['learn_something'],
      hobbies: [],
    });
  });
});

describe('buildStageLine (daily tip)', () => {
  it.each([
    [0, '- Stage (time since arrival): pre-arrival'],
    [1, '- Stage (time since arrival): arrived under 3 months'],
    [2, '- Stage (time since arrival): 3-12 months'],
    [3, '- Stage (time since arrival): 1-3 years'],
    [4, '- Stage (time since arrival): 3+ years'],
  ])('describes stage %i', (stage, line) => {
    expect(buildStageLine(stage)).toBe(line);
  });

  it('has no stage line for unknown', () => {
    expect(buildStageLine(null)).toBe('');
    expect(buildStageLine(undefined)).toBe('');
  });

  it('does not use the old ranges', () => {
    const all = [0, 1, 2, 3, 4].map(buildStageLine).join('\n');
    for (const old of ['just arrived', 'settling in', 'building foundations', 'establishing roots', 'well-established', '6-12 months', '12+ months']) {
      expect(all).not.toContain(old);
    }
  });
});

describe('buildArrivalLine (daily tip)', () => {
  it('says a future date has not arrived yet', () => {
    expect(buildArrivalLine('2026-11-12', TODAY)).toBe(
      '- Has not yet arrived in Canada'
    );
  });

  it('does not call a recent arrival not-yet-arrived', () => {
    expect(buildArrivalLine('2026-10-13', TODAY)).not.toContain('not yet');
    expect(buildArrivalLine('2026-10-23', TODAY)).not.toContain('not yet');
  });

  it('counts months for an older arrival', () => {
    expect(buildArrivalLine('2026-02-23', TODAY)).toBe(
      '- Has been in Canada for approximately 8 months'
    );
  });

  it('has no arrival line for a missing or invalid date', () => {
    expect(buildArrivalLine(null, TODAY)).toBe('');
    expect(buildArrivalLine('2026-02-30', TODAY)).toBe('');
  });
});
