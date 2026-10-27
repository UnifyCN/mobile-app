/**
 * Save, then use the app. Real editor, real query client, real services and
 * the real Account Settings page. Only the Supabase client is a fake table.
 * Frozen "today": local 2026-10-23.
 */
import React from 'react';
import {
  act,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';

type Row = Record<string, unknown>;
let mockRow: Row;
let mockFailReads = false;
const mockWrites: Array<Record<string, unknown>> = [];

jest.mock('@/lib/supabase', () => {
  const applyPatch = (patch: Record<string, unknown>) => {
    mockWrites.push(patch);
    const next = { ...mockRow, ...patch };
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
            maybeSingle: async () => {
              if (mockFailReads) throw new Error('network lost');
              return { data: { ...mockRow }, error: null };
            },
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
  useAnalytics: () => ({
    trackArrivalDateChanged: mockTrackChanged,
    trackScreen: jest.fn(),
    trackUserSignedOut: jest.fn(),
    trackAccountDeleted: jest.fn(),
  }),
}));
jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// Account Settings page collaborators that are not under test.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/BackHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/components/profile/ProfilePictureUpload', () => ({
  ProfilePictureUpload: () => null,
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'u1',
      email: 'a@example.com',
      username: 'a',
      firstName: null,
    },
  }),
}));
jest.mock('@/context/HapticsContext', () => ({
  useHapticsPreference: () => ({
    hapticsEnabled: false,
    setHapticsEnabled: jest.fn(),
  }),
}));
jest.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ currentLanguage: 'en', changeLanguage: jest.fn() }),
}));
jest.mock('@/services/push/pushNotifications', () => ({
  unregisterPushToken: jest.fn(),
}));

import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { updateArrivalDate } from '@/services/onboarding/updateArrivalDate';
import AccountSettingsPage from '@/app/account-settings';

let client: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client }, children);

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
  mockRow = {
    id: 'u1',
    persona: 'skilled_worker',
    arrival_date: '2026-12-02',
    stage: '0',
    preferred_language: 'en',
    wants_reminders: false,
    onboarding_completed: true,
    city: 'Toronto',
    province: 'ON',
    goals: ['learn_something'],
  };
  mockFailReads = false;
  mockWrites.length = 0;
  mockTrackChanged.mockReset();
  client = createTestQueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const renderEditor = (refreshStage: () => Promise<unknown> = async () => {}) =>
  renderHook(
    () =>
      useArrivalDateEditor({
        userId: 'u1',
        arrivalDate: '2026-12-02',
        refreshStage,
        refreshUser: () => undefined,
        refetchChecklist: () => undefined,
        applyConfirmedArrival: () => undefined,
      }),
    { wrapper }
  );

describe('a saved arrival date and the notification setting', () => {
  it('keeps the new date when notifications change afterwards', async () => {
    const page = render(React.createElement(AccountSettingsPage), { wrapper });
    // The page reads the onboarding profile into the shared cache.
    await waitFor(() =>
      expect(client.getQueryData(['onboardingProfile', 'u1'])).toBeTruthy()
    );

    const editor = renderEditor();
    act(() => editor.result.current.open());
    await act(async () => {
      await editor.result.current.save('2027-01-01');
    });
    expect(mockRow.arrival_date).toBe('2027-01-01');

    // The switch is disabled until the page has read the profile.
    await waitFor(() =>
      expect(
        page.getByRole('switch', { name: 'settings.learningReminders' }).props
          .accessibilityState.disabled
      ).toBe(false)
    );
    // Run the switch's own onPress. fireEvent.press does not reach this
    // Pressable under the frozen test clock.
    let pressable: any = page.getByRole('switch', {
      name: 'settings.learningReminders',
    });
    while (pressable && typeof pressable.props.onPress !== 'function') {
      pressable = pressable.parent;
    }
    await act(async () => {
      pressable.props.onPress();
    });
    await waitFor(() => expect(mockRow.wants_reminders).toBe(true));

    expect(mockRow.arrival_date).toBe('2027-01-01');
    expect(mockRow.stage).toBe('0');
    // The notification write sends only the preference.
    expect(mockWrites.at(-1)).toEqual({ wants_reminders: true });
  });

  it('updates the cached onboarding profile as soon as the write is confirmed', async () => {
    const profile = renderHook(() => useOnboardingProfile('u1'), { wrapper });
    await waitFor(() =>
      expect(profile.result.current.data?.arrival_date).toBe('2026-12-02')
    );

    const editor = renderEditor();
    act(() => editor.result.current.open());
    await act(async () => {
      await editor.result.current.save('2026-10-23');
    });

    const cached = client.getQueryData<{
      arrival_date: string;
      stage: number;
      city: string;
    }>(['onboardingProfile', 'u1']);
    expect(cached?.arrival_date).toBe('2026-10-23');
    expect(cached?.stage).toBe(1);
    // Other fields stay as they were.
    expect(cached?.city).toBe('Toronto');
    await waitFor(() =>
      expect(profile.result.current.data?.arrival_date).toBe('2026-10-23')
    );
  });
});

describe('updateArrivalDate result', () => {
  it('returns a numeric stage when the database returns an enum string', async () => {
    const row = await updateArrivalDate('u1', '2027-01-01');
    expect(row).toEqual({ id: 'u1', arrival_date: '2027-01-01', stage: 0 });
    expect(typeof row.stage).toBe('number');
  });
});
