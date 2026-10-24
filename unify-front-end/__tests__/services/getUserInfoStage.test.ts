/**
 * getUserInfo must recompute the stage from the arrival date on every read,
 * write the stage cache only for the signed-in user's own profile, and keep
 * other users' reads read-only. Frozen "today": local 2026-10-23.
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
const mockStageWrites: Array<{ values: unknown; id: unknown }> = [];
const mockSelected: Array<{ table: string; columns: string }> = [];
const mockPublicProfile = jest.fn();

jest.mock('@/lib/supabase', () => {
  const from = (table: string) => ({
    select: (columns: string) => {
      mockSelected.push({ table, columns });
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
      if (table === 'user_onboarding_profiles') return result(mockOnboardingRow);
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
    },
  };
});

jest.mock('@/services/onboarding/getPublicOnboardingProfile', () => ({
  getPublicOnboardingProfile: (id: string) => mockPublicProfile(id),
}));

import { getUserInfo } from '@/services/users/getUserInfo';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const row = (over: Partial<NonNullable<OnboardingRow>>): OnboardingRow => ({
  arrival_date: null,
  stage: null,
  persona: 'skilled_worker',
  persona_other: null,
  city: null,
  province: null,
  ...over,
});

describe('getUserInfo stage', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 15, 30));
    mockStageWrites.length = 0;
    mockSelected.length = 0;
    mockPublicProfile.mockReset().mockResolvedValue(null);
    mockRequesterId = 'target';
  });
  afterEach(() => jest.useRealTimers());

  it('recomputes a stale stored stage and rewrites the cache for the own profile', async () => {
    // Arrived 2026-02-23: 8 months ago, stage 2. Stored cache still says 1.
    mockOnboardingRow = row({ arrival_date: '2026-02-23', stage: '1' });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBe(2);
    expect(mockStageWrites).toEqual([{ values: { stage: 2 }, id: 'target' }]);
  });

  it('treats a 20-day-ahead date as stage 0 and a missing stored stage as stale', async () => {
    mockOnboardingRow = row({ arrival_date: '2026-11-12', stage: null });
    const info = await getUserInfo();
    await flush();
    expect(info.stage).toBe(0);
    expect(mockStageWrites).toEqual([{ values: { stage: 0 }, id: 'target' }]);
  });

  it('writes the cache for a user with no persona', async () => {
    mockOnboardingRow = row({ arrival_date: '2025-10-23', stage: '2', persona: null });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBe(3);
    expect(info.persona).toBeNull();
    expect(mockStageWrites).toEqual([{ values: { stage: 3 }, id: 'target' }]);
  });

  it('returns unknown (null) and clears a stored stage when the date is missing', async () => {
    mockOnboardingRow = row({ arrival_date: null, stage: '1' });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBeNull();
    expect(mockStageWrites).toEqual([{ values: { stage: null }, id: 'target' }]);
  });

  it('returns unknown and clears the cache when the date is invalid', async () => {
    mockOnboardingRow = row({ arrival_date: '2026-02-30', stage: '3' });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBeNull();
    expect(mockStageWrites).toEqual([{ values: { stage: null }, id: 'target' }]);
  });

  it('does not write when the cache already matches', async () => {
    mockOnboardingRow = row({ arrival_date: '2026-02-23', stage: '2' });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBe(2);
    expect(mockStageWrites).toEqual([]);
  });

  it('does not write when there is no profile row', async () => {
    mockOnboardingRow = null;
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBeNull();
    expect(mockStageWrites).toEqual([]);
  });

  it("computes another user's stage without writing and without private columns", async () => {
    mockRequesterId = 'someone-else';
    mockOnboardingRow = null; // RLS hides the other user's row
    mockPublicProfile.mockResolvedValue({
      persona: 'refugee',
      persona_other: null,
      arrival_date: '2025-10-23',
    });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBe(3);
    expect(info.firstName).toBeNull();
    expect(mockStageWrites).toEqual([]);
    const userColumns = mockSelected.find(s => s.table === 'users')!.columns;
    expect(userColumns).not.toContain('first_name');
  });

  it("never writes the cache for another user even when their stored stage is stale", async () => {
    mockRequesterId = 'someone-else';
    mockOnboardingRow = row({ arrival_date: '2026-02-23', stage: '1' });
    const info = await getUserInfo('target');
    await flush();
    expect(info.stage).toBe(2);
    expect(mockStageWrites).toEqual([]);
  });
});
