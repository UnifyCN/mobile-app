// Mounted acceptance: the real Companion screen with its compact task entry and the
// task bottom sheet (direction B, mobile-app#361), driven through user controls.
// The network is the scripted contract stand-in in testSupport/companionActionsServer.ts.
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import * as ReactNative from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { scriptedServer } from '@/testSupport/companionActionsServer';

const { Platform, StyleSheet, TouchableOpacity } = ReactNative;
// The scripted fetch answers every request; nothing leaves the process.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59371';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

let mockUserId: string | null = 'user-1';
let mockCapture: jest.Mock;
const mockGetSession = jest.fn();
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();

const mockPush = jest.fn();
let mockRouteParams: { conversationId?: string } = {};
jest.mock('expo-router', () => ({
  router: { navigate: (...args: unknown[]) => mockPush(...args) },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void) => {
      React.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [callback]);
    },
    useIsFocused: () => true,
  };
});
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const identity = (value: unknown) => value;
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: identity,
    Easing: { out: identity, in: identity, cubic: identity },
    runOnJS: identity,
    interpolate: identity,
    Extrapolate: { CLAMP: 'clamp' },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { View, TouchableOpacity } = require('react-native');
  const gesture: any = {
    onUpdate: () => gesture,
    onEnd: () => gesture,
    enabled: () => gesture,
  };
  return {
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: View,
    TouchableOpacity,
  };
});
jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return {
    KeyboardAvoidingView: View,
    useReanimatedKeyboardAnimation: () => ({
      height: { value: 0 },
      progress: { value: 0 },
    }),
  };
});
jest.mock('react-native-draggable-flatlist', () => ({
  __esModule: true,
  default: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListFooterComponent,
  }: any) =>
    require('react').createElement(
      require('react-native').View,
      null,
      ListHeaderComponent,
      data.map((item: any, index: number) =>
        require('react').createElement(
          require('react').Fragment,
          { key: item.key },
          renderItem({
            item,
            drag: () => {},
            isActive: false,
            getIndex: () => index,
          })
        )
      ),
      ListFooterComponent
    ),
  ScaleDecorator: ({ children }: any) => children,
}));
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9', extra: {} } },
}));
// One client object, as the real provider gives: a new object per render would
// change every analytics callback and re-run the screen's focus effect forever.
const mockPostHog = {
  capture: (...args: unknown[]) => mockCapture(...args),
  screen: () => {},
};
jest.mock('posthog-react-native', () => ({
  usePostHog: () => mockPostHog,
}));
jest.mock('@/context/HapticsContext', () => ({
  useHapticsPreference: () => ({ hapticsEnabled: false }),
}));
// Stable functions, as the real hook returns: a new function on every render
// would re-run the screen's effects without end.
const mockRefreshStage = jest.fn().mockResolvedValue(undefined);
const mockApplyConfirmedArrival = jest.fn();
jest.mock('@/hooks/onboarding/useUserStage', () => ({
  useUserStage: () => ({
    currentStage: 1,
    stageChanged: false,
    arrivalDate: null,
    userId: mockUserId,
    refreshStage: mockRefreshStage,
    applyConfirmedArrival: mockApplyConfirmedArrival,
    isLoading: false,
  }),
}));
jest.mock('@/hooks/checklist/useRefreshingToday', () => ({
  useRefreshingToday: () => new Date(2026, 9, 23, 12, 0, 0),
}));
const mockRefreshUser = jest.fn();
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: mockUserId ? { id: mockUserId, isPremium: false } : null,
    refreshUser: mockRefreshUser,
  }),
}));
// Conversation, generation and allowance hooks are not under test here.
let mockMessageCount = 0;
jest.mock('@/hooks/companion/useConversationMessages', () => ({
  useConversationMessages: () => ({ data: [], isLoading: false }),
}));
jest.mock('@/hooks/companion/useChatbotUsage', () => ({
  useChatbotUsage: () => ({ data: { message_count: mockMessageCount } }),
}));
jest.mock('@/hooks/companion/useCompanionReviewPrompt', () => ({
  useCompanionReviewPrompt: () => {},
}));
jest.mock('@/hooks/companion/usePersonalizedStarters', () => ({
  usePersonalizedStarters: () => ({ data: undefined }),
}));
const mockSendMessage = jest.fn();
jest.mock('@/hooks/companion/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: mockSendMessage,
    isLoading: false,
    isWaitingForBot: false,
    lastSuggestedNextSteps: [],
    lastVerified: null,
    streamingBotMessage: null,
  }),
}));
jest.mock('@/utils/gemini', () => ({
  AICompanionBusyError: class extends Error {},
  AICompanionLimitError: class extends Error {},
}));
jest.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/components/companion/AnimatedDottedBackground', () => ({
  AnimatedDottedBackground: () => null,
}));
jest.mock('@/components/companion/StarterPrompts', () => ({
  StarterPrompts: () => null,
}));
jest.mock('@/components/companion/PartnerSpotlightBanner', () => () => null);
jest.mock('@/components/icons/SendIcon.svg', () => () => null);
jest.mock('lucide-react-native', () => ({
  History: () => null,
  Plus: () => null,
}));
jest.mock('@/components/common/BottomSheet', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } } }),
      getSession: () => mockGetSession(),
      onAuthStateChange: (
        listener: (event: string, session: unknown) => void
      ) => {
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
  },
}));
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: jest.fn(async () => ({
    persona: 'international_student',
    province: 'British Columbia',
  })),
}));
jest.mock('@/sanity-custom', () => ({
  sanityClient: {
    fetch: jest.fn(async () => [
      {
        _id: 'sin',
        _type: 'checklist',
        title: 'Get a SIN',
        class: 'do_now',
        class_order: 1,
      },
    ]),
  },
}));
jest.mock('@/services/checklist/getUserTasks', () => ({
  getUserTasks: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn().mockResolvedValue([]),
  deleteCustomChecklistTask: jest.fn(),
  setCustomChecklistTaskCompletion: jest.fn(),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: jest.fn().mockResolvedValue([]),
  upsertChecklistTaskOrder: jest.fn(),
}));
jest.mock('@/services/checklist/setChecklistItemCompletion', () => ({
  setChecklistItemCompletion: jest.fn(),
}));
jest.mock('@/services/checklist/setChecklistItemDismissed', () => ({
  setChecklistItemDismissed: jest.fn(),
}));
jest.mock('@/components/home/HomeHeader', () => () => null);
jest.mock('@/components/LoadingScreen', () => () => null);
jest.mock('@/components/partners/SpotlightRow', () => () => null);

import CompanionScreen from '@/app/(tabs)/companion/index';
import { usePushNotifications } from '@/hooks/usePushNotifications';
function RootListener() {
  usePushNotifications();
  return null;
}

function testI18n() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return i18n;
}

const clients: QueryClient[] = [];
function renderScreen() {
  // gcTime Infinity: no garbage-collection timer outlives the test.
  const client = createTestQueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const i18n = testI18n();
  const tree = () => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RootListener />
        <CompanionScreen />
      </I18nextProvider>
    </QueryClientProvider>
  );
  const mounted = render(tree());
  return {
    ...mounted,
    rerenderRoute(params: { conversationId?: string }) {
      mockRouteParams = params;
      mounted.rerender(tree());
    },
  };
}

let server: ReturnType<typeof scriptedServer>;
const realFetch = global.fetch;
let userCounter = 0;

beforeEach(() => {
  mockRouteParams = {};
  mockUserId = `companion-user-${++userCounter}`;
  mockCapture = jest.fn();
  mockPush.mockReset();
  mockSendMessage.mockReset().mockResolvedValue(undefined);
  mockGetSession.mockReset().mockImplementation(async () => ({
    data: {
      session: mockUserId
        ? { user: { id: mockUserId }, access_token: `jwt-${mockUserId}` }
        : null,
    },
  }));
  mockMessageCount = 0;
  server = scriptedServer({
    'sanity:sin': { state: 'in_progress', revision: 2 },
  });
  global.fetch = server.fetch as unknown as typeof fetch;
});

const mockResponseListeners = new Set<(v: any) => void>();
let mockLast: any = null;
const mockCold = jest.fn(async () => mockLast);
const mockClear = jest.fn(() => {
  mockLast = null;
});
const mockTokenListener = jest.fn();
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setBadgeCountAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
    canAskAgain: false,
  })),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({
    data: 'ExponentPushToken[synthetic369-root]',
  })),
  addPushTokenListener: (cb: any) => {
    mockTokenListener.mockImplementation(cb);
    return { remove() {} };
  },
  addNotificationResponseReceivedListener: (cb: any) => {
    mockResponseListeners.add(cb);
    return { remove: () => mockResponseListeners.delete(cb) };
  },
  getLastNotificationResponseAsync: () => mockCold(),
  getLastNotificationResponse: () => mockLast,
  clearLastNotificationResponse: () => mockClear(),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@/services/push/pushNotifications', () => ({
  registerForPushNotifications: async () => ({
    permission: 'denied',
    prompted: false,
  }),
  addNotificationResponseListener: (cb: any) =>
    require('expo-notifications').addNotificationResponseReceivedListener(cb),
}));
const delivery = '44444444-4444-4444-8444-444444444444';
function notification(id = delivery) {
  return {
    notification: {
      request: {
        content: {
          data: {
            type: 'companion_reminder',
            delivery_id: id,
            task_id: 'custom:foreign',
            url: '/wrong',
          },
        },
      },
    },
  };
}
async function tap(value: any = notification()) {
  await act(async () => {
    mockLast = value;
    for (const cb of mockResponseListeners) cb(value);
  });
}
function withResolve(
  target: any = { target: 'available', task_ref: 'sanity:sin' }
) {
  const fallback = server.fetch;
  const request = jest.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (body.action === 'push_resolve')
      return { status: 200, json: async () => target };
    return fallback(url as never, init);
  });
  global.fetch = request as unknown as typeof fetch;
  return request;
}
beforeEach(() => {
  mockLast = null;
  mockCold.mockReset().mockResolvedValue(null);
  mockClear.mockClear();
});
afterEach(() => {
  clients.splice(0).forEach(c => c.clear());
  global.fetch = realFetch;
});

it('review control: approved current target opens through the root hook and actual sheet', async () => {
  withResolve();
  renderScreen();
  const composer = await screen.findByPlaceholderText('Ask anything...');
  fireEvent.changeText(composer, 'Review draft');
  await tap();
  const sheet = screen.getByTestId('companion-task-sheet');
  await waitFor(() =>
    expect(within(sheet).getByText('Get a SIN')).toBeTruthy()
  );
  expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe(
    'Review draft'
  );
  expect(mockPush).toHaveBeenCalledTimes(1);
});
it('review control: unavailable resolution replaces an open task with a generic result', async () => {
  withResolve({ target: 'unavailable' });
  renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
  fireEvent.press(await screen.findByRole('button', { name: /Get a SIN/ }));
  await tap();
  const sheet = screen.getByTestId('companion-task-sheet');
  expect(
    within(sheet).getByText(en.companionPush.targetUnavailable)
  ).toBeTruthy();
  expect(within(sheet).queryByText('Get a SIN')).toBeNull();
});
it('review: a new notification preserves the open task edit draft', async () => {
  withResolve({ target: 'unavailable' });
  renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
  fireEvent.press(await screen.findByRole('button', { name: /Get a SIN/ }));
  const instant = await screen.findByLabelText(en.reminders.instant);
  fireEvent.changeText(instant, '2027-12-01T14:00-08:00');
  await tap();
  expect(screen.getByTestId('companion-task-sheet')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: en.taskActions.close }));
  fireEvent.press(screen.getByRole('button', { name: /Your tasks/ }));
  fireEvent.press(await screen.findByRole('button', { name: /Get a SIN/ }));
  expect((await screen.findByLabelText(en.reminders.instant)).props.value).toBe(
    '2027-12-01T14:00-08:00'
  );
});

it('review: a notification selects its task while saved details are open inside the sheet', async () => {
  withResolve();
  renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
  fireEvent.press(
    await screen.findByRole('button', {
      name: en.savedDetails.entryTitle + ', ' + en.savedDetails.entryHint,
    })
  );
  await screen.findByText(en.savedDetails.title);
  await tap();
  const sheet = screen.getByTestId('companion-task-sheet');
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(within(sheet).queryByText(en.savedDetails.title)).toBeNull();
  expect(within(sheet).getByText('Get a SIN')).toBeTruthy();
});
it('review: fresh available notification revalidates an already open cached checklist', async () => {
  const sanity = require('@/sanity-custom').sanityClient.fetch;
  renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
  fireEvent.press(await screen.findByRole('button', { name: /Get a SIN/ }));
  await screen.findByLabelText(en.reminders.instant);
  // New same-stage published task is accessible now. The mounted sheet holds the older list.
  sanity.mockResolvedValueOnce([
    {
      _id: 'sin',
      _type: 'checklist',
      title: 'Get a SIN',
      class: 'do_now',
      class_order: 1,
    },
    {
      _id: 'new-published',
      _type: 'checklist',
      title: 'New accessible task',
      class: 'do_now',
      class_order: 2,
    },
  ]);
  const before = sanity.mock.calls.length;
  withResolve({ target: 'available', task_ref: 'sanity:new-published' });
  await tap();
  const sheet = screen.getByTestId('companion-task-sheet');
  await waitFor(() =>
    expect(within(sheet).queryByText(en.taskActions.loading)).toBeNull()
  );
  console.log(
    'CHECKLIST READS before=' + before + ' after=' + sanity.mock.calls.length
  );
  expect(
    within(sheet).queryByText(en.companionPush.targetUnavailable)
  ).toBeNull();
  expect(within(sheet).getByText('New accessible task')).toBeTruthy();
});

it('does not acknowledge a notification before the fresh checklist finishes', async () => {
  withResolve();
  renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
  fireEvent.press(await screen.findByRole('button', { name: /Get a SIN/ }));
  await screen.findByLabelText(en.reminders.instant);
  let release!: (rows: unknown[]) => void;
  const pending = new Promise<unknown[]>(resolve => {
    release = resolve;
  });
  require('@/sanity-custom').sanityClient.fetch.mockImplementationOnce(
    () => pending
  );
  await tap();
  const sheet = screen.getByTestId('companion-task-sheet');
  expect(within(sheet).getByText(en.taskActions.loading)).toBeTruthy();
  expect(mockClear).not.toHaveBeenCalled();
  await act(async () =>
    release([
      {
        _id: 'sin',
        _type: 'checklist',
        title: 'Get a SIN',
        class: 'do_now',
        class_order: 1,
      },
    ])
  );
  await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
  expect(within(sheet).getByText('Get a SIN')).toBeTruthy();
});
