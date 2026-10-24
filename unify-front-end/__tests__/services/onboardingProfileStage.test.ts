/**
 * The onboarding profile services keep the stage cache consistent with the
 * arrival date they write, and return the stage as a nullable number.
 * Frozen "today": local 2026-10-23.
 */
const mockUpsertPayloads: Array<Record<string, unknown>> = [];
let mockStoredRow: Record<string, unknown>;

const baseRow = {
  id: 'user-1',
  persona: null,
  persona_other: null,
  referral_source: null,
  referral_source_other: null,
  arrival_date: null,
  city: null,
  province: null,
  stage: null,
  goals: [],
  goals_other: null,
  learning_interests: [],
  learning_interests_other: null,
  hobbies: [],
  preferred_language: 'en',
  wants_reminders: false,
  onboarding_completed: true,
  onboarding_completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: Record<string, unknown>) => {
        mockUpsertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => ({
              data: { ...baseRow, ...payload },
              error: null,
            }),
          }),
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockStoredRow, error: null }),
        }),
      }),
    }),
  },
}));

import { saveOnboardingProfile } from '@/services/onboarding/saveOnboardingProfile';
import { getOnboardingProfile } from '@/services/onboarding/getOnboardingProfile';

describe('saveOnboardingProfile stage cache', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 15, 30));
    mockUpsertPayloads.length = 0;
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    ['2026-11-12', 0],
    ['2026-10-23', 1],
    ['2026-02-23', 2],
    ['2024-10-23', 3],
    ['2020-01-01', 4],
  ])('writes stage for arrival %s', async (arrival_date, stage) => {
    const { profile } = await saveOnboardingProfile('user-1', {
      arrival_date,
      onboarding_completed: true,
    });
    expect(mockUpsertPayloads[0].stage).toBe(stage);
    expect(profile.stage).toBe(stage);
  });

  it('writes the stage even when onboarding is not completed yet', async () => {
    await saveOnboardingProfile('user-1', {
      arrival_date: '2026-11-12',
      onboarding_completed: false,
    });
    expect(mockUpsertPayloads[0].stage).toBe(0);
  });

  it.each([undefined, null, '2026-02-30', 'garbage'])(
    'writes a null stage for arrival %p',
    async arrival_date => {
      const { profile } = await saveOnboardingProfile('user-1', {
        arrival_date,
        onboarding_completed: true,
      });
      expect(mockUpsertPayloads[0]).toHaveProperty('stage', null);
      expect(profile.stage).toBeNull();
    }
  );

  it('reads a date written as a local calendar day, not as UTC', async () => {
    // 2026-07-23 parsed as UTC midnight is still 2026-07-22 in negative-offset zones.
    await saveOnboardingProfile('user-1', {
      arrival_date: '2026-07-23',
      onboarding_completed: true,
    });
    expect(mockUpsertPayloads[0].stage).toBe(2);
  });
});

describe('getOnboardingProfile stage', () => {
  it.each([
    ['0', 0],
    ['3', 3],
    [2, 2],
    [null, null],
  ])('returns stored %p as %p', async (stored, expected) => {
    mockStoredRow = { ...baseRow, stage: stored };
    const profile = await getOnboardingProfile('user-1');
    expect(profile?.stage).toBe(expected);
  });
});
