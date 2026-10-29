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

let mockUserId = 'user-1';
let mockCapture: jest.Mock;
const mockGetSession = jest.fn();
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();

const mockPush = jest.fn();
let mockRouteParams: { conversationId?: string } = {};
jest.mock('expo-router', () => ({
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

import CompanionScreen from '@/app/(tabs)/companion/index';

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
    data: { session: { user: { id: mockUserId }, access_token: `jwt-${mockUserId}` } },
  }));
  mockMessageCount = 0;
  server = scriptedServer({
    'sanity:sin': { state: 'in_progress', revision: 2 },
  });
  global.fetch = server.fetch as unknown as typeof fetch;
});

describe('native R5 draft and live-text findings', () => {
  async function ready() {
    const app = renderScreen();
    await screen.findByPlaceholderText('Ask anything...');
    await waitFor(() => expect(server.fetch).toHaveBeenCalled());
    return app;
  }

  it('N02: history selection and return keep the current account draft', async () => {
    const app = await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Question kept through history');
    app.rerenderRoute({ conversationId: 'saved-history-a' });
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Question kept through history');
    app.rerenderRoute({ conversationId: 'saved-history-b' });
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Question kept through history');
    app.rerenderRoute({});
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Question kept through history');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('N02: a same-account remount keeps the unsent message', async () => {
    const app = await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Draft before leaving the screen');
    app.unmount();
    await ready();
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Draft before leaving the screen');
  });

  it('N02: New conversation navigates without silently clearing a typed draft', async () => {
    const app = await ready();
    app.rerenderRoute({ conversationId: 'saved-history-a' });
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Draft before New conversation');
    fireEvent.press(screen.getByLabelText(en.companion.newChat));
    app.rerenderRoute({});
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Draft before New conversation');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  const sendButton = () => {
    const button = screen.UNSAFE_getAllByType(TouchableOpacity).find(
      node => StyleSheet.flatten(node.props.style)?.borderRadius === 20
    );
    if (!button) throw new Error('Send control is missing');
    return button;
  };

  it('N02: sending clears the stored draft across a same-account remount', async () => {
    const app = await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Question sent once');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    app.unmount();
    await ready();
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('');
  });

  it('N02: a late send failure keeps the newer draft typed after navigation', async () => {
    let rejectSend: (error: Error) => void = () => {};
    mockSendMessage.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject;
    }));
    const app = await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'First question being sent');
    fireEvent.press(sendButton());
    app.rerenderRoute({ conversationId: 'saved-history-b' });
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'New question after navigation');
    await act(async () => rejectSend(new Error('Save failed')));
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('New question after navigation');
  });

  it('N02: a failed send restores its question when no newer draft exists', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Save failed'));
    await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Question to retry');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Question to retry'));
  });

  it('N02: an unresolved session hides the stored draft, then restores it only for its owner', async () => {
    const app = await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Private draft before session restart');
    app.unmount();
    let resolveSession: (value: unknown) => void = () => {};
    mockGetSession.mockImplementation(() => new Promise(resolve => { resolveSession = resolve; }));
    renderScreen();
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('');
    await act(async () => resolveSession({
      data: { session: { user: { id: mockUserId }, access_token: `jwt-${mockUserId}` } },
    }));
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Private draft before session restart');
  });

  it('N02: an account change while away clears the previous draft permanently', async () => {
    const a = mockUserId;
    const app = await ready();
    fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Private draft of A while away');
    app.unmount();
    mockUserId = 'native-draft-b';
    const b = await ready();
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('');
    b.unmount();
    mockUserId = a;
    await ready();
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('');
  });

  it('N03: large and live text sizes do not create duplicate sibling keys', async () => {
    const dimensions = jest.spyOn(ReactNative, 'useWindowDimensions');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      dimensions.mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1.786 });
      const app = await ready();
      fireEvent.changeText(screen.getByPlaceholderText('Ask anything...'), 'Draft at large text');
      dimensions.mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 2.143 });
      app.rerenderRoute({});
      expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Draft at large text');
      const duplicates = errors.mock.calls.filter(args => args.map(String).join(' ').includes('same key'));
      expect(duplicates).toEqual([]);
    } finally {
      dimensions.mockRestore();
      errors.mockRestore();
    }
  });
});
afterEach(() => {
  global.fetch = realFetch;
  clients.splice(0).forEach(client => client.clear());
});

describe('Companion task entry and sheet (mobile)', () => {
  it('opens saved tasks from a compact entry, changes one in the sheet, and keeps the typed message', async () => {
    renderScreen();
    const composer = await screen.findByPlaceholderText('Ask anything...');
    fireEvent.changeText(composer, 'How do I open a bank account?');

    const entry = await screen.findByRole('button', { name: /Your tasks/ });
    await waitFor(() =>
      expect(within(entry).getByText('In progress: 1 · Waiting: 0')).toBeTruthy()
    );
    fireEvent.press(entry);

    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: /Get a SIN/ }));
    const inProgress = await within(sheet).findByRole('radio', { name: 'In progress' });
    await waitFor(() => expect(inProgress).toBeSelected());

    fireEvent.press(within(sheet).getByRole('radio', { name: 'Waiting' }));
    expect(
      await within(sheet).findByText('Changed from In progress to Waiting')
    ).toBeTruthy();
    expect(server.writes()[0].operations[0]).toEqual({
      type: 'task.set_state',
      task_ref: 'sanity:sin',
      state: 'waiting',
      expected_revision: 2,
    });
    expect(mockSendMessage).not.toHaveBeenCalled();

    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe(
      'How do I open a bank account?'
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('button', { name: /Your tasks/ })).getByText(
          'In progress: 0 · Waiting: 1'
        )
      ).toBeTruthy()
    );
    const events = mockCapture.mock.calls.filter(([name]) => name === 'companion_action_result');
    expect(events[0][1]).toMatchObject({ entry_surface: 'companion', outcome: 'applied' });
  });

  it('at the AI limit, task controls still save and no model request is made', async () => {
    mockMessageCount = 6; // the daily allowance is used up
    renderScreen();
    expect(
      await screen.findByPlaceholderText(en.companion.dailyLimitReached)
    ).toBeTruthy();
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: /Get a SIN/ }));
    const inProgress = await within(sheet).findByRole('radio', { name: 'In progress' });
    await waitFor(() => expect(inProgress).toBeSelected());
    expect(within(sheet).getByLabelText(en.reminders.instant)).toBeTruthy();
    expect(within(sheet).getByRole('button', {name:en.reminders.review})).toBeEnabled();
    fireEvent.press(within(sheet).getByRole('radio', { name: 'Completed' }));
    expect(
      await within(sheet).findByText('Changed from In progress to Completed')
    ).toBeTruthy();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Undo this change' }));
    expect(
      await within(sheet).findByText('Undid a change. The task is back to In progress.')
    ).toBeTruthy();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(
      server.fetch.mock.calls.every(call =>
        String(call[0]).endsWith('/functions/v1/companion-actions')
      )
    ).toBe(true);
  });

  it('the sheet opens Checklist through existing navigation', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: /Get a SIN/ }));
    fireEvent.press(await within(sheet).findByRole('button', { name: 'Open in Checklist' }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/Checklist');
  });
});

// Correction from the #361 Spec review (F8).
describe('review corrections (mobile sheet)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('F8: on Android, the sheet header and Checklist link are at least 48dp', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: /Get a SIN/ }));
    await within(sheet).findByRole('radio', { name: 'In progress' });
    const size = (name: string) =>
      StyleSheet.flatten(within(sheet).getByRole('button', { name }).props.style);
    for (const name of ['Back to tasks', 'Close']) {
      expect(size(name).width).toBeGreaterThanOrEqual(48);
      expect(size(name).height).toBeGreaterThanOrEqual(48);
    }
    expect(size('Open in Checklist').minHeight).toBeGreaterThanOrEqual(48);
  });
});

// Corrections from the #361 Spec review round 2 (F1 on mobile).
describe('review r2 corrections (mobile sheet)', () => {
  const customTasks = () =>
    require('@/services/checklist/customChecklistTasks')
      .getCustomChecklistTasks as jest.Mock;
  const privateRow = (userId: string) => ({
    id: 98765,
    user_id: userId,
    priority: 'Do now',
    title: 'Private health appointment for A',
    description: 'Private description A',
    completed: false,
    completed_at: null,
    created_at: '2026-10-25T00:00:00Z',
  });
  /** supabase-js reports a session change to every listener. */
  async function signIn(userId: string, event = 'SIGNED_IN') {
    mockUserId = userId;
    await act(async () => {
      for (const listener of [...mockAuthListeners])
        listener(event, { user: { id: userId }, access_token: `jwt-${userId}` });
    });
  }
  const readAs = (userId: string) =>
    server.fetch.mock.calls.some(
      call =>
        (call[1] as unknown as { headers: Record<string, string> }).headers
          .authorization === `Bearer jwt-${userId}`
    );
  afterEach(() => customTasks().mockReset().mockResolvedValue([]));

  function showPrivateReminder(account: string) {
    const baseFetch = server.fetch;
    global.fetch = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (typeof url !== 'string' || typeof init?.body !== 'string')
        throw new Error('Expected an action URL and JSON body');
      const response = await baseFetch(url, { ...init, body: init.body });
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      if (body.action !== 'read') return response;
      const data = await response.json() as Record<string, unknown>;
      const owner = (init?.headers as Record<string, string>)?.authorization;
      data.reminders = {
        scheduler: 'ready',
        items: owner === `Bearer jwt-${account}` ? [{
          reminder_id: '12345678-1234-1234-1234-123456789012',
          task_ref: 'custom:98765', title: privateRow(account).title,
          remind_at: '2027-11-07T05:30:00Z', time_zone: 'America/New_York',
          wall_time: '2027-11-07T01:30:00', revision: 1, status: 'pending',
          due: true, due_at: '2027-11-07T05:30:01Z', cancelled_reason: null, history: [],
        }] : [],
      };
      return { ...response, json: async () => data };
    }) as unknown as typeof fetch;
  }

  async function openPrivateReminder() {
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: en.reminders.openTask }));
    await within(sheet).findByLabelText(en.reminders.instant);
    expect(within(sheet).getByRole('header', { name: privateRow(mockUserId).title })).toBeTruthy();
  }

  it('R368: a reminder title is removed when another account signs in', async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) => userId === a ? [privateRow(a)] : []);
    showPrivateReminder(a);
    await openPrivateReminder();
    await signIn('account-b');
    expect(screen.queryByText(privateRow(a).title)).toBeNull();
    await waitFor(() => expect(readAs('account-b')).toBe(true));
    await waitFor(() => expect(customTasks()).toHaveBeenCalledWith('account-b'));
    await waitFor(() => expect(clients[0].isFetching()).toBe(0));
    expect(screen.queryByText(privateRow(a).title)).toBeNull();
    expect(screen.getByTestId('companion-task-sheet')).toBeTruthy();
  });

  it('R368: a sign-out and sign-in in one batch clears the previous selected reminder', async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) => userId === a ? [privateRow(a)] : []);
    showPrivateReminder(a);
    await openPrivateReminder();
    await act(async () => {
      for (const listener of [...mockAuthListeners]) listener('SIGNED_OUT', null);
      for (const listener of [...mockAuthListeners])
        listener('SIGNED_IN', { user: { id: a }, access_token: `jwt-${a}` });
    });
    await waitFor(() => expect(clients[0].isFetching()).toBe(0));
    expect(screen.queryByRole('header', { name: privateRow(a).title })).toBeNull();
    expect(screen.queryByLabelText(en.reminders.instant)).toBeNull();
    expect(await screen.findByRole('button', { name: en.reminders.openTask })).toBeTruthy();
  });

  it.each(['sign-out/sign-in', 'A/B/A'])(
    'R368-SPEC-2: a batched %s session reset removes the stored reminder draft',
    async transition => {
      const a = mockUserId;
      customTasks().mockImplementation(async (userId: string) => userId === a ? [privateRow(a)] : []);
      showPrivateReminder(a);
      await openPrivateReminder();
      const defaultZone = screen.getByLabelText(en.reminders.zone).props.value;
      const typedZone = defaultZone === 'Asia/Tokyo' ? 'Europe/London' : 'Asia/Tokyo';
      fireEvent.changeText(screen.getByLabelText(en.reminders.instant), '2027-11-07T01:30-04:00');
      fireEvent.changeText(screen.getByLabelText(en.reminders.zone), typedZone);
      await act(async () => {
        for (const listener of [...mockAuthListeners]) {
          listener(
            transition === 'A/B/A' ? 'SIGNED_IN' : 'SIGNED_OUT',
            transition === 'A/B/A'
              ? { user: { id: 'batched-b' }, access_token: 'jwt-batched-b' }
              : null
          );
        }
        for (const listener of [...mockAuthListeners])
          listener('SIGNED_IN', { user: { id: a }, access_token: `jwt-${a}` });
      });
      await waitFor(() => expect(clients[0].isFetching()).toBe(0));
      expect(screen.queryByLabelText(en.reminders.instant)).toBeNull();
      fireEvent.press(await screen.findByRole('button', { name: en.reminders.openTask }));
      expect((await screen.findByLabelText(en.reminders.instant)).props.value).toBe('');
      expect(screen.getByLabelText(en.reminders.zone).props.value).toBe(defaultZone);
      expect(server.writes()).toHaveLength(0);
    }
  );

  it('R368: a return to the first account does not restore its old selected reminder', async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) => userId === a ? [privateRow(a)] : []);
    showPrivateReminder(a);
    await openPrivateReminder();
    await signIn('account-b');
    await waitFor(() => expect(readAs('account-b')).toBe(true));
    await signIn(a);
    await waitFor(() => expect(clients[0].isFetching()).toBe(0));
    expect(screen.queryByRole('header', { name: privateRow(a).title })).toBeNull();
    expect(screen.queryByLabelText(en.reminders.instant)).toBeNull();
  });

  it('R368: the same task id in another account needs a fresh selection', async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) => [{
      ...privateRow(userId), title: userId === a ? privateRow(a).title : 'Private task of B',
    }]);
    showPrivateReminder(a);
    await openPrivateReminder();
    await signIn('account-b');
    await waitFor(() => expect(clients[0].isFetching()).toBe(0));
    expect(screen.queryByText(privateRow(a).title)).toBeNull();
    expect(screen.queryByRole('header', { name: 'Private task of B' })).toBeNull();
    expect(await screen.findByRole('button', { name: /Private task of B/ })).toBeTruthy();
  });

  it('R368: a same-account token refresh keeps the selected reminder and typed drafts', async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) => userId === a ? [privateRow(a)] : []);
    showPrivateReminder(a);
    await openPrivateReminder();
    const composer = screen.getByPlaceholderText('Ask anything...');
    fireEvent.changeText(composer, 'Unsent question for this account');
    fireEvent.changeText(screen.getByLabelText(en.reminders.instant), '2027-11-07T01:30-04:00');
    fireEvent.changeText(screen.getByLabelText(en.reminders.zone), 'America/New_York');
    await signIn(a, 'TOKEN_REFRESHED');
    expect(screen.getByRole('header', { name: privateRow(a).title })).toBeTruthy();
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('Unsent question for this account');
    expect(screen.getByLabelText(en.reminders.instant).props.value).toBe('2027-11-07T01:30-04:00');
    expect(screen.getByLabelText(en.reminders.zone).props.value).toBe('America/New_York');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('F1: another account signing in clears the unsent message; the same account keeps it', async () => {
    renderScreen();
    const composer = await screen.findByPlaceholderText('Ask anything...');
    fireEvent.changeText(composer, 'Private unsent question of A');
    await screen.findByRole('button', { name: /Your tasks/ });

    // A token refresh of the same account keeps the draft.
    await signIn(mockUserId, 'TOKEN_REFRESHED');
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe(
      'Private unsent question of A'
    );

    await signIn('account-b');
    await waitFor(() => expect(readAs('account-b')).toBe(true));
    await waitFor(() =>
      expect(
        within(screen.getByRole('button', { name: /Your tasks/ })).getByText(
          'In progress: 1 · Waiting: 0'
        )
      ).toBeTruthy()
    );
    expect(screen.getByPlaceholderText('Ask anything...').props.value).toBe('');
  });

  it("F1: the open task sheet drops A's private task once B signs in", async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) =>
      userId === a ? [privateRow(a)] : []
    );
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    await within(sheet).findByText('Private health appointment for A');

    await signIn('account-b');
    await waitFor(() => expect(readAs('account-b')).toBe(true));
    await within(screen.getByTestId('companion-task-sheet')).findByText('Get a SIN');
    expect(screen.queryByText('Private health appointment for A')).toBeNull();
  });

  it("F1: A's Checklist read that ends after B signed in never shows A's task", async () => {
    const a = mockUserId;
    let releaseA: () => void = () => {};
    customTasks().mockImplementation(async (userId: string) => {
      if (userId !== a) return [];
      await new Promise<void>(resolve => (releaseA = resolve));
      return [privateRow(a)];
    });
    renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    await screen.findByTestId('companion-task-sheet');
    await waitFor(() => expect(customTasks()).toHaveBeenCalledWith(a));

    await signIn('account-b');
    await within(screen.getByTestId('companion-task-sheet')).findByText('Get a SIN');
    await act(async () => releaseA());
    await act(async () => {});
    expect(screen.queryByText('Private health appointment for A')).toBeNull();
  });
});
