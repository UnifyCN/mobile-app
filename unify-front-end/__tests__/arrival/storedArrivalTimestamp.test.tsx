/**
 * The hosted column user_onboarding_profiles.arrival_date is TIMESTAMP WITH
 * TIME ZONE. The API returns a date the user chose as
 * "2026-12-02T00:00:00+00:00". This file drives the real services, hooks and
 * editor against a table that stores and returns that exact shape, so a date
 * written as YYYY-MM-DD comes back as a timestamp.
 * Frozen "today": local 2026-10-23. Run it under TZ=America/Vancouver too.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Row = Record<string, unknown>;
let mockRow: Row;
const mockWrites: Array<Record<string, unknown>> = [];

/** What Postgres and PostgREST do to a written date: UTC instant, +00:00 offset. */
const toHostedTimestamp = (value: unknown): unknown =>
  typeof value === 'string' && value
    ? new Date(value).toISOString().replace(/\.\d{3}Z$/, '+00:00')
    : value;

jest.mock('@/lib/supabase', () => {
  const applyPatch = (patch: Record<string, unknown>) => {
    mockWrites.push(patch);
    const next = { ...mockRow, ...patch };
    if ('arrival_date' in patch) {
      next.arrival_date = toHostedTimestamp(patch.arrival_date);
    }
    // The hosted stage column is an enum: the API returns strings.
    if ('stage' in patch) {
      next.stage = patch.stage === null ? null : String(patch.stage);
    }
    mockRow = next;
    return { ...mockRow };
  };
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => undefined } },
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { ...mockRow }, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            select: async () => ({ data: [applyPatch(patch)], error: null }),
            then: (
              resolve: (value: { error: null }) => unknown,
              reject: (reason: unknown) => unknown
            ) =>
              Promise.resolve()
                .then(() => {
                  applyPatch(patch);
                  return { error: null };
                })
                .then(resolve, reject),
          }),
        }),
        upsert: (patch: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({ data: applyPatch(patch), error: null }),
          }),
        }),
      }),
    },
  };
});

const mockTrackChanged = jest.fn();
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackArrivalDateChanged: mockTrackChanged }),
}));
jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { useUserStage } from '@/hooks/onboarding/useUserStage';
import { getArrivalCountdown } from '@/helpers/arrivalDate';
import { stageNumberToStageSlug } from '@/helpers/dateHelpers';
import { saveOnboardingProfile } from '@/services/onboarding/saveOnboardingProfile';
import { updateArrivalDate } from '@/services/onboarding/updateArrivalDate';

const TODAY = new Date(2026, 9, 23, 12);
let client: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client }, children);

beforeEach(() => {
  jest.useFakeTimers({
    now: TODAY,
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
  mockRow = {
    id: 'u1',
    persona: 'skilled_worker',
    // Written as 2026-12-02; read back exactly as the hosted API shows it.
    arrival_date: '2026-12-02T00:00:00+00:00',
    stage: '0',
    preferred_language: 'en',
    wants_reminders: false,
    onboarding_completed: true,
    city: 'Toronto',
    province: 'ON',
    goals: [],
  };
  mockWrites.length = 0;
  mockTrackChanged.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('reading a stored arrival timestamp', () => {
  it('gives the profile the chosen calendar date', async () => {
    const profile = renderHook(() => useOnboardingProfile('u1'), { wrapper });
    await waitFor(() => expect(profile.result.current.data).toBeTruthy());
    expect(profile.result.current.data?.arrival_date).toBe('2026-12-02');
  });

  it('reaches the stage, the countdown and the checklist as pre-arrival', async () => {
    const { result } = renderHook(() => useUserStage(TODAY), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.arrivalDate).toBe('2026-12-02');
    expect(result.current.currentStage).toBe(0);
    expect(stageNumberToStageSlug(result.current.currentStage)).toBe(
      'not_arrived'
    );
    expect(getArrivalCountdown(result.current.arrivalDate, TODAY)).toEqual({
      state: 'pre_arrival',
      days: 40,
    });
  });

  it('keeps an unreadable stored value unknown', async () => {
    mockRow.arrival_date = '2026-02-30T00:00:00+00:00';
    const { result } = renderHook(() => useUserStage(TODAY), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.arrivalDate).toBeNull();
    expect(result.current.currentStage).toBeNull();
    expect(getArrivalCountdown(result.current.arrivalDate, TODAY)).toEqual({
      state: 'hidden',
    });
  });
});

describe('onboarding saves', () => {
  it('writes stage 0 for the month-start timestamp the quiz sends', async () => {
    // OnboardingQuiz sends the first of the month at UTC midnight.
    const { profile } = await saveOnboardingProfile('u1', {
      arrival_date: '2026-12-01T00:00:00.000Z',
      onboarding_completed: true,
    });

    expect(mockWrites.at(-1)?.stage).toBe(0);
    expect(profile.arrival_date).toBe('2026-12-01');
    expect(profile.stage).toBe(0);
  });

  it('returns the chosen calendar date for a date-only save', async () => {
    const { profile } = await saveOnboardingProfile('u1', {
      arrival_date: '2026-12-02',
      onboarding_completed: true,
    });

    expect(mockWrites.at(-1)?.stage).toBe(0);
    expect(profile.arrival_date).toBe('2026-12-02');
  });
});

describe('a confirmed arrival-date write', () => {
  it('is confirmed when the database returns the date as a timestamp', async () => {
    await expect(updateArrivalDate('u1', '2026-12-03')).resolves.toEqual({
      id: 'u1',
      arrival_date: '2026-12-03',
      stage: 0,
    });
  });

  it('succeeds in the editor: no error, caches and state hold the plain date', async () => {
    const stage = renderHook(() => useUserStage(TODAY), { wrapper });
    await waitFor(() => expect(stage.result.current.isLoading).toBe(false));
    const applyConfirmedArrival = jest.fn();
    const editor = renderHook(
      () =>
        useArrivalDateEditor({
          userId: 'u1',
          arrivalDate: stage.result.current.arrivalDate,
          refreshStage: stage.result.current.refreshStage,
          refreshUser: () => undefined,
          refetchChecklist: () => undefined,
          applyConfirmedArrival,
        }),
      { wrapper }
    );
    const profile = renderHook(() => useOnboardingProfile('u1'), { wrapper });
    await waitFor(() => expect(profile.result.current.data).toBeTruthy());

    act(() => editor.result.current.open());
    await act(async () => {
      await editor.result.current.save('2026-12-09');
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(editor.result.current.isOpen).toBe(false);
    expect(applyConfirmedArrival).toHaveBeenCalledWith({
      id: 'u1',
      arrival_date: '2026-12-09',
      stage: 0,
    });
    expect(mockTrackChanged).toHaveBeenCalledWith(47);
    expect(
      client.getQueryData<{ arrival_date: string }>(['onboardingProfile', 'u1'])
        ?.arrival_date
    ).toBe('2026-12-09');
  });

  it('keeps the plain date when the caches read the row again', async () => {
    const profile = renderHook(() => useOnboardingProfile('u1'), { wrapper });
    await waitFor(() => expect(profile.result.current.data).toBeTruthy());
    const editor = renderHook(
      () =>
        useArrivalDateEditor({
          userId: 'u1',
          arrivalDate: profile.result.current.data?.arrival_date ?? null,
          refreshStage: async () => undefined,
          refreshUser: () => undefined,
          refetchChecklist: () => undefined,
          applyConfirmedArrival: () => undefined,
        }),
      { wrapper }
    );

    await act(async () => {
      await editor.result.current.save('2026-12-09');
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ['onboardingProfile', 'u1'],
      });
    });

    await waitFor(() =>
      expect(profile.result.current.data?.arrival_date).toBe('2026-12-09')
    );
    expect(profile.result.current.data?.stage).toBe(0);
  });

  it('sees no change when the user saves the date the card already shows', async () => {
    const stage = renderHook(() => useUserStage(TODAY), { wrapper });
    await waitFor(() => expect(stage.result.current.isLoading).toBe(false));
    const editor = renderHook(
      () =>
        useArrivalDateEditor({
          userId: 'u1',
          arrivalDate: stage.result.current.arrivalDate,
          refreshStage: stage.result.current.refreshStage,
          refreshUser: () => undefined,
          refetchChecklist: () => undefined,
          applyConfirmedArrival: () => undefined,
        }),
      { wrapper }
    );

    await act(async () => {
      await editor.result.current.save('2026-12-02');
    });

    expect(mockWrites).toEqual([]);
    expect(mockTrackChanged).not.toHaveBeenCalled();
  });
});
