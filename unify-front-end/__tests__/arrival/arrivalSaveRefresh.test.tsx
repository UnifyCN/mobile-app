/**
 * After a confirmed arrival-date write the app must show the new date and
 * stage even when the follow-up reads fail, must not turn telemetry errors
 * into save errors, and must drop the cached Companion starters.
 * Real useUserStage, useArrivalDateEditor, usePersonalizedStarters and query
 * client. Profile reads, the date write and the edge fetch are controlled.
 * Frozen "today": local 2026-10-23.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockAuthUserId = 'user-a';
const mockGetOnboardingProfile = jest.fn();
const mockUpdateArrivalDate = jest.fn();
const mockTrackChanged = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: mockAuthUserId } } }),
      getSession: async () => ({
        data: {
          session: { access_token: 'test-token', user: { id: mockAuthUserId } },
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: (id: string) => mockGetOnboardingProfile(id),
}));
jest.mock('@/services/onboarding/syncStageCache', () => ({
  syncStageCache: jest.fn().mockResolvedValue(false),
}));
jest.mock('@/services/onboarding/updateArrivalDate', () => ({
  updateArrivalDate: (...args: unknown[]) => mockUpdateArrivalDate(...args),
}));
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackArrivalDateChanged: mockTrackChanged }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useUserStage } from '@/hooks/onboarding/useUserStage';
import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import { usePersonalizedStarters } from '@/hooks/companion/usePersonalizedStarters';
import { buildCompanionProfile } from '@/supabase/functions/_shared/stageContext';
import { buildPool } from '@/supabase/functions/_shared/companionTemplates';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client }, children);

const profile = (arrival: string, stage: string) => ({
  id: 'user-a',
  persona: 'skilled_worker',
  arrival_date: arrival,
  stage,
});

const setupScreenHooks = () =>
  renderHook(
    () => {
      const stage = useUserStage();
      const editor = useArrivalDateEditor({
        userId: stage.userId,
        arrivalDate: stage.arrivalDate,
        refreshStage: stage.refreshStage,
        refreshUser: () => undefined,
        refetchChecklist: () => undefined,
        applyConfirmedArrival: stage.applyConfirmedArrival,
      });
      return { stage, editor };
    },
    { wrapper }
  );

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
  mockAuthUserId = 'user-a';
  mockGetOnboardingProfile.mockReset();
  mockGetOnboardingProfile.mockResolvedValue(profile('2026-12-02', '0'));
  mockUpdateArrivalDate.mockReset();
  mockTrackChanged.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a confirmed write followed by a failed profile read', () => {
  it.each([
    ['a later future date', '2026-12-15', 0],
    ['today', '2026-10-23', 1],
  ])('keeps the new date and its stage for %s', async (_label, date, stage) => {
    mockUpdateArrivalDate.mockResolvedValue({
      id: 'user-a',
      arrival_date: date,
      stage,
    });
    const { result } = setupScreenHooks();
    await waitFor(() =>
      expect(result.current.stage.arrivalDate).toBe('2026-12-02')
    );

    mockGetOnboardingProfile.mockRejectedValue(
      new Error('network lost after successful write')
    );
    act(() => result.current.editor.open());
    await act(async () => {
      await result.current.editor.save(date);
    });

    expect(result.current.stage.arrivalDate).toBe(date);
    expect(result.current.stage.currentStage).toBe(stage);
    expect(result.current.editor.isOpen).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not let an older profile read overwrite the confirmed date', async () => {
    let releaseOldRead!: (value: unknown) => void;
    const { result } = setupScreenHooks();
    await waitFor(() =>
      expect(result.current.stage.arrivalDate).toBe('2026-12-02')
    );

    // A read that started before the write returns the old date late.
    mockGetOnboardingProfile.mockReturnValueOnce(
      new Promise(resolve => {
        releaseOldRead = resolve;
      })
    );
    let oldRead!: Promise<void>;
    act(() => {
      oldRead = result.current.stage.refreshStage();
    });

    mockUpdateArrivalDate.mockResolvedValue({
      id: 'user-a',
      arrival_date: '2026-12-15',
      stage: 0,
    });
    mockGetOnboardingProfile.mockResolvedValue(profile('2026-12-15', '0'));
    act(() => result.current.editor.open());
    await act(async () => {
      await result.current.editor.save('2026-12-15');
    });
    await act(async () => {
      releaseOldRead(profile('2026-12-02', '0'));
      await oldRead;
    });

    expect(result.current.stage.arrivalDate).toBe('2026-12-15');
  });
});

describe('telemetry', () => {
  it('a failing analytics call does not turn a saved date into an error', async () => {
    mockTrackChanged.mockImplementation(() => {
      throw new Error('posthog down');
    });
    mockUpdateArrivalDate.mockResolvedValue({
      id: 'user-a',
      arrival_date: '2026-12-15',
      stage: 0,
    });
    const { result } = setupScreenHooks();
    await waitFor(() =>
      expect(result.current.stage.arrivalDate).toBe('2026-12-02')
    );
    mockGetOnboardingProfile.mockResolvedValue(profile('2026-12-15', '0'));

    act(() => result.current.editor.open());
    await act(async () => {
      await result.current.editor.save('2026-12-15');
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.editor.isOpen).toBe(false);
    expect(result.current.stage.arrivalDate).toBe('2026-12-15');
  });
});

describe('Companion starters after a date change', () => {
  let savedDate: string;
  let requestedDays: Array<string | undefined>;

  beforeEach(() => {
    savedDate = '2026-12-02';
    requestedDays = [];
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (_url, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        requestedDays.push(headers['x-local-date']);
        const today = new Date(2026, 9, 23, 12);
        return {
          ok: true,
          json: async () => ({
            companion: {
              starters: buildPool(
                buildCompanionProfile(
                  { arrival_date: savedDate, persona: 'skilled_worker' },
                  today
                )
              ),
            },
          }),
        } as Response;
      });
    mockUpdateArrivalDate.mockImplementation(
      async (_id: string, date: string) => {
        savedDate = date;
        return { id: 'user-a', arrival_date: date, stage: 1 };
      }
    );
  });

  it('refetches the starters after the date is saved', async () => {
    const first = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() =>
      expect(
        first.result.current.data?.starters.some(s => s.id === 'stage_planning')
      ).toBe(true)
    );
    first.unmount();

    const { result } = setupScreenHooks();
    await waitFor(() =>
      expect(result.current.stage.arrivalDate).toBe('2026-12-02')
    );
    act(() => result.current.editor.open());
    await act(async () => {
      await result.current.editor.save('2026-10-23');
    });

    const reopened = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() =>
      expect(
        reopened.result.current.data?.starters.some(
          s => s.id === 'stage_recently_arrived'
        )
      ).toBe(true)
    );
    expect(
      reopened.result.current.data?.starters.some(s => s.id === 'stage_planning')
    ).toBe(false);
    expect(requestedDays).toEqual(['2026-10-23', '2026-10-23']);
  });

  it('does not reuse a cached starter list from an earlier local day', async () => {
    const first = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBeTruthy());
    first.unmount();

    jest.setSystemTime(new Date(2026, 9, 24, 0, 5));
    const next = renderHook(() => usePersonalizedStarters('user-a'), { wrapper });
    await waitFor(() => expect(requestedDays).toHaveLength(2));
    expect(requestedDays).toEqual(['2026-10-23', '2026-10-24']);
    next.unmount();
  });
});
