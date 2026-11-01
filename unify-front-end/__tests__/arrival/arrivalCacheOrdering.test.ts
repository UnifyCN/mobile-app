/**
 * Account caches must end on the database row after concurrent arrival-date
 * reads and saves, across editor instances.
 * Real useOnboardingProfile, useUserInfo, useArrivalDateEditor, arrival cache
 * code and QueryClient. Only the database is fake: reads return the row as it
 * was when they started, and each write can hold its commit or its response.
 * Frozen "today": local 2026-10-23.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';

interface Row {
  arrival_date: string;
  stage: number | null;
}

interface Gate {
  promise: Promise<void>;
  release: () => void;
}

const gate = (): Gate => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
};

// Stage 1 on the frozen arrival day, 0 for the later test dates.
const mockStageOf = (date: string) => (date === '2026-10-23' ? 1 : 0);

let mockRow: Row;
let mockReadGates: Gate[];
let mockWritePlans: Array<{ commit?: Gate; response?: Gate }>;

const mockRead = async () => {
  const snapshot = { ...mockRow };
  const held = mockReadGates.shift();
  if (held) await held.promise;
  return snapshot;
};

jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: async (id: string) => {
    const row = await mockRead();
    return { id, persona: 'skilled_worker', wants_reminders: true, ...row };
  },
}));
jest.mock('@/services/users/getUserInfo', () => ({
  getUserInfo: async (id: string) => {
    const row = await mockRead();
    return {
      id,
      username: 'amira',
      arrivalDate: row.arrival_date,
      stage: row.stage,
    };
  },
}));
jest.mock('@/services/onboarding/updateArrivalDate', () => ({
  updateArrivalDate: async (id: string, date: string) => {
    const plan = mockWritePlans.shift() ?? {};
    if (plan.commit) await plan.commit.promise;
    const stage = mockStageOf(date);
    mockRow = { arrival_date: date, stage };
    if (plan.response) await plan.response.promise;
    return { id, arrival_date: date, stage };
  },
}));
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackArrivalDateChanged: jest.fn() }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { useUserInfo } from '@/hooks/users/useUserInfo';

const USER = 'user-a';
const OLD = '2026-12-02';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client }, children);

const mountEditor = () =>
  renderHook(
    () =>
      useArrivalDateEditor({
        userId: USER,
        arrivalDate: OLD,
        refreshStage: async () => undefined,
        refreshUser: () => undefined,
        refetchChecklist: () => undefined,
        applyConfirmedArrival: () => undefined,
      }),
    { wrapper }
  );

const mountAccountQueries = async () => {
  const profile = renderHook(() => useOnboardingProfile(USER), { wrapper });
  const info = renderHook(() => useUserInfo(USER), { wrapper });
  await waitFor(() => {
    expect(profile.result.current.data?.arrival_date).toBe(OLD);
    expect(info.result.current.data?.arrivalDate).toBe(OLD);
  });
  return { profile, info };
};

const cachedProfile = () =>
  client.getQueryData<Record<string, unknown>>(['onboardingProfile', USER]);
const cachedInfo = () =>
  client.getQueryData<Record<string, unknown>>(['userInfo', USER]);

const settle = () =>
  waitFor(() => expect(client.isFetching()).toBe(0));

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
  mockRow = { arrival_date: OLD, stage: 0 };
  mockReadGates = [];
  mockWritePlans = [];
  client = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a read that began before a confirmed save', () => {
  it.each([
    ['onboardingProfile', 'profile'],
    ['userInfo', 'info'],
  ] as const)(
    'cannot restore the old date in the %s cache',
    async (_key, which) => {
      const queries = await mountAccountQueries();
      const oldRead = gate();
      mockReadGates.push(oldRead);
      act(() => {
        void queries[which].result.current.refetch();
      });

      const editor = mountEditor();
      await act(async () => {
        await editor.result.current.save('2026-10-23');
      });
      await act(async () => {
        oldRead.release();
        await Promise.resolve();
      });
      await settle();

      expect(mockRow.arrival_date).toBe('2026-10-23');
      expect(cachedProfile()).toMatchObject({
        arrival_date: '2026-10-23',
        stage: 1,
        persona: 'skilled_worker',
        wants_reminders: true,
      });
      expect(cachedInfo()).toMatchObject({
        arrivalDate: '2026-10-23',
        stage: 1,
        username: 'amira',
      });
    }
  );
});

describe('a save from an unmounted editor and a newer save from its replacement', () => {
  // Save A (2026-12-15) starts first in an editor that then unmounts. Save B
  // (2026-10-23) runs in a new editor for the same account. The database
  // keeps whichever write commits last; the caches must end on that row.
  it.each([
    ['A then B', 'B then A', '2026-10-23'],
    ['A then B', 'A then B', '2026-10-23'],
    ['B then A', 'B then A', '2026-12-15'],
    ['B then A', 'A then B', '2026-12-15'],
  ])(
    'commits %s, responds %s: caches end on %s',
    async (commitOrder, responseOrder, expected) => {
      await mountAccountQueries();
      const aCommit = gate();
      const aResponse = gate();
      const bResponse = gate();
      const aFirstCommit = commitOrder === 'A then B';
      const aFirstResponse = responseOrder === 'A then B';
      mockWritePlans.push(
        { commit: aFirstCommit ? undefined : aCommit, response: aResponse },
        { response: bResponse }
      );

      const first = mountEditor();
      let saveA!: Promise<void>;
      act(() => {
        saveA = first.result.current.save('2026-12-15');
      });
      await act(async () => {
        await Promise.resolve();
      });
      first.unmount();

      const second = mountEditor();
      let saveB!: Promise<void>;
      act(() => {
        saveB = second.result.current.save('2026-10-23');
      });
      await act(async () => {
        await Promise.resolve();
      });
      if (!aFirstCommit) {
        await act(async () => {
          aCommit.release();
          await Promise.resolve();
        });
      }
      expect(mockRow.arrival_date).toBe(expected);

      const respond = async (which: Gate, pending: Promise<void>) => {
        await act(async () => {
          which.release();
          await pending;
        });
      };
      if (aFirstResponse) {
        await respond(aResponse, saveA);
        await respond(bResponse, saveB);
      } else {
        await respond(bResponse, saveB);
        await respond(aResponse, saveA);
      }
      await settle();

      expect(mockRow.arrival_date).toBe(expected);
      expect(cachedProfile()).toMatchObject({ arrival_date: expected });
      expect(cachedInfo()).toMatchObject({ arrivalDate: expected });
    }
  );

  it('never publishes the older snapshot after the newer save completed', async () => {
    await mountAccountQueries();
    const aResponse = gate();
    mockWritePlans.push({ response: aResponse });

    const first = mountEditor();
    let saveA!: Promise<void>;
    act(() => {
      saveA = first.result.current.save('2026-12-15');
    });
    await act(async () => {
      await Promise.resolve();
    });
    first.unmount();

    const second = mountEditor();
    await act(async () => {
      await second.result.current.save('2026-10-23');
    });
    expect(cachedInfo()).toMatchObject({ arrivalDate: '2026-10-23' });

    const published: unknown[] = [];
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type !== 'updated') return;
      const data = event.query.state.data as
        | { arrival_date?: string; arrivalDate?: string }
        | undefined;
      published.push(data?.arrival_date ?? data?.arrivalDate);
    });
    await act(async () => {
      aResponse.release();
      await saveA;
    });
    await settle();
    unsubscribe();

    expect(published).not.toContain('2026-12-15');
    expect(cachedProfile()).toMatchObject({ arrival_date: '2026-10-23' });
    expect(cachedInfo()).toMatchObject({ arrivalDate: '2026-10-23' });
  });
});

describe('the wait while old reads are cancelled', () => {
  it('drops the older snapshot when a newer save completes during that wait', async () => {
    await mountAccountQueries();
    const cancelWait = gate();
    const realCancel = client.cancelQueries.bind(client);
    const cancelSpy = jest
      .spyOn(client, 'cancelQueries')
      .mockImplementationOnce(async (...args) => {
        await realCancel(...args);
        await cancelWait.promise;
      });

    const first = mountEditor();
    let saveA!: Promise<void>;
    act(() => {
      saveA = first.result.current.save('2026-12-15');
    });
    await waitFor(() => expect(cancelSpy).toHaveBeenCalled());
    first.unmount();

    const second = mountEditor();
    await act(async () => {
      await second.result.current.save('2026-10-23');
    });
    expect(mockRow.arrival_date).toBe('2026-10-23');
    expect(cachedInfo()).toMatchObject({ arrivalDate: '2026-10-23' });

    const published: unknown[] = [];
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type !== 'updated') return;
      const data = event.query.state.data as
        | { arrival_date?: string; arrivalDate?: string }
        | undefined;
      published.push(data?.arrival_date ?? data?.arrivalDate);
    });
    await act(async () => {
      cancelWait.release();
      await saveA;
    });
    await settle();
    unsubscribe();

    expect(published).not.toContain('2026-12-15');
    expect(cachedProfile()).toMatchObject({ arrival_date: '2026-10-23' });
    expect(cachedInfo()).toMatchObject({ arrivalDate: '2026-10-23' });
  });
});
