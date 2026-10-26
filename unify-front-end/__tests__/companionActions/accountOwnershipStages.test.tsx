// Account ownership of every request stage of a Companion send (mobile-app#361,
// Spec round 4). The actual Companion and History screens, send/create/save hooks
// and the actual createConversation and saveMessage services run against a scripted
// Supabase SDK: each SDK call is recorded with the account signed in when it was
// made, and any call can be held to release it after an account change. The model
// stream, message reads and task endpoint are scripted. This proves which client
// requests start; it is not evidence of SDK event order, RLS or a hosted project.
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
let mockRouteConversation: string | undefined;

// Scripted Supabase SDK for the actual conversation services. Every call records
// the account signed in when it was made; `hold` makes the next call of one kind
// wait until the test releases it, with the default reply or a given one.
type SdkCall = { op: string; as: string; payload: unknown };
type SdkHandler = (payload: unknown) => Promise<unknown>;
const mockSdk = (() => {
  const calls: SdkCall[] = [];
  const queued = new Map<string, SdkHandler[]>();
  let created = 0;
  const defaults: Record<string, SdkHandler> = {
    'conversations.insert': async () => {
      created += 1;
      return {
        data: { id: 100 + created, conversation_identifier: `c-new-${created}` },
        error: null,
      };
    },
    'conversations.update': async () => ({ error: null }),
    'conversations.selectId': async () => ({ data: { id: 7 }, error: null }),
    'messages.insert': async () => ({ error: null }),
    'invoke:generate-title': async () => ({
      data: { title: 'Generated title' },
      error: null,
    }),
  };
  const call = (op: string, payload: unknown) => {
    calls.push({ op, as: mockUserId, payload });
    const handler = queued.get(op)?.shift() ?? defaults[op];
    return handler(payload);
  };
  return {
    calls,
    call,
    from: (table: string) => ({
      insert: (row: unknown) =>
        table === 'messages'
          ? call('messages.insert', row)
          : { select: () => ({ single: () => call(`${table}.insert`, row) }) },
      update: (values: unknown) => ({
        eq: () => ({ eq: () => call(`${table}.update`, values) }),
      }),
      select: () => {
        const chain: any = {
          eq: () => chain,
          single: () => call(`${table}.selectId`, null),
        };
        return chain;
      },
    }),
    hold(op: string) {
      let release: (reply?: unknown) => void = () => {};
      const gate = new Promise<unknown>(r => (release = r));
      const list = queued.get(op) ?? [];
      list.push(async payload => (await gate) ?? defaults[op](payload));
      queued.set(op, list);
      return (reply?: unknown) => release(reply);
    },
    callsOf: (op: string) => calls.filter(c => c.op === op),
    reset() {
      calls.length = 0;
      queued.clear();
    },
  };
})();
const sdk = mockSdk;

let mockCapture: jest.Mock;
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();
const sessionOf = (id: string) => ({
  data: { session: { user: { id }, access_token: `jwt-${id}` } },
});
const mockGetSession = jest.fn(async () => sessionOf(mockUserId));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({ conversationId: mockRouteConversation }),
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
const mockStream = jest.fn();
jest.mock('@/services/companion/getConversations', () => ({
  getConversations: (...a: unknown[]) => mockConversations(...a),
}));
jest.mock('@/services/companion/getConversationMessages', () => ({
  getConversationMessages: (...a: unknown[]) => mockMessages(...a),
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
jest.mock('@expo/vector-icons', () => ({ Feather: () => null, Ionicons: () => null }));
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
    from: (table: string) => mockSdk.from(table),
    functions: {
      invoke: (name: string, opts: { body: unknown }) =>
        mockSdk.call(`invoke:${name}`, opts.body),
    },
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
  mockRouteConversation = undefined;
  sdk.reset();
  mockStream.mockReset();
});
afterEach(() => {
  global.fetch = realFetch;
  clients.splice(0).forEach(client => client.clear());
});


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
async function accountLoaded(userId: string) {
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
const titlesByAccount = (titles: Record<string, string>) =>
  mockConversations.mockImplementation(async () => {
    const who = mockUserId;
    return titles[who] ? [conversation(`c-${who}`, titles[who])] : [];
  });
/** Lets every released reply run through its remaining awaits. */
async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => {});
}
/**
 * Opens a saved conversation of the signed-in account. The first mount reads the
 * session (another test's account may be the last known one, which correctly
 * drops an open conversation), then the screen opens `conversationId`.
 */
async function openThread(conversationId: string, text: string) {
  const first = renderScreen();
  await accountLoaded(mockUserId);
  first.unmount();
  mockRouteConversation = conversationId;
  renderScreen();
  await waitFor(() =>
    expect(mockMessages.mock.calls.map(c => c[0])).toContain(conversationId)
  );
  await settle();
  expect(screen.getByText(text)).toBeTruthy();
}
async function send(text: string) {
  fireEvent.changeText(composer(), text);
  fireEvent.press(sendButton());
}
/** Every SDK call that carries `text`, with the account it was made as. */
const callsCarrying = (text: string) =>
  sdk.calls
    .filter(c => JSON.stringify(c.payload ?? null).includes(text))
    .map(c => ({ op: c.op, as: c.as }));
const keysOf = (accountId: string) =>
  clients[clients.length - 1]
    .getQueryCache()
    .getAll()
    .filter(q => JSON.stringify(q.queryKey).includes(accountId))
    .map(q => q.queryKey);
const neverEndingStream = () =>
  mockStream.mockImplementation(() => new Promise<void>(() => {}));

describe('conversation creation stages belong to the account that started them', () => {
  it('an insert that answers after B signed in starts no title, save or stream', async () => {
    const a = mockUserId;
    neverEndingStream();
    const releaseInsert = sdk.hold('conversations.insert');
    renderScreen();
    await accountLoaded(a);
    await send('Private A first message');
    await waitFor(() => expect(sdk.callsOf('conversations.insert')).toHaveLength(1));

    await authEvent('stage-b');
    await accountLoaded('stage-b');
    await act(async () => releaseInsert());
    await settle();

    expect(callsCarrying('Private A first message')).toEqual([
      { op: 'conversations.insert', as: a },
    ]);
    expect(sdk.callsOf('conversations.update')).toEqual([]);
    expect(sdk.callsOf('messages.insert')).toEqual([]);
    expect(mockStream).not.toHaveBeenCalled();
    expect(composer().props.value).toBe('');
  });

  it('a title reply that ends after B signed in does not write the title as B', async () => {
    const a = mockUserId;
    neverEndingStream();
    const releaseTitle = sdk.hold('invoke:generate-title');
    renderScreen();
    await accountLoaded(a);
    await send('Private A title source');
    await waitFor(() =>
      expect(sdk.callsOf('invoke:generate-title')).toEqual([
        expect.objectContaining({ as: a }),
      ])
    );

    await authEvent('title-b');
    await accountLoaded('title-b');
    await act(async () => releaseTitle());
    await settle();

    expect(sdk.callsOf('conversations.update')).toEqual([]);
  });

  it('sign-out and signing in again as A stop the old creation before its title', async () => {
    const a = mockUserId;
    neverEndingStream();
    const releaseInsert = sdk.hold('conversations.insert');
    renderScreen();
    await accountLoaded(a);
    await send('Private A before sign-out');
    await waitFor(() => expect(sdk.callsOf('conversations.insert')).toHaveLength(1));

    await authEvent(null, 'SIGNED_OUT');
    await authEvent(a);
    await act(async () => releaseInsert());
    await settle();

    expect(callsCarrying('Private A before sign-out')).toEqual([
      { op: 'conversations.insert', as: a },
    ]);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('positive control: a token refresh of A keeps title, save and stream going', async () => {
    const a = mockUserId;
    neverEndingStream();
    const releaseInsert = sdk.hold('conversations.insert');
    renderScreen();
    await accountLoaded(a);
    await send('Same account first message');
    await waitFor(() => expect(sdk.callsOf('conversations.insert')).toHaveLength(1));

    await authEvent(a, 'TOKEN_REFRESHED');
    await act(async () => releaseInsert());
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));

    expect(callsCarrying('Same account first message')).toEqual([
      { op: 'conversations.insert', as: a },
      { op: 'invoke:generate-title', as: a },
      { op: 'messages.insert', as: a },
    ]);
    await waitFor(() =>
      expect(sdk.callsOf('conversations.update')).toEqual([
        expect.objectContaining({ as: a }),
      ])
    );
  });

  it("B sends while A's creation is held; A's late reply adds no request", async () => {
    const a = mockUserId;
    neverEndingStream();
    const releaseInsert = sdk.hold('conversations.insert');
    renderScreen();
    await accountLoaded(a);
    await send('Private A held creation');
    await waitFor(() => expect(sdk.callsOf('conversations.insert')).toHaveLength(1));

    await authEvent('concurrent-b');
    await accountLoaded('concurrent-b');
    await send('B own question');
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
    await act(async () => releaseInsert());
    await settle();

    expect(callsCarrying('Private A held creation')).toEqual([
      { op: 'conversations.insert', as: a },
    ]);
    expect(callsCarrying('B own question')).toEqual([
      { op: 'conversations.insert', as: 'concurrent-b' },
      { op: 'invoke:generate-title', as: 'concurrent-b' },
      { op: 'messages.insert', as: 'concurrent-b' },
    ]);
    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockStream.mock.calls[0][0]).toBe('B own question');
  });
});

describe('message save stages and their cache writes belong to their account', () => {
  const earlier = (content: string) => [
    {
      id: 1,
      role: 'assistant',
      content,
      sources: null,
      created_at: new Date().toISOString(),
    },
  ];

  it("a save that fails after B loaded does not restore A's cached messages", async () => {
    const a = mockUserId;
    mockMessages.mockImplementation(async () =>
      mockUserId === a ? earlier('Private A earlier message') : []
    );
    const releaseInsert = sdk.hold('messages.insert');
    await openThread('c-a-private', 'Private A earlier message');
    await send('A pending user save');
    await waitFor(() => expect(sdk.callsOf('messages.insert')).toHaveLength(1));

    await authEvent('rollback-b');
    await accountLoaded('rollback-b');
    expect(keysOf(a)).toEqual([]);
    fireEvent.changeText(composer(), 'B current draft');
    await act(async () =>
      releaseInsert({ error: { message: 'A user save rejected' } })
    );
    await settle();

    expect(keysOf(a)).toEqual([]);
    expect(composer().props.value).toBe('B current draft');
    expect(screen.queryByText('Private A earlier message')).toBeNull();
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('a save that succeeds after B loaded leaves no A entry and no stream', async () => {
    const a = mockUserId;
    mockMessages.mockImplementation(async () =>
      mockUserId === a ? earlier('Private A kept message') : []
    );
    const releaseInsert = sdk.hold('messages.insert');
    await openThread('c-a-private', 'Private A kept message');
    await send('A pending success');
    await waitFor(() => expect(sdk.callsOf('messages.insert')).toHaveLength(1));

    await authEvent('success-b');
    await accountLoaded('success-b');
    await act(async () => releaseInsert());
    await settle();

    expect(keysOf(a)).toEqual([]);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('a conversation lookup that answers after B signed in inserts no message', async () => {
    const a = mockUserId;
    mockMessages.mockImplementation(async () =>
      mockUserId === a ? earlier('Private A lookup message') : []
    );
    const releaseLookup = sdk.hold('conversations.selectId');
    await openThread('c-a-private', 'Private A lookup message');
    await send('Private A after lookup');
    await waitFor(() => expect(sdk.callsOf('conversations.selectId')).toHaveLength(1));

    await authEvent('lookup-b');
    await accountLoaded('lookup-b');
    await act(async () => releaseLookup());
    await settle();

    expect(sdk.callsOf('messages.insert')).toEqual([]);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('positive control: a same-account failed save restores its own thread', async () => {
    const a = mockUserId;
    mockMessages.mockImplementation(async () => earlier('A own earlier message'));
    neverEndingStream();
    const releaseInsert = sdk.hold('messages.insert');
    await openThread('c-a-own', 'A own earlier message');
    await send('A same account save');
    await waitFor(() => expect(sdk.callsOf('messages.insert')).toHaveLength(1));
    await authEvent(a, 'TOKEN_REFRESHED');
    await act(async () => releaseInsert({ error: { message: 'rejected' } }));
    await settle();

    expect(screen.getByText('A own earlier message')).toBeTruthy();
    // The send itself continues for A: its answer still streams.
    expect(mockStream).toHaveBeenCalledTimes(1);
  });
});

describe('restarting the account session after every subscriber left', () => {
  async function startAndLeave(text: string) {
    const a = mockUserId;
    titlesByAccount({ [a]: 'Private A restart', 'restart-b': 'Normal B restart' });
    neverEndingStream();
    const releaseInsert = sdk.hold('conversations.insert');
    const mounted = renderScreen();
    await screen.findByText('Private A restart');
    await send(text);
    await waitFor(() => expect(sdk.callsOf('conversations.insert')).toHaveLength(1));
    mounted.unmount();
    expect(mockAuthListeners.size).toBe(0);
    return { a, releaseInsert };
  }

  it('an old reply released while the fresh session read is held starts nothing', async () => {
    const { a, releaseInsert } = await startAndLeave('Private A restart question');
    mockUserId = 'restart-b';
    let freshSession: () => void = () => {};
    mockGetSession.mockImplementation(
      () => new Promise(r => (freshSession = () => r(sessionOf('restart-b'))))
    );
    renderScreen();
    await act(async () => {});
    await act(async () => releaseInsert());
    await settle();
    const beforeFreshRead = callsCarrying('Private A restart question');
    const streamsBeforeFreshRead = mockStream.mock.calls.length;

    await act(async () => freshSession());
    await screen.findByText('Normal B restart');
    await settle();

    expect(beforeFreshRead).toEqual([{ op: 'conversations.insert', as: a }]);
    expect(streamsBeforeFreshRead).toBe(0);
    expect(callsCarrying('Private A restart question')).toEqual([
      { op: 'conversations.insert', as: a },
    ]);
    expect(sdk.callsOf('messages.insert')).toEqual([]);
    expect(mockStream).not.toHaveBeenCalled();
    expect(screen.queryByText('Private A restart')).toBeNull();
  });

  it('positive control: after the fresh read finds A again, the old send goes on', async () => {
    const { a, releaseInsert } = await startAndLeave('A restart same account');
    renderScreen();
    await screen.findByText('Private A restart');
    await act(async () => releaseInsert());
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));

    expect(callsCarrying('A restart same account')).toEqual([
      { op: 'conversations.insert', as: a },
      { op: 'invoke:generate-title', as: a },
      { op: 'messages.insert', as: a },
    ]);
  });
});
