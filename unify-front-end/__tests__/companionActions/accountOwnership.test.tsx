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
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { scriptedServer } from '@/testSupport/companionActionsServer';

// The scripted fetch answers every request; nothing leaves the process.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59371';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

let mockUserId = 'user-1';
let mockCapture: jest.Mock;
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();
const sessionOf = (id: string) => ({
  data: { session: { user: { id }, access_token: `jwt-${id}` } },
});
const mockGetSession = jest.fn(async () => sessionOf(mockUserId));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
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
  default: ({ data, renderItem, ListHeaderComponent, ListFooterComponent }: any) =>
    require('react').createElement(
      require('react-native').View,
      null,
      ListHeaderComponent,
      data.map((item: any, index: number) =>
        require('react').createElement(
          require('react').Fragment,
          { key: item.key },
          renderItem({ item, drag: () => {}, isActive: false, getIndex: () => index })
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
    currentUser: { id: mockUserId, isPremium: false },
    refreshUser: mockRefreshUser,
  }),
}));
// The actual conversation, message and send hooks run. Only their services and
// the model stream are scripted; nothing leaves the process.
let mockMessageCount = 0;
const mockConversations = jest.fn();
const mockMessages = jest.fn();
const mockCreate = jest.fn();
const mockSave = jest.fn();
const mockStream = jest.fn();
jest.mock('@/services/companion/getConversations', () => ({
  getConversations: (...a: unknown[]) => mockConversations(...a),
}));
jest.mock('@/services/companion/getConversationMessages', () => ({
  getConversationMessages: (...a: unknown[]) => mockMessages(...a),
}));
jest.mock('@/services/companion/createConversation', () => ({
  createConversation: (...a: unknown[]) => mockCreate(...a),
}));
jest.mock('@/services/companion/saveMessage', () => ({
  saveMessage: (...a: unknown[]) => mockSave(...a),
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
jest.mock('@/utils/gemini', () => ({
  AICompanionBusyError: class extends Error {},
  AICompanionLimitError: class extends Error {},
  streamGeminiAPI: (...a: unknown[]) => mockStream(...a),
}));
jest.mock('@/components/icons/NewChat.svg', () => () => null);
jest.mock('@/components/icons/ChatListIcon.svg', () => () => null);
jest.mock('@/components/BackHeader', () => () => null);
// Its looping animation would outlive this file and fire in the next suite.
jest.mock('@/components/companion/TypingIndicator', () => ({
  TypingIndicator: () => null,
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
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
jest.mock('lucide-react-native', () => ({ History: () => null, Plus: () => null }));
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
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        mockAuthListeners.add(listener);
        return {
          data: { subscription: { unsubscribe: () => mockAuthListeners.delete(listener) } },
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

import { TouchableOpacity } from 'react-native';
import CompanionScreen from '@/app/(tabs)/companion/index';
import HistoryScreen from '@/app/(tabs)/companion/history';

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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={testI18n()}>
        <CompanionScreen />
        <HistoryScreen />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

let server: ReturnType<typeof scriptedServer>;
const realFetch = global.fetch;
let userCounter = 0;

beforeEach(() => {
  mockUserId = `companion-user-${++userCounter}`;
  mockCapture = jest.fn();
  mockPush.mockReset();
  mockMessageCount = 0;
  server = scriptedServer({
    'sanity:sin': { state: 'in_progress', revision: 2 },
  });
  global.fetch = server.fetch as unknown as typeof fetch;
});
beforeEach(() => {
  mockGetSession.mockImplementation(async () => sessionOf(mockUserId));
  mockConversations.mockReset().mockResolvedValue([]);
  mockMessages.mockReset().mockResolvedValue([]);
  mockCreate.mockReset();
  mockSave.mockReset().mockResolvedValue(undefined);
  mockStream.mockReset();
});
afterEach(() => {
  global.fetch = realFetch;
  clients.splice(0).forEach(client => client.clear());
});


// Account ownership of conversation history and pending sends (#361 Spec r3).
const composer = () => screen.getByPlaceholderText('Ask anything...');
const sendButton = () => {
  const button = screen
    .UNSAFE_getAllByType(TouchableOpacity)
    .find(b => StyleSheet.flatten(b.props.style)?.borderRadius === 20);
  if (!button) throw new Error('send control missing');
  return button;
};
async function authEvent(userId: string | null, event = 'SIGNED_IN') {
  if (userId) mockUserId = userId;
  await act(async () => {
    for (const listener of [...mockAuthListeners])
      listener(event, userId ? sessionOf(userId).data.session : null);
  });
}
const readAs = (userId: string) =>
  server.fetch.mock.calls.some(
    call =>
      (call[1] as unknown as { headers: Record<string, string> }).headers
        .authorization === `Bearer jwt-${userId}`
  );
async function bLoaded(userId: string) {
  await waitFor(() => expect(readAs(userId)).toBe(true));
  await waitFor(() =>
    expect(
      within(screen.getByRole('button', { name: /Your tasks/ })).getByText(
        'In progress: 1 · Waiting: 0'
      )
    ).toBeTruthy()
  );
}
const conversation = (id: string, title: string) => ({
  conversation_identifier: id,
  title,
  updated_at: new Date().toISOString(),
});
/** Each service call answers for the account signed in when it was made. */
const titlesByAccount = (titles: Record<string, string>) =>
  mockConversations.mockImplementation(async () => {
    const who = mockUserId;
    return titles[who] ? [conversation(`c-${who}`, titles[who])] : [];
  });

describe('account ownership of history and pending sends (mobile)', () => {
  it('mounted History shows only the signed-in account; a token refresh keeps it', async () => {
    const a = mockUserId;
    titlesByAccount({ [a]: 'Private A conversation', 'owner-b': 'Normal B conversation' });
    renderScreen();
    await screen.findByText('Private A conversation');
    await authEvent(a, 'TOKEN_REFRESHED');
    expect(screen.getByText('Private A conversation')).toBeTruthy();

    await authEvent('owner-b');
    await bLoaded('owner-b');
    await screen.findByText('Normal B conversation');
    expect(screen.queryByText('Private A conversation')).toBeNull();
  });

  it("a held A history read that ends after B signed in never shows A's title", async () => {
    const a = mockUserId;
    let release: () => void = () => {};
    mockConversations.mockImplementation(async () => {
      const who = mockUserId;
      if (who === a) await new Promise<void>(r => (release = r));
      return [conversation(`c-${who}`, who === a ? 'Private A held' : 'Normal B held')];
    });
    renderScreen();
    await waitFor(() => expect(mockConversations).toHaveBeenCalled());
    await authEvent('held-b');
    await screen.findByText('Normal B held');
    await act(async () => release());
    await act(async () => {});
    expect(screen.queryByText('Private A held')).toBeNull();
  });

  it("a send that fails after B signed in does not put A's question in B's composer", async () => {
    let rejectA: (e: Error) => void = () => {};
    mockCreate.mockImplementationOnce(
      () => new Promise((_r, reject) => (rejectA = reject))
    );
    renderScreen();
    fireEvent.changeText(await screen.findByPlaceholderText('Ask anything...'), 'Private A pending question');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());

    await authEvent('late-fail-b');
    await bLoaded('late-fail-b');
    expect(composer().props.value).toBe('');
    // B is not blocked by A's pending send.
    expect(composer().props.editable).toBe(true);
    await act(async () => rejectA(new Error('A request refused')));
    expect(composer().props.value).toBe('');
    expect(screen.queryByText('Private A pending question')).toBeNull();
  });

  it("a send that succeeds after B signed in does not open A's conversation in B", async () => {
    let resolveA: (v: unknown) => void = () => {};
    mockCreate.mockImplementationOnce(() => new Promise(r => (resolveA = r)));
    mockStream.mockImplementation(() => {});
    renderScreen();
    fireEvent.changeText(await screen.findByPlaceholderText('Ask anything...'), 'Private A sent question');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());

    await authEvent('late-ok-b');
    await bLoaded('late-ok-b');
    await act(async () => resolveA({ conversation_identifier: 'c-private-a' }));
    await act(async () => {});
    expect(mockMessages).not.toHaveBeenCalledWith('c-private-a');
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Private A sent question')).toBeNull();
    expect(composer().props.value).toBe('');
  });

  it('sign-out and signing in again drop the unsent message and a pending failure stays dropped', async () => {
    const a = mockUserId;
    let rejectA: (e: Error) => void = () => {};
    mockCreate.mockImplementationOnce(
      () => new Promise((_r, reject) => (rejectA = reject))
    );
    renderScreen();
    fireEvent.changeText(await screen.findByPlaceholderText('Ask anything...'), 'Question before sign-out');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    await authEvent(null, 'SIGNED_OUT');
    await authEvent(a);
    await act(async () => rejectA(new Error('refused after sign-out')));
    expect(composer().props.value).toBe('');
  });

  it('a token refresh of the same account keeps a failed send recoverable', async () => {
    const a = mockUserId;
    let rejectA: (e: Error) => void = () => {};
    mockCreate.mockImplementationOnce(
      () => new Promise((_r, reject) => (rejectA = reject))
    );
    renderScreen();
    fireEvent.changeText(await screen.findByPlaceholderText('Ask anything...'), 'Same account question');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    await authEvent(a, 'TOKEN_REFRESHED');
    await act(async () => rejectA(new Error('refused')));
    await waitFor(() => expect(composer().props.value).toBe('Same account question'));
  });

  it('adapter order: initial session replies that arrive after a later sign-in do not switch back', async () => {
    const a = mockUserId;
    const initial: (() => void)[] = [];
    mockGetSession.mockImplementation(
      () => new Promise(r => initial.push(() => r(sessionOf(a))))
    );
    titlesByAccount({ [a]: 'Private A order', 'order-b': 'Normal B order' });
    renderScreen();
    await waitFor(() => expect(initial.length).toBeGreaterThan(0));
    mockGetSession.mockImplementation(async () => sessionOf(mockUserId));
    await authEvent('order-b');
    await screen.findByText('Normal B order');
    fireEvent.changeText(composer(), 'B draft');
    // Every session read started before the sign-in now answers with A.
    await act(async () => initial.forEach(release => release()));
    await act(async () => {});
    expect(composer().props.value).toBe('B draft');
    expect(screen.queryByText('Private A order')).toBeNull();
  });
});
