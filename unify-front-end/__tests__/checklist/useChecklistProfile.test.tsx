import { act, renderHook, waitFor } from '@testing-library/react-native';

type Profile = { persona: string; province: string | null };
type Deferred = { promise: Promise<Profile>; resolve: (p: Profile) => void };

const mockProfileRequests: Deferred[] = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
  },
}));

jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: jest.fn(() => {
    let resolve!: (p: Profile) => void;
    const promise = new Promise<Profile>(r => (resolve = r));
    mockProfileRequests.push({ promise, resolve });
    return promise;
  }),
}));

import { useChecklistProfile } from '@/hooks/checklist/useChecklistProfile';

const BC = 'British Columbia';
const profile = (province: string | null): Profile => ({
  persona: 'international_student',
  province,
});

// The profile request is issued after an awaited auth lookup.
const requestCount = (n: number) =>
  waitFor(() => expect(mockProfileRequests.length).toBe(n));

async function mountLoaded(province: string) {
  const hook = renderHook(() => useChecklistProfile());
  await requestCount(1);
  await act(async () => mockProfileRequests[0].resolve(profile(province)));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  mockProfileRequests.length = 0;
  return hook;
}

describe('Checklist profile when profile requests overlap', () => {
  beforeEach(() => {
    mockProfileRequests.length = 0;
  });

  it('keeps Ontario when the newer Ontario response arrives before the older BC response', async () => {
    const { result } = await mountLoaded(BC);

    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => {
      older = result.current.refresh();
    });
    await requestCount(1);
    act(() => {
      newer = result.current.refresh();
    });
    await requestCount(2);

    await act(async () => {
      mockProfileRequests[1].resolve(profile('Ontario'));
      await newer;
    });
    expect(result.current.province).toBe('Ontario');

    await act(async () => {
      mockProfileRequests[0].resolve(profile(BC));
      await older;
    });
    expect(result.current.province).toBe('Ontario');
  });

  it('keeps Ontario when the older BC response arrives first', async () => {
    const { result } = await mountLoaded(BC);

    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => {
      older = result.current.refresh();
    });
    await requestCount(1);
    act(() => {
      newer = result.current.refresh();
    });
    await requestCount(2);

    await act(async () => {
      mockProfileRequests[0].resolve(profile(BC));
      await older;
    });
    await act(async () => {
      mockProfileRequests[1].resolve(profile('Ontario'));
      await newer;
    });
    expect(result.current.province).toBe('Ontario');
  });

  it('tells the caller not to refetch for a superseded refresh', async () => {
    // A refetch from a superseded focus would use the previous parameters.
    const { result } = await mountLoaded(BC);

    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => {
      older = result.current.refresh();
    });
    await requestCount(1);
    act(() => {
      newer = result.current.refresh();
    });
    await requestCount(2);

    let olderResult: boolean | undefined;
    let newerResult: boolean | undefined;
    await act(async () => {
      mockProfileRequests[0].resolve(profile(BC));
      olderResult = await older;
    });
    expect(olderResult).toBe(true);
    await act(async () => {
      mockProfileRequests[1].resolve(profile('Ontario'));
      newerResult = await newer;
    });
    expect(newerResult).toBe(true);
    expect(result.current.province).toBe('Ontario');
  });

  it('still tells the newest refresh that an unchanged profile needs a refetch', async () => {
    const { result } = await mountLoaded(BC);
    let refreshed!: Promise<boolean>;
    act(() => {
      refreshed = result.current.refresh();
    });
    await requestCount(1);
    let changed: boolean | undefined;
    await act(async () => {
      mockProfileRequests[0].resolve(profile(BC));
      changed = await refreshed;
    });
    expect(changed).toBe(false);
  });

  it('keeps the focus refresh result when the mount request resolves last', async () => {
    const { result } = renderHook(() => useChecklistProfile());
    await requestCount(1);

    let refreshed!: Promise<boolean>;
    act(() => {
      refreshed = result.current.refresh();
    });
    await requestCount(2);

    await act(async () => {
      mockProfileRequests[1].resolve(profile('Ontario'));
      await refreshed;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.province).toBe('Ontario');

    await act(async () => {
      mockProfileRequests[0].resolve(profile(BC));
      await mockProfileRequests[0].promise;
    });
    expect(result.current.province).toBe('Ontario');
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the mount request result when it is the only one', async () => {
    const { result } = renderHook(() => useChecklistProfile());
    await requestCount(1);
    await act(async () => mockProfileRequests[0].resolve(profile(BC)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.province).toBe(BC);
    expect(result.current.persona).toBe('international_student');
  });

  it('writes nothing after unmount and tells the caller not to refetch', async () => {
    const { result, unmount } = await mountLoaded(BC);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.refresh();
    });
    await requestCount(1);
    unmount();

    let changed: boolean | undefined;
    await act(async () => {
      mockProfileRequests[0].resolve(profile(BC));
      changed = await pending;
    });
    expect(changed).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
