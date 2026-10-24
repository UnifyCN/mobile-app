/**
 * The real Checklist screen, useUserStage, useRefreshingToday and
 * useChecklistTasks, with a real query client. Profile and Sanity IO are
 * controlled. Frozen clock: a user lands on 2026-10-24 and the app stays
 * mounted across local midnight.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';

const h = React.createElement;

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
  },
}));
// One client for every render, as the real provider gives. A new object per
// render would change trackScreen, and with it the focus callback, on every
// render.
const mockPostHog = { capture: jest.fn(), screen: jest.fn() };
jest.mock('posthog-react-native', () => ({
  usePostHog: () => mockPostHog,
}));

const mockGetOnboardingProfile = jest.fn();
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: (...args: unknown[]) =>
    mockGetOnboardingProfile(...args),
}));
jest.mock('@/services/onboarding/syncStageCache', () => ({
  syncStageCache: jest.fn().mockResolvedValue(false),
}));

const mockGetChecklist = jest.fn();
jest.mock('@/services/checklist/getChecklistWithUserProgress', () => ({
  getChecklistWithUserProgress: (...args: unknown[]) =>
    mockGetChecklist(...args),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: async () => [],
  upsertChecklistTaskOrder: jest.fn(),
}));
jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({ refreshUser: jest.fn() }),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'rollover-user' } } }),
      getSession: async () => ({
        data: { session: { user: { id: 'rollover-user' } } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
}));

let mockFocusCallbacks: Array<() => void | (() => void)> = [];
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    require('react').useEffect(() => {
      mockFocusCallbacks.push(cb);
      return cb();
    }, [cb]);
  },
  useIsFocused: () => true,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('react-native-confetti-cannon', () => 'ConfettiCannon');
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-gesture-handler', () => ({
  TouchableOpacity: require('react-native').TouchableOpacity,
}));
jest.mock('react-native-draggable-flatlist', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({
      ListHeaderComponent,
      ListFooterComponent,
    }: {
      ListHeaderComponent: React.ReactNode;
      ListFooterComponent: React.ReactNode;
    }) =>
      createElement(
        View,
        { testID: 'list' },
        ListHeaderComponent,
        ListFooterComponent
      ),
    ScaleDecorator: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('@/components/home/HomeHeader', () => 'TabHeader');
jest.mock('@/components/LoadingScreen', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => require('react').createElement(Text, null, 'loading-screen'),
  };
});
jest.mock('@/components/checklist/TaskDetailModal', () => ({
  TaskDetailModal: () => null,
}));
jest.mock('@/components/checklist/ChecklistItem', () => ({
  ChecklistItem: () => null,
}));
jest.mock('@/components/checklist/ChecklistSectionHeader', () => ({
  ChecklistSectionHeader: () => null,
}));
jest.mock('@/context/HapticsContext', () => ({
  useHapticsPreference: () => ({ hapticsEnabled: false }),
}));
jest.mock('@/components/common/BottomSheet', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { AppState } from 'react-native';
import ChecklistScreen from '@/app/(tabs)/Checklist/index';

let client: QueryClient;
let foreground: ((state: string) => void) | undefined;

const requestedSlugs = () =>
  mockGetChecklist.mock.calls.map(call => call[2] as string);

const renderScreen = () =>
  render(
    h(QueryClientProvider, { client }, h(ChecklistScreen))
  );

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
    react: { useSuspense: false },
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockFocusCallbacks = [];
  foreground = undefined;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.useFakeTimers({
    now: new Date(2026, 9, 23, 23, 59),
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
  mockGetOnboardingProfile.mockResolvedValue({
    id: 'rollover-user',
    persona: 'skilled_worker',
    arrival_date: '2026-10-24',
    stage: '0',
  });
  mockGetChecklist.mockResolvedValue([]);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _name: string,
    cb: (state: string) => void
  ) => {
    foreground = cb;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('arrival midnight on a mounted Checklist', () => {
  it('switches the card and the task query when the app returns to the foreground', async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('1 day until you land')).toBeTruthy()
    );
    await waitFor(() => expect(requestedSlugs()).toContain('not_arrived'));

    jest.setSystemTime(new Date(2026, 9, 24, 0, 1));
    act(() => foreground?.('active'));

    await waitFor(() =>
      expect(screen.getByText('Your first 30 days')).toBeTruthy()
    );
    await waitFor(() =>
      expect(requestedSlugs().at(-1)).toBe('arrived_0_3_months')
    );
  });

  it('switches the card and the task query when the tab gains focus', async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('1 day until you land')).toBeTruthy()
    );
    await waitFor(() => expect(requestedSlugs()).toContain('not_arrived'));

    jest.setSystemTime(new Date(2026, 9, 24, 0, 1));
    act(() => {
      mockFocusCallbacks.forEach(cb => cb());
    });

    await waitFor(() =>
      expect(screen.getByText('Your first 30 days')).toBeTruthy()
    );
    await waitFor(() =>
      expect(requestedSlugs().at(-1)).toBe('arrived_0_3_months')
    );
  });
});

describe('initial load', () => {
  it('sends no checklist query before the stage is known', async () => {
    const profile = deferred<Record<string, unknown>>();
    mockGetOnboardingProfile.mockReturnValue(profile.promise);
    renderScreen();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requestedSlugs()).toEqual([]);

    await act(async () => {
      profile.resolve({
        id: 'rollover-user',
        persona: 'skilled_worker',
        arrival_date: '2026-10-24',
        stage: '0',
      });
    });
    // Focus refetches may repeat a request, but never ask for another stage.
    await waitFor(() => expect(requestedSlugs().length).toBeGreaterThan(0));
    expect(new Set(requestedSlugs())).toEqual(new Set(['not_arrived']));
  });
});
