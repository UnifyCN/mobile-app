/**
 * Reads that return the hosted timestamptz shape of arrival_date
 * ("2026-12-02T00:00:00+00:00"): getUserInfo, the public profile, and cached
 * user info. Each must hand on the plain calendar date, so the stage and the
 * stage cache are right. Frozen "today": local 2026-10-23.
 * Run it under TZ=America/Vancouver too.
 */
type OnboardingRow = {
  arrival_date: string | null;
  stage: string | null;
  persona: string | null;
  persona_other: string | null;
  city: string | null;
  province: string | null;
} | null;

let mockOnboardingRow: OnboardingRow;
let mockRequesterId: string | null;
let mockInvokeResult: { data: unknown; error: unknown };
const mockStageWrites: Array<{ values: unknown; id: unknown }> = [];

jest.mock('@/lib/supabase', () => {
  const from = (table: string) => ({
    select: () => {
      const result = (data: unknown) => ({
        eq: () => ({
          single: async () => ({ data, error: null }),
          maybeSingle: async () => ({ data, error: null }),
        }),
      });
      if (table === 'users') {
        return result({
          id: 'target',
          username: 'sam',
          first_name: 'Sam',
          created_at: '2026-01-01T00:00:00Z',
          profile_picture_url: null,
          is_premium: false,
          permissions: 'user',
        });
      }
      if (table === 'user_onboarding_profiles')
        return result(mockOnboardingRow);
      return { eq: async () => ({ count: 0, error: null }) };
    },
    update: (values: unknown) => ({
      eq: async (_col: string, id: unknown) => {
        mockStageWrites.push({ values, id });
        return { error: null };
      },
    }),
  });
  return {
    supabase: {
      from,
      auth: {
        getUser: async () => ({
          data: { user: mockRequesterId ? { id: mockRequesterId } : null },
        }),
      },
      functions: { invoke: async () => mockInvokeResult },
    },
  };
});

import { getUserInfo, type UserInfo } from '@/services/users/getUserInfo';
import { getPublicOnboardingProfile } from '@/services/onboarding/getPublicOnboardingProfile';
import { withComputedStage } from '@/hooks/users/useUserInfo';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const STORED = '2026-12-02T00:00:00+00:00';

const row = (over: Partial<NonNullable<OnboardingRow>>): OnboardingRow => ({
  arrival_date: STORED,
  stage: null,
  persona: 'skilled_worker',
  persona_other: null,
  city: null,
  province: null,
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 15, 30));
  mockStageWrites.length = 0;
  mockRequesterId = 'target';
  mockInvokeResult = { data: { profile: null }, error: null };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('getUserInfo with a stored timestamp', () => {
  it('returns the plain date and stage 0, and writes stage 0 to the cache', async () => {
    mockOnboardingRow = row({ stage: null });
    const info = await getUserInfo('target');
    await flush();
    expect(info.arrivalDate).toBe('2026-12-02');
    expect(info.stage).toBe(0);
    expect(mockStageWrites).toEqual([{ values: { stage: 0 }, id: 'target' }]);
  });

  it('does not rewrite a stage cache that already matches', async () => {
    mockOnboardingRow = row({ stage: '0' });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBe(0);
    expect(mockStageWrites).toEqual([]);
  });

  it('reads a public profile timestamp as the plain date for another user', async () => {
    mockRequesterId = 'someone-else';
    mockOnboardingRow = null;
    mockInvokeResult = {
      data: {
        profile: {
          persona: 'refugee',
          persona_other: null,
          arrival_date: '2025-10-23T00:00:00+00:00',
        },
      },
      error: null,
    };
    const info = await getUserInfo('target');
    await flush();
    expect(info.arrivalDate).toBe('2025-10-23');
    expect(info.stage).toBe(3);
    expect(mockStageWrites).toEqual([]);
  });

  it('keeps an unreadable stored value unknown and clears the cache', async () => {
    mockOnboardingRow = row({
      arrival_date: '2026-02-30T00:00:00+00:00',
      stage: '2',
    });
    const info = await getUserInfo('target');
    await flush();
    expect(info.arrivalDate).toBeNull();
    expect(info.stage).toBeNull();
    expect(mockStageWrites).toEqual([
      { values: { stage: null }, id: 'target' },
    ]);
  });
});

describe('getPublicOnboardingProfile', () => {
  it('returns the plain date for a timestamp and null for an unreadable one', async () => {
    mockInvokeResult = {
      data: {
        profile: {
          persona: 'refugee',
          persona_other: null,
          arrival_date: STORED,
        },
      },
      error: null,
    };
    await expect(getPublicOnboardingProfile('target')).resolves.toEqual({
      persona: 'refugee',
      persona_other: null,
      arrival_date: '2026-12-02',
    });

    mockInvokeResult = {
      data: {
        profile: { persona: null, persona_other: null, arrival_date: 'soon' },
      },
      error: null,
    };
    await expect(getPublicOnboardingProfile('target')).resolves.toMatchObject({
      arrival_date: null,
    });
  });

  it('still returns null when there is no profile', async () => {
    await expect(getPublicOnboardingProfile('target')).resolves.toBeNull();
  });
});

describe('cached user info', () => {
  const cached = (over: Partial<UserInfo>): UserInfo => ({
    id: 'u1',
    username: 'sam',
    firstName: 'Sam',
    createdAt: '2026-01-01T00:00:00Z',
    followingCount: 0,
    followerCount: 0,
    isPremium: false,
    permissions: 'user',
    arrivalDate: STORED,
    city: null,
    province: null,
    stage: null,
    persona: null,
    personaOther: null,
    ...over,
  });

  it('holds the plain date and stage 0 for a cached raw timestamp', () => {
    const out = withComputedStage(cached({}));
    expect(out.arrivalDate).toBe('2026-12-02');
    expect(out.stage).toBe(0);
  });

  it('returns the same object when the entry is already canonical', () => {
    const info = cached({ arrivalDate: '2026-12-02', stage: 0 });
    expect(withComputedStage(info)).toBe(info);
  });

  it('keeps an unknown date unknown', () => {
    expect(
      withComputedStage(cached({ arrivalDate: null, stage: 1 })).stage
    ).toBeNull();
  });
});
