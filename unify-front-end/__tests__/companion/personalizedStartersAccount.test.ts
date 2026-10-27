/**
 * Companion starters belong to one account. One QueryClient lives across
 * sign-out and sign-in, so a list or a late response for account A must never
 * reach account B.
 * Real usePersonalizedStarters, QueryClient, stage builder and starter pool.
 * The session and the personalize endpoint are controlled. Frozen "today":
 * local 2026-10-23. A arrives tomorrow (planning); B arrived today (stage 1).
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';

let mockSessionUserId: string | null = 'user-a';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: mockSessionUserId
            ? {
                access_token: `token-${mockSessionUserId}`,
                user: { id: mockSessionUserId },
              }
            : null,
        },
      }),
    },
  },
}));

import { usePersonalizedStarters } from '@/hooks/companion/usePersonalizedStarters';
import { buildCompanionProfile } from '@/supabase/functions/_shared/stageContext';
import { buildPool } from '@/supabase/functions/_shared/companionTemplates';

const ARRIVALS: Record<string, string> = {
  'user-a': '2026-10-24',
  'user-b': '2026-10-23',
};

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client }, children);

let requestedAccounts: string[];
let heldResponses: Array<() => void>;
let holdNextResponse: boolean;

const accountFromToken = (init?: RequestInit) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers.Authorization.replace('Bearer token-', '');
};

const ids = (data: { starters: Array<{ id: string }> } | null | undefined) =>
  data?.starters.map(s => s.id) ?? [];

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 23, 12),
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
  mockSessionUserId = 'user-a';
  requestedAccounts = [];
  heldResponses = [];
  holdNextResponse = false;
  client = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, init?: RequestInit) => {
      const account = accountFromToken(init);
      requestedAccounts.push(account);
      if (holdNextResponse) {
        holdNextResponse = false;
        await new Promise<void>(resolve => heldResponses.push(resolve));
      }
      const starters = buildPool(
        buildCompanionProfile(
          { arrival_date: ARRIVALS[account], persona: 'skilled_worker' },
          new Date(2026, 9, 23, 12)
        )
      );
      return {
        ok: true,
        json: async () => ({ companion: { starters } }),
      } as Response;
    });
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Companion starters across accounts on one device', () => {
  it('gives account B its own list within the freshness window of A', async () => {
    const a = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() =>
      expect(ids(a.result.current.data)).toContain('stage_planning')
    );
    a.unmount();

    mockSessionUserId = 'user-b';
    const b = renderHook(() => usePersonalizedStarters('user-b'), { wrapper });
    await waitFor(() =>
      expect(ids(b.result.current.data)).toContain('stage_recently_arrived')
    );
    expect(ids(b.result.current.data)).not.toContain('stage_planning');
    expect(requestedAccounts).toEqual(['user-a', 'user-b']);
  });

  it('keeps a delayed response for A out of B', async () => {
    holdNextResponse = true;
    const a = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() => expect(heldResponses).toHaveLength(1));
    a.unmount();

    mockSessionUserId = 'user-b';
    const b = renderHook(() => usePersonalizedStarters('user-b'), { wrapper });
    await waitFor(() =>
      expect(ids(b.result.current.data)).toContain('stage_recently_arrived')
    );

    await act(async () => {
      heldResponses[0]();
      await Promise.resolve();
    });
    await waitFor(() => expect(client.isFetching()).toBe(0));

    expect(ids(b.result.current.data)).toContain('stage_recently_arrived');
    expect(ids(b.result.current.data)).not.toContain('stage_planning');
    expect(requestedAccounts).toEqual(['user-a', 'user-b']);
  });

  it('sends no request until the account is known', async () => {
    mockSessionUserId = null;
    const none = renderHook(() => usePersonalizedStarters(null), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(none.result.current.fetchStatus).toBe('idle');
    expect(none.result.current.data).toBeUndefined();
    expect(requestedAccounts).toEqual([]);
  });

  it('never asks with another account session for the expected account', async () => {
    // The session has already moved to B while a screen still expects A.
    mockSessionUserId = 'user-b';
    const a = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() => expect(a.result.current.isFetching).toBe(false));

    expect(requestedAccounts).toEqual([]);
    expect(ids(a.result.current.data)).toEqual([]);
  });
});
