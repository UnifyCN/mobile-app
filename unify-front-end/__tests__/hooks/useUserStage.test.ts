/**
 * useUserStage reads the signed-in user's profile, recomputes the stage from
 * the arrival date, and exposes the profile fields the Checklist needs.
 * Frozen "today": local 2026-10-23.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

type AuthListener = (
  event: string,
  session: { user: { id: string } } | null
) => void;

let mockAuthUserId: string | null = 'user-a';
let mockAuthListener: AuthListener | null = null;
const mockUnsubscribe = jest.fn();
const mockGetOnboardingProfile = jest.fn();
const mockSyncStageCache = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: mockAuthUserId ? { id: mockAuthUserId } : null },
      }),
      onAuthStateChange: (listener: AuthListener) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: (id: string) => mockGetOnboardingProfile(id),
}));
jest.mock('@/services/onboarding/syncStageCache', () => ({
  syncStageCache: (...args: unknown[]) => mockSyncStageCache(...args),
}));

import { useUserStage } from '@/hooks/onboarding/useUserStage';

const profile = (over: Record<string, unknown> = {}) => ({
  id: 'user-a',
  persona: 'skilled_worker',
  arrival_date: '2026-02-23', // 8 months ago: stage 2
  stage: '2',
  ...over,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useUserStage', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 9, 23, 15, 30),
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
      ],
    });
    mockAuthUserId = 'user-a';
    mockAuthListener = null;
    mockUnsubscribe.mockReset();
    mockGetOnboardingProfile.mockReset();
    mockSyncStageCache.mockReset().mockResolvedValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('exposes the profile fields and the computed stage', async () => {
    mockGetOnboardingProfile.mockResolvedValue(profile());
    const { result } = renderHook(() => useUserStage());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      userId: 'user-a',
      persona: 'skilled_worker',
      arrivalDate: '2026-02-23',
      currentStage: 2,
      previousStage: 2,
      stageChanged: false,
      error: null,
    });
    expect(typeof result.current.refreshStage).toBe('function');
    expect(mockSyncStageCache).toHaveBeenCalledWith('user-a', '2', 2);
  });

  it('recomputes a stale stored stage and flags the change', async () => {
    mockGetOnboardingProfile.mockResolvedValue(profile({ stage: '1' }));
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentStage).toBe(2);
    expect(result.current.previousStage).toBe(1);
    expect(result.current.stageChanged).toBe(true);
    expect(mockSyncStageCache).toHaveBeenCalledWith('user-a', '1', 2);
  });

  it('treats a date 20 days ahead as pre-arrival', async () => {
    mockGetOnboardingProfile.mockResolvedValue(
      profile({ arrival_date: '2026-11-12', stage: '1' })
    );
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentStage).toBe(0);
  });

  it('gives unknown (null) for a missing date and syncs the null transition', async () => {
    mockGetOnboardingProfile.mockResolvedValue(
      profile({ arrival_date: null, stage: '1' })
    );
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentStage).toBeNull();
    expect(result.current.arrivalDate).toBeNull();
    expect(result.current.stageChanged).toBe(true);
    expect(mockSyncStageCache).toHaveBeenCalledWith('user-a', '1', null);
  });

  it('gives unknown for an invalid date', async () => {
    mockGetOnboardingProfile.mockResolvedValue(
      profile({ arrival_date: '2026-02-30', stage: null })
    );
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentStage).toBeNull();
    expect(result.current.stageChanged).toBe(false);
  });

  it('computes and syncs the stage for a user with no persona', async () => {
    mockGetOnboardingProfile.mockResolvedValue(
      profile({ persona: null, stage: null })
    );
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.persona).toBeNull();
    expect(result.current.currentStage).toBe(2);
    expect(mockSyncStageCache).toHaveBeenCalledWith('user-a', null, 2);
  });

  it('gives unknown and does not sync when the user has no profile row', async () => {
    mockGetOnboardingProfile.mockResolvedValue(null);
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      userId: 'user-a',
      currentStage: null,
      arrivalDate: null,
      persona: null,
      error: null,
    });
    expect(mockSyncStageCache).not.toHaveBeenCalled();
  });

  it('keeps the computed stage when the cache write fails', async () => {
    mockSyncStageCache.mockRejectedValue(new Error('denied'));
    mockGetOnboardingProfile.mockResolvedValue(profile({ stage: '1' }));
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentStage).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('reports a failed profile read', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetOnboardingProfile.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('offline');
    expect(result.current.currentStage).toBeNull();
  });

  it('refreshStage reloads the profile after the date changes', async () => {
    mockGetOnboardingProfile.mockResolvedValue(profile());
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.currentStage).toBe(2));

    mockGetOnboardingProfile.mockResolvedValue(
      profile({ arrival_date: '2026-11-12', stage: '0' })
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.refreshStage();
      await pending;
    });
    expect(pending).toBeInstanceOf(Promise);
    expect(result.current.currentStage).toBe(0);
    expect(result.current.arrivalDate).toBe('2026-11-12');
    // A refresh keeps the current data on screen: no loading flash.
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the newest refresh when an older read finishes last', async () => {
    mockGetOnboardingProfile.mockResolvedValueOnce(profile());
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.currentStage).toBe(2));

    const slowOld = deferred<ReturnType<typeof profile>>();
    mockGetOnboardingProfile.mockReturnValueOnce(slowOld.promise);
    mockGetOnboardingProfile.mockResolvedValueOnce(
      profile({ arrival_date: '2026-11-12', stage: '0' })
    );
    let first!: Promise<void>;
    let second!: Promise<void>;
    mockGetOnboardingProfile.mockClear();
    await act(async () => {
      first = result.current.refreshStage();
      await waitFor(() => expect(mockGetOnboardingProfile).toHaveBeenCalledTimes(1));
      second = result.current.refreshStage();
      await second;
    });
    expect(result.current.currentStage).toBe(0);

    await act(async () => {
      slowOld.resolve(profile({ arrival_date: '2020-01-01', stage: '4' }));
      await first;
    });
    expect(result.current.currentStage).toBe(0);
    expect(result.current.arrivalDate).toBe('2026-11-12');
  });

  it('clears the old account at once and ignores its delayed profile read', async () => {
    const slowA = deferred<ReturnType<typeof profile>>();
    mockGetOnboardingProfile.mockImplementation((id: string) =>
      id === 'user-a'
        ? slowA.promise
        : Promise.resolve(
            profile({ id: 'user-b', persona: 'refugee', arrival_date: '2026-10-23', stage: '1' })
          )
    );
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(mockGetOnboardingProfile).toHaveBeenCalledWith('user-a'));

    mockAuthUserId = 'user-b';
    await act(async () => {
      mockAuthListener!('SIGNED_IN', { user: { id: 'user-b' } });
    });
    await waitFor(() => expect(result.current.userId).toBe('user-b'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.persona).toBe('refugee');
    expect(result.current.currentStage).toBe(1);

    // Account A's slow read finally lands: it must not overwrite account B.
    await act(async () => {
      slowA.resolve(profile());
      await slowA.promise;
    });
    expect(result.current.userId).toBe('user-b');
    expect(result.current.persona).toBe('refugee');
    expect(result.current.currentStage).toBe(1);
    expect(mockSyncStageCache).not.toHaveBeenCalledWith('user-a', expect.anything(), expect.anything());
  });

  it('shows no stage for the old account while the new account loads', async () => {
    mockGetOnboardingProfile.mockResolvedValueOnce(profile());
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.currentStage).toBe(2));

    const slowB = deferred<ReturnType<typeof profile>>();
    mockGetOnboardingProfile.mockReturnValue(slowB.promise);
    mockAuthUserId = 'user-b';
    await act(async () => {
      mockAuthListener!('SIGNED_IN', { user: { id: 'user-b' } });
    });
    expect(result.current.currentStage).toBeNull();
    expect(result.current.persona).toBeNull();
    expect(result.current.arrivalDate).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      slowB.resolve(profile({ id: 'user-b', arrival_date: '2020-01-01', stage: '4' }));
      await slowB.promise;
    });
    await waitFor(() => expect(result.current.currentStage).toBe(4));
  });

  it('clears everything on sign-out and ignores a read that finishes afterwards', async () => {
    const slowA = deferred<ReturnType<typeof profile>>();
    mockGetOnboardingProfile.mockReturnValue(slowA.promise);
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(mockGetOnboardingProfile).toHaveBeenCalled());

    mockAuthUserId = null;
    await act(async () => {
      mockAuthListener!('SIGNED_OUT', null);
    });
    await act(async () => {
      slowA.resolve(profile());
      await slowA.promise;
    });
    expect(result.current.userId).toBeNull();
    expect(result.current.currentStage).toBeNull();
    expect(result.current.persona).toBeNull();
    expect(mockSyncStageCache).not.toHaveBeenCalled();
  });

  it('ignores token refresh events for the same account', async () => {
    mockGetOnboardingProfile.mockResolvedValue(profile());
    const { result } = renderHook(() => useUserStage());
    await waitFor(() => expect(result.current.currentStage).toBe(2));
    mockGetOnboardingProfile.mockClear();
    await act(async () => {
      mockAuthListener!('TOKEN_REFRESHED', { user: { id: 'user-a' } });
    });
    expect(mockGetOnboardingProfile).not.toHaveBeenCalled();
    expect(result.current.currentStage).toBe(2);
  });

  it('unsubscribes from auth changes on unmount', async () => {
    mockGetOnboardingProfile.mockResolvedValue(profile());
    const { unmount } = renderHook(() => useUserStage());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
