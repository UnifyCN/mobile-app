/**
 * Cached user info must recompute the stage from the arrival date, and
 * refreshUser must reload the profile after a date update.
 * Frozen "today": local 2026-10-23.
 */
import { createElement, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetUserInfo = jest.fn();
let mockAuthUser: { id: string; email: string } | null;
let mockAuthListener:
  | ((event: string, session: { user: { id: string; email: string } } | null) => void)
  | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: mockAuthUser } }),
      onAuthStateChange: (listener: typeof mockAuthListener) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));
jest.mock('@/services/users/getUserInfo', () => ({
  getUserInfo: (id?: string) => mockGetUserInfo(id),
}));

import { UserProvider, useCurrentUser } from '@/context/UserContext';
import { useUserInfo } from '@/hooks/users/useUserInfo';

const info = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  username: 'sam',
  firstName: 'Sam',
  createdAt: '2026-01-01T00:00:00Z',
  followingCount: 0,
  followerCount: 0,
  isPremium: false,
  permissions: 'user',
  arrivalDate: '2026-02-23', // 8 months ago
  city: null,
  province: null,
  stage: 1, // stale
  persona: null,
  personaOther: null,
  ...over,
});

const clients: QueryClient[] = [];
const makeClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return client;
};
const wrap =
  (client: QueryClient) =>
  ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);

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
  mockGetUserInfo.mockReset();
  mockAuthUser = { id: 'u1', email: 'sam@example.com' };
  mockAuthListener = null;
});
afterEach(() => {
  // Clear query GC timers so Jest can exit.
  clients.splice(0).forEach(client => client.clear());
  jest.useRealTimers();
});

describe('useUserInfo cached reads', () => {
  it('recomputes the stage of a cached entry from its arrival date', async () => {
    const client = makeClient();
    client.setQueryData(['userInfo', 'u1'], info());
    const { result } = renderHook(() => useUserInfo('u1'), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.stage).toBe(2);
  });

  it('gives unknown for a cached entry without a date', async () => {
    const client = makeClient();
    client.setQueryData(
      ['userInfo', 'u1'],
      info({ arrivalDate: null, stage: 0 })
    );
    const { result } = renderHook(() => useUserInfo('u1'), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.stage).toBeNull();
  });
});

describe('UserProvider', () => {
  const renderUser = (client: QueryClient) =>
    renderHook(() => useCurrentUser(), {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(
          QueryClientProvider,
          { client },
          createElement(UserProvider, null, children)
        ),
    });

  it('exposes a recomputed stage for a stale cached user', async () => {
    const client = makeClient();
    client.setQueryData(['userInfo', 'u1'], info());
    mockGetUserInfo.mockResolvedValue(info());
    const { result } = renderUser(client);
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());
    expect(result.current.currentUser?.stage).toBe(2);
  });

  it('exposes the plain date and stage 0 for a cached raw timestamp', async () => {
    // A cached entry from before the date was normalized at the read boundary.
    const client = makeClient();
    const cachedRaw = info({
      arrivalDate: '2026-12-02T00:00:00+00:00',
      stage: null,
    });
    client.setQueryData(['userInfo', 'u1'], cachedRaw);
    mockGetUserInfo.mockResolvedValue(cachedRaw);
    const { result } = renderUser(client);
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());
    expect(result.current.currentUser?.arrivalDate).toBe('2026-12-02');
    expect(result.current.currentUser?.stage).toBe(0);
  });

  it('refreshUser reloads the profile after a date update', async () => {
    const client = makeClient();
    mockGetUserInfo.mockResolvedValueOnce(info({ stage: 2 }));
    const { result } = renderUser(client);
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());
    expect(result.current.currentUser?.arrivalDate).toBe('2026-02-23');

    mockGetUserInfo.mockResolvedValueOnce(
      info({ arrivalDate: '2026-11-12', stage: 0 })
    );
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.refreshUser();
      await done;
    });
    expect(done).toBeInstanceOf(Promise);
    expect(mockGetUserInfo).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.currentUser?.arrivalDate).toBe('2026-11-12')
    );
    expect(result.current.currentUser?.stage).toBe(0);
  });

  it('refreshUser resolves with no signed-in user', async () => {
    mockAuthUser = null;
    const client = makeClient();
    const { result } = renderUser(client);
    await act(async () => {
      await result.current.refreshUser();
    });
    expect(mockGetUserInfo).not.toHaveBeenCalled();
  });

  it('does not show the old account after an account change', async () => {
    const client = makeClient();
    mockGetUserInfo.mockImplementation(async (id?: string) =>
      id === 'u2' ? info({ id: 'u2', username: 'riley', arrivalDate: '2020-01-01' }) : info()
    );
    const { result } = renderUser(client);
    await waitFor(() => expect(result.current.currentUser?.id).toBe('u1'));

    await act(async () => {
      mockAuthListener!('SIGNED_IN', { user: { id: 'u2', email: 'riley@example.com' } });
    });
    await waitFor(() => expect(result.current.currentUser?.id).toBe('u2'));
    expect(result.current.currentUser?.username).toBe('riley');
    expect(result.current.currentUser?.stage).toBe(4);
  });
});
