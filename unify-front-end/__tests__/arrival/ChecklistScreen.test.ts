import React from 'react';
import {
  act,
  render as rtlRender,
  screen,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';

const h = React.createElement;

let client: QueryClient;
const render = (ui: React.ReactElement) =>
  rtlRender(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      h(QueryClientProvider, { client }, children),
  });

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));

const mockCapture = jest.fn();
jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({ capture: mockCapture, screen: jest.fn() }),
}));

type StageState = {
  currentStage: number | null;
  stageChanged: boolean;
  persona: string | null;
  arrivalDate: string | null;
  userId: string | null;
  refreshStage: () => Promise<void>;
  applyConfirmedArrival: (confirmed: unknown) => void;
  isLoading: boolean;
  error: string | null;
};
let mockStage: StageState;
const mockUseUserStage = jest.fn();
jest.mock('@/hooks/onboarding/useUserStage', () => ({
  useUserStage: (today?: Date) => {
    mockUseUserStage(today);
    return mockStage;
  },
}));

const mockUseChecklistTasks = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/hooks/checklist/useChecklistTasks', () => ({
  useChecklistTasks: (args: unknown) => mockUseChecklistTasks(args),
}));

const mockRefreshUser = jest.fn();
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({ refreshUser: mockRefreshUser }),
}));

const mockGetOnboardingProfile = jest.fn();
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: (...args: unknown[]) =>
    mockGetOnboardingProfile(...args),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'screen-user' } } })),
    },
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(cb, [cb]);
  },
  useIsFocused: () => true,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));
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
jest.mock('@/hooks/checklist/useRefreshingToday', () => ({
  useRefreshingToday: () => new Date(2026, 9, 23, 12, 0, 0),
}));

import ChecklistScreen from '@/app/(tabs)/Checklist/index';

const stage = (overrides: Partial<StageState> = {}): StageState => ({
  currentStage: 0,
  stageChanged: false,
  persona: 'skilled_worker',
  arrivalDate: '2026-12-02',
  userId: 'screen-user',
  refreshStage: jest.fn().mockResolvedValue(undefined),
  applyConfirmedArrival: jest.fn(),
  isLoading: false,
  error: null,
  ...overrides,
});

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
  client = new QueryClient();
  mockStore.clear();
  mockStage = stage();
  mockUseChecklistTasks.mockReturnValue({
    tasks: [],
    isLoading: false,
    refetch: mockRefetch,
    setTasks: jest.fn(),
  });
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('Checklist screen', () => {
  it('shows the countdown card above the checklist', async () => {
    render(h(ChecklistScreen));
    await flush();
    expect(screen.getByText('Personalized Checklist')).toBeTruthy();
    expect(screen.getByText('40 days until you land')).toBeTruthy();
  });

  it('shows the card to a user with no persona', async () => {
    mockStage = stage({ persona: null, userId: 'no-persona-user' });
    render(h(ChecklistScreen));
    await flush();
    expect(screen.getByText('40 days until you land')).toBeTruthy();
  });

  it('shows the checklist, not the onboarding screen, for an unknown stage', async () => {
    mockStage = stage({
      currentStage: null,
      arrivalDate: null,
      userId: 'unknown-stage-user',
    });
    render(h(ChecklistScreen));
    await flush();
    expect(screen.getByText('Personalized Checklist')).toBeTruthy();
    expect(screen.getByText('Add your own item')).toBeTruthy();
    expect(screen.queryByText(/complete your onboarding/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /until you land/ })).toBeNull();
  });

  it('feeds the stage hook values to the checklist query', async () => {
    mockStage = stage({
      currentStage: null,
      stageChanged: true,
      persona: 'refugee',
      arrivalDate: null,
      userId: 'query-user',
    });
    render(h(ChecklistScreen));
    await flush();
    expect(mockUseChecklistTasks).toHaveBeenLastCalledWith({
      currentStage: null,
      stageChanged: true,
      persona: 'refugee',
      isStageLoading: false,
    });
  });

  it('holds the checklist query back while the stage loads', async () => {
    mockStage = stage({ isLoading: true, currentStage: null });
    render(h(ChecklistScreen));
    await flush();
    expect(mockUseChecklistTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ isStageLoading: true })
    );
  });

  it('hands the stage hook the same local day the card uses', async () => {
    render(h(ChecklistScreen));
    await flush();
    expect(mockUseUserStage).toHaveBeenLastCalledWith(
      new Date(2026, 9, 23, 12, 0, 0)
    );
  });

  it('does not load the persona separately', async () => {
    render(h(ChecklistScreen));
    await flush();
    expect(mockGetOnboardingProfile).not.toHaveBeenCalled();
  });

  it('shows the loading screen while the stage loads', async () => {
    mockStage = stage({ isLoading: true });
    render(h(ChecklistScreen));
    await flush();
    expect(screen.getByText('loading-screen')).toBeTruthy();
  });

  it('refetches the checklist on focus once the profile has loaded', async () => {
    render(h(ChecklistScreen));
    await flush();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
