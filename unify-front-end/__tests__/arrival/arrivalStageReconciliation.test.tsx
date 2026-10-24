/**
 * Overlapping arrival writes must reconcile the active stage, card and tasks,
 * even when the last response belongs to an unmounted editor. The database
 * controls commit/response/read timing. Profile IO, editor, stage, task hook,
 * date rules and QueryClient run their real code. Today is October 23, 2026.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
};
type Gate = ReturnType<typeof gate>;
type AuthListener = (
  event: string,
  session: { user: { id: string } } | null
) => void;
interface ProfileRow {
  id: string;
  persona: string;
  province: string;
  arrival_date: string;
  stage: string;
}
let mockRows: Record<string, ProfileRow>;
let mockAuthId: string;
const mockAuthListeners = new Set<AuthListener>();
let mockWrites: Array<{ commit?: Gate; response?: Gate }>;
let mockReads: Array<{ started?: Gate; response?: Gate; fail?: boolean }>;
const mockRead = jest.fn(async (id: string) => {
  const snapshot = { ...mockRows[id] };
  const plan = mockReads.shift();
  plan?.started?.release();
  if (plan?.response) await plan.response.promise;
  return plan?.fail
    ? { data: null, error: { message: 'offline' } }
    : { data: snapshot, error: null };
});
const mockChecklist = jest.fn(async (..._args: unknown[]) => []);
const mockTrack = jest.fn();

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: mockAuthId } } }),
      getSession: async () => ({
        data: { session: { user: { id: mockAuthId } } },
      }),
      onAuthStateChange: (listener: AuthListener) => {
        mockAuthListeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => mockAuthListeners.delete(listener),
            },
          },
        };
      },
    },
    from: () => ({
      select: () => ({
        eq: (_field: string, id: string) => ({
          maybeSingle: () => mockRead(id),
        }),
      }),
      update: (patch: Partial<ProfileRow>) => ({
        eq: (_field: string, id: string) => ({
          select: async () => {
            const plan = mockWrites.shift() ?? {};
            if (plan.commit) await plan.commit.promise;
            mockRows[id] = {
              ...mockRows[id],
              ...patch,
              stage: String(patch.stage),
            };
            const confirmed = { ...mockRows[id] };
            if (plan.response) await plan.response.promise;
            return { data: [confirmed], error: null };
          },
        }),
      }),
    }),
  },
}));
jest.mock('@/services/users/getUserInfo', () => ({
  getUserInfo: async (id: string) => ({
    id,
    username: 'amira',
    arrivalDate: mockRows[id].arrival_date,
    stage: Number(mockRows[id].stage),
  }),
}));
jest.mock('@/services/checklist/getChecklistWithUserProgress', () => ({
  getChecklistWithUserProgress: (...args: unknown[]) => mockChecklist(...args),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: async () => [],
}));
jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackArrivalDateChanged: mockTrack }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useUserStage } from '@/hooks/onboarding/useUserStage';
import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { useUserInfo } from '@/hooks/users/useUserInfo';
import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';
import { getArrivalCountdown } from '@/helpers/arrivalDate';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client }, children);
const mountScreenPath = () =>
  renderHook(
    () => {
      const stage = useUserStage(new Date());
      const tasks = useChecklistTasks({
        currentStage: stage.currentStage,
        stageChanged: stage.stageChanged,
        persona: 'skilled_worker',
        province: 'Ontario',
        isStageLoading: stage.isLoading,
      });
      const editor = useArrivalDateEditor({
        userId: stage.userId,
        arrivalDate: stage.arrivalDate,
        applyConfirmedArrival: stage.applyConfirmedArrival,
        refreshStage: stage.refreshStage,
        refreshUser: () =>
          client.invalidateQueries({ queryKey: ['userInfo', stage.userId] }),
        refetchChecklist: tasks.refetch,
      });
      return {
        stage,
        editor,
        card: getArrivalCountdown(stage.arrivalDate, new Date()),
      };
    },
    { wrapper }
  );

/** Only one editor is mounted at any time. Save B finishes while A waits. */
const overlap = async (lateCommit = true) => {
  const commit = gate();
  const response = gate();
  mockWrites.push({ commit: lateCommit ? commit : undefined, response });
  const first = mountScreenPath();
  await waitFor(() =>
    expect(first.result.current.stage.arrivalDate).toBe('2026-12-02')
  );
  let saveA!: Promise<void>;
  act(() => {
    saveA = first.result.current.editor.save('2026-12-15');
  });
  await waitFor(() => expect(mockWrites).toHaveLength(0));
  // The immediate commit, when enabled, happens before the second screen loads.
  if (!lateCommit) expect(mockRows['user-a'].arrival_date).toBe('2026-12-15');
  first.unmount();
  const second = mountScreenPath();
  await waitFor(() =>
    expect(second.result.current.stage.arrivalDate).toBe(
      lateCommit ? '2026-12-02' : '2026-12-15'
    )
  );
  await act(async () => {
    await second.result.current.editor.save('2026-10-23');
  });
  expect(second.result.current.stage.arrivalDate).toBe('2026-10-23');
  expect(mockRows['user-a'].arrival_date).toBe('2026-10-23');
  const finishA = () =>
    act(async () => {
      commit.release();
      response.release();
      await saveA;
    });
  return { second, finishA };
};

const switchAccount = (id: string) =>
  act(() => {
    mockAuthId = id;
    for (const listener of mockAuthListeners)
      listener('SIGNED_IN', { user: { id } });
  });

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
  mockAuthId = 'user-a';
  mockRows = {
    'user-a': {
      id: 'user-a',
      persona: 'skilled_worker',
      province: 'Ontario',
      arrival_date: '2026-12-02',
      stage: '0',
    },
    'user-b': {
      id: 'user-b',
      persona: 'refugee',
      province: 'Ontario',
      arrival_date: '2026-10-01',
      stage: '1',
    },
  };
  mockWrites = [];
  mockReads = [];
  mockRead.mockClear();
  mockChecklist.mockClear();
  mockTrack.mockClear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it.each([false, true])(
  'screen follows final profile when older write commits late = %s',
  async late => {
    const profile = renderHook(() => useOnboardingProfile('user-a'), {
      wrapper,
    });
    const info = renderHook(() => useUserInfo('user-a'), { wrapper });
    await waitFor(() =>
      expect(info.result.current.data?.arrivalDate).toBe('2026-12-02')
    );
    await waitFor(() =>
      expect(profile.result.current.data?.arrival_date).toBe('2026-12-02')
    );
    const { second, finishA } = await overlap(late);
    await finishA();
    const expected = late ? '2026-12-15' : '2026-10-23';
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await waitFor(() =>
      expect(info.result.current.data?.arrivalDate).toBe(expected)
    );
    await waitFor(() =>
      expect(profile.result.current.data?.arrival_date).toBe(expected)
    );
    await waitFor(() =>
      expect(second.result.current.stage.arrivalDate).toBe(expected)
    );
    expect(mockRows['user-a'].arrival_date).toBe(expected);
    expect(second.result.current.stage.currentStage).toBe(late ? 0 : 1);
    expect(second.result.current.card).toEqual(
      late ? { state: 'pre_arrival', days: 53 } : { state: 'first_30_days' }
    );
    await waitFor(() =>
      expect(mockChecklist.mock.calls.at(-1)?.[2]).toBe(
        late ? 'not_arrived' : 'arrived_0_3_months'
      )
    );
    // The unmounted save never emits a date-change event.
    expect(mockTrack.mock.calls).toEqual([[0]]);
  }
);

it('drops a profile read started before the overlapping writes settle', async () => {
  const { second, finishA } = await overlap();
  const oldResponse = gate();
  const started = gate();
  mockReads.push({ started, response: oldResponse });
  let oldRefresh!: Promise<void>;
  act(() => {
    oldRefresh = second.result.current.stage.refreshStage();
  });
  await started.promise;
  await finishA();
  await waitFor(() =>
    expect(second.result.current.stage.arrivalDate).toBe('2026-12-15')
  );
  await act(async () => {
    oldResponse.release();
    await oldRefresh;
  });
  expect(second.result.current.stage.arrivalDate).toBe('2026-12-15');
  expect(second.result.current.card).toEqual({
    state: 'pre_arrival',
    days: 53,
  });
});

it('drops a reconciliation read superseded by a new confirmed save', async () => {
  const { second, finishA } = await overlap();
  const response = gate();
  const started = gate();
  mockReads.push({ started, response });
  await finishA();
  await started.promise;
  await act(async () => {
    await second.result.current.editor.save('2026-11-01');
  });
  expect(second.result.current.stage.arrivalDate).toBe('2026-11-01');
  await act(async () => {
    response.release();
    await Promise.resolve();
  });
  expect(second.result.current.stage.arrivalDate).toBe('2026-11-01');
  expect(second.result.current.card).toEqual({ state: 'pre_arrival', days: 9 });
  expect(mockTrack.mock.calls).toEqual([[0], [9]]);
});

it('ignores account A reconciliation while B is active, then reads A on return', async () => {
  const { second, finishA } = await overlap();
  switchAccount('user-b');
  await waitFor(() =>
    expect(second.result.current.stage.arrivalDate).toBe('2026-10-01')
  );
  mockRead.mockClear();
  await finishA();
  expect(mockRead).not.toHaveBeenCalled();
  expect(second.result.current.stage.userId).toBe('user-b');
  expect(second.result.current.stage.arrivalDate).toBe('2026-10-01');
  switchAccount('user-a');
  await waitFor(() =>
    expect(second.result.current.stage.arrivalDate).toBe('2026-12-15')
  );
  expect(mockTrack.mock.calls).toEqual([[0]]);
});

it('rejects a delayed reconciliation across A-B-A account periods', async () => {
  const { second, finishA } = await overlap();
  const response = gate();
  const started = gate();
  mockReads.push({ started, response });
  await finishA();
  await started.promise;
  switchAccount('user-b');
  await waitFor(() =>
    expect(second.result.current.stage.arrivalDate).toBe('2026-10-01')
  );
  mockRows['user-a'].arrival_date = '2026-11-01';
  switchAccount('user-a');
  await waitFor(() =>
    expect(second.result.current.stage.arrivalDate).toBe('2026-11-01')
  );
  await act(async () => {
    response.release();
    await Promise.resolve();
  });
  expect(second.result.current.stage.userId).toBe('user-a');
  expect(second.result.current.stage.arrivalDate).toBe('2026-11-01');
  expect(mockTrack.mock.calls).toEqual([[0]]);
});

it('does not reload an unmounted stage consumer', async () => {
  const { second, finishA } = await overlap();
  second.unmount();
  mockRead.mockClear();
  await finishA();
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockTrack.mock.calls).toEqual([[0]]);
});

it('does not send an unmounted reconciliation read to its replacement', async () => {
  const { second, finishA } = await overlap();
  const response = gate();
  const started = gate();
  mockReads.push({ started, response });
  await finishA();
  await started.promise;
  second.unmount();
  mockRows['user-a'].arrival_date = '2026-11-01';
  const replacement = mountScreenPath();
  await waitFor(() =>
    expect(replacement.result.current.stage.arrivalDate).toBe('2026-11-01')
  );
  await act(async () => {
    response.release();
    await Promise.resolve();
  });
  expect(replacement.result.current.stage.arrivalDate).toBe('2026-11-01');
  expect(replacement.result.current.card).toEqual({
    state: 'pre_arrival',
    days: 9,
  });
  expect(mockTrack.mock.calls).toEqual([[0]]);
});

it('keeps the confirmed date when reconciliation fails and recovers on retry', async () => {
  const { second, finishA } = await overlap();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockReads.push({ fail: true });
  await finishA();
  await waitFor(() =>
    expect(second.result.current.stage.error).toContain('offline')
  );
  // The old response is not an authoritative substitute for the failed read.
  expect(second.result.current.stage.arrivalDate).toBe('2026-10-23');
  expect(second.result.current.stage.currentStage).toBe(1);
  expect(second.result.current.card).toEqual({ state: 'first_30_days' });
  await act(async () => {
    await second.result.current.stage.refreshStage();
  });
  expect(second.result.current.stage.arrivalDate).toBe('2026-12-15');
  expect(second.result.current.stage.error).toBeNull();
});
