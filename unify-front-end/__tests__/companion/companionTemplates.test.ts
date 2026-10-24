import {
  buildPool,
  OnboardingProfile,
} from '@/supabase/functions/_shared/companionTemplates';

const emptyProfile: OnboardingProfile = {
  persona: null, city: null, province: null, arrival_date: null,
  stage: null, goals: [], learning_interests: [], hobbies: [],
};

function profile(p: Partial<OnboardingProfile>): OnboardingProfile {
  return { ...emptyProfile, ...p };
}

describe('buildPool', () => {
  it('returns an empty pool for a profile with no signals', () => {
    expect(buildPool(emptyProfile)).toEqual([]);
  });

  it('includes a persona+city template when both are set', () => {
    const out = buildPool(
      profile({ persona: 'skilled_worker', city: 'Vancouver' })
    );
    const match = out.find(s => s.id === 'persona_city');
    expect(match).toBeDefined();
    expect(match!.category).toBe('Vancouver');
    expect(match!.prompt).toContain('skilled worker');
    expect(match!.prompt).toContain('Vancouver');
  });

  it('includes a persona-only template when city is missing', () => {
    const out = buildPool(profile({ persona: 'refugee' }));
    expect(out.find(s => s.id === 'persona_only')).toBeDefined();
  });

  it('includes a recent-arrival template when arrival_date is within 6 months', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 2);
    const out = buildPool(
      profile({ arrival_date: recent.toISOString().slice(0, 10) })
    );
    expect(out.find(s => s.id === 'arrival_recent')).toBeDefined();
  });

  it('includes a future-arrival template when arrival_date is in the future', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    const out = buildPool(
      profile({ arrival_date: future.toISOString().slice(0, 10) })
    );
    expect(out.find(s => s.id === 'arrival_future')).toBeDefined();
  });

  it('emits one template per learning interest', () => {
    const out = buildPool(
      profile({ learning_interests: ['healthcare', 'housing', 'pr_immigration'] })
    );
    expect(out.find(s => s.id === 'interest_healthcare')).toBeDefined();
    expect(out.find(s => s.id === 'interest_housing')).toBeDefined();
    expect(out.find(s => s.id === 'interest_pr_immigration')).toBeDefined();
  });

  it('emits one template per hobby × city when both available', () => {
    const out = buildPool(
      profile({ city: 'Toronto', hobbies: ['fitness', 'food_cooking'] })
    );
    expect(out.find(s => s.id === 'hobby_fitness_city')).toBeDefined();
    expect(out.find(s => s.id === 'hobby_food_cooking_city')).toBeDefined();
  });

  it('does not emit hobby templates when city is missing', () => {
    const out = buildPool(profile({ hobbies: ['fitness'] }));
    expect(out.find(s => s.id?.startsWith('hobby_'))).toBeUndefined();
  });

  it('sorts pool by priority descending', () => {
    const out = buildPool(
      profile({
        persona: 'skilled_worker',
        city: 'Vancouver',
        learning_interests: ['employment'],
      })
    );
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].priority).toBeGreaterThanOrEqual(out[i].priority);
    }
  });

  it('caps the pool at 30 entries', () => {
    const fat = profile({
      persona: 'skilled_worker',
      city: 'Toronto',
      province: 'ON',
      arrival_date: '2026-04-20',
      stage: '3',
      goals: ['learn_something', 'build_community', 'quick_answers'],
      learning_interests: ['documents', 'employment', 'finance', 'housing',
                           'pr_immigration', 'healthcare', 'family_kids', 'transit'],
      hobbies: ['career_growth', 'exploring_canada', 'wellness', 'technology',
                'music', 'fitness', 'personal_finance', 'family_parenting',
                'education', 'food_cooking', 'movies'],
    });
    expect(buildPool(fat).length).toBeLessThanOrEqual(30);
  });

  it('produces stable ids across calls with the same profile', () => {
    const p = profile({ persona: 'international_student', city: 'Vancouver' });
    const a = buildPool(p).map(s => s.id);
    const b = buildPool(p).map(s => s.id);
    expect(a).toEqual(b);
  });
});

describe('stage-based starters', () => {
  const PLANNING = "I'm still planning my move - what documents do I need to start?";
  const FIRST_MONTH = 'What should I prioritize in my first month here?';
  const ids = (stage: OnboardingProfile['stage']) =>
    buildPool(profile({ stage })).map(s => s.id);

  it.each([0, '0'] as const)('stage %p gets only the planning starter', stage => {
    const pool = buildPool(profile({ stage }));
    expect(pool.filter(s => s.prompt === PLANNING)).toHaveLength(1);
    expect(pool.some(s => s.prompt === FIRST_MONTH)).toBe(false);
  });

  it.each([1, '1'] as const)('stage %p gets only the first-month starter', stage => {
    const pool = buildPool(profile({ stage }));
    expect(pool.filter(s => s.prompt === FIRST_MONTH)).toHaveLength(1);
    expect(pool.some(s => s.prompt === PLANNING)).toBe(false);
  });

  it.each([2, 3, 4, '2', '3', '4', null, 'unknown', '', 7])(
    'stage %p gets neither stage starter',
    stage => {
      const pool = buildPool(profile({ stage: stage as OnboardingProfile['stage'] }));
      expect(pool.some(s => s.prompt === PLANNING)).toBe(false);
      expect(pool.some(s => s.prompt === FIRST_MONTH)).toBe(false);
    }
  );

  it('keeps the recent and future arrival starters beside the stage starters', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    const pool = buildPool(
      profile({ stage: 0, arrival_date: future.toISOString().slice(0, 10) })
    );
    expect(pool.map(s => s.id)).toEqual(
      expect.arrayContaining(['arrival_future', 'stage_planning'])
    );
    expect(ids(1)).toEqual(['stage_recently_arrived']);
  });

  it('keeps the existing priorities of the recent and future starters', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const byId = (p: Partial<OnboardingProfile>, id: string) =>
      buildPool(profile(p)).find(s => s.id === id);
    expect(byId({ arrival_date: iso(recent) }, 'arrival_recent')?.priority).toBe(9);
    expect(byId({ arrival_date: iso(future) }, 'arrival_future')?.priority).toBe(9);
  });
});
