// Mounted acceptance for saved personal details (mobile-app#370): the real Companion screen,
// its conversation cards and the bottom sheet, driven through user controls. The network
// is the scripted contract stand-in (client behaviour only); the real endpoint and
// database are covered by companionActionsLocalStack.test.tsx and the web repo's
// supabase/tests/companion-actions/details_test.ts.
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
import { StyleSheet, TouchableOpacity } from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { scriptedServer } from '@/testSupport/companionActionsServer';
import { clearTaskActionStores } from '@/services/companionActions/taskActionStore';

// The scripted fetch answers every request; nothing leaves the process.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59371';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

let mockUserId = 'user-1';
let mockCapture: jest.Mock;
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();

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
// The actual send, conversation and message hooks run. Their services and the model
// stream are scripted.
let mockMessageCount = 0;
type SavedRow = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  conversation: string;
  account: string;
};
const mockSaved: SavedRow[] = [];
let mockNextMessageId = 100;
const mockStream = jest.fn();
let mockServerRef: ReturnType<typeof scriptedServer> | null = null;
const mockServer = () => mockServerRef!;
jest.mock('@/services/companion/createConversation', () => ({
  createConversation: jest.fn(async () => ({
    conversation_identifier: 'conv-1',
    id: 1,
  })),
}));
jest.mock('@/services/companion/saveMessage', () => ({
  saveMessage: jest.fn(
    async (p: { conversationIdentifier: string; role: 'user' | 'assistant'; content: string }) => {
      const row = {
        id: mockNextMessageId++,
        role: p.role,
        content: p.content,
        conversation: p.conversationIdentifier,
        account: mockUserId,
      };
      mockSaved.push(row);
      mockServer().saveMessage(row.id, row.role, row.content, row.conversation);
      return { id: row.id };
    }
  ),
}));
jest.mock('@/services/companion/getConversationMessages', () => ({
  getConversationMessages: jest.fn(async (conversation: string) =>
    mockSaved
      .filter(m => m.conversation === conversation && m.account === mockUserId)
      .map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: null,
        created_at: new Date(Date.UTC(2026, 9, 26, 10, 0, m.id - 100)).toISOString(),
      }))
  ),
}));
jest.mock('@/services/companion/getConversations', () => ({
  getConversations: jest.fn(async () => []),
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
// Its looping animation would outlive this file.
jest.mock('@/components/companion/TypingIndicator', () => ({
  TypingIndicator: () => null,
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
      getSession: async () => ({
        data: {
          session: { user: { id: mockUserId }, access_token: `jwt-${mockUserId}` },
        },
      }),
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
  getCustomChecklistTasks: jest.fn(async () =>
    mockServer().customTasks().map((t: { id: string; title: string }) => ({
      id: Number(t.id),
      user_id: mockUserId,
      priority: 'Do soon',
      title: t.title,
      description: '',
      completed: false,
      completed_at: null,
      created_at: '2026-10-26T10:00:00Z',
      updated_at: '2026-10-26T10:00:00Z',
    }))
  ),
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
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={testI18n()}>
        <CompanionScreen />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

let server: ReturnType<typeof scriptedServer>;
const realFetch = global.fetch;
let userCounter = 0;
function useServer(s: ReturnType<typeof scriptedServer>) {
  server = s;
  mockServerRef = s;
  global.fetch = s.fetch as unknown as typeof fetch;
}

const composer = () => screen.getByPlaceholderText('Ask anything...');
const sendButton = () => {
  const button = screen
    .UNSAFE_getAllByType(TouchableOpacity)
    .find(b => StyleSheet.flatten(b.props.style)?.borderRadius === 20);
  if (!button) throw new Error('send control missing');
  return button;
};
async function send(text: string) {
  fireEvent.changeText(await screen.findByPlaceholderText(/Ask anything|limit/i), text);
  fireEvent.press(sendButton());
}
const enabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  el.props.accessibilityState?.disabled !== true;
beforeEach(() => {
  mockUserId = `detail-user-${++userCounter}`;
  mockCapture = jest.fn();
  mockPush.mockReset();
  mockMessageCount = 0;
  mockSaved.length = 0;
  mockNextMessageId = 100;
  mockStream.mockReset();
  clearTaskActionStores(null);
  useServer(scriptedServer());
});
afterEach(() => {
  global.fetch = realFetch;
  clients.splice(0).forEach(client => client.clear());
});



const FRIDAYS = 'I can attend appointments on Fridays';
/** The model answers; `detail` is the one detail it suggests saving, or none. */
function answersDetail(text: string, detail: string | null) {
  mockStream.mockImplementation(
    async (_q: string, _c: string, _h: unknown, cb: { onMetadata: (m: unknown) => void; onComplete: (c: unknown) => void }) => {
      cb.onMetadata({ sources: [], queryType: 'newcomer_settlement' });
      cb.onComplete({
        cleanAnswer: text,
        ...(detail ? { actionProposal: { type: 'detail.create', version: 1, text: detail } } : {}),
      });
    }
  );
}
const detailWrites = () =>
  server.sent.filter(
    b =>
      (b.action === 'apply' && String(b.operations?.[0]?.type).startsWith('detail.')) ||
      (b.action === 'undo')
  );
async function switchAccount(nextUserId: string) {
  mockUserId = nextUserId;
  await act(async () => {
    for (const listener of [...mockAuthListeners])
      listener('SIGNED_IN', { user: { id: nextUserId }, access_token: `jwt-${nextUserId}` });
  });
}
/** Saves a detail through a clear remember command and opens the saved details. */
async function rememberAndOpen(text = FRIDAYS) {
  await send(`Remember that ${text}`);
  const card = await screen.findByTestId('detail-command-card');
  await within(card).findByText(`Saved: “${text}”.`);
  fireEvent.press(within(card).getByRole('button', { name: 'View saved details' }));
  const sheet = await screen.findByTestId('companion-task-sheet');
  expect(within(sheet).getByRole('header', { name: 'Saved details' })).toBeTruthy();
  await within(sheet).findByText(text);
  return { card, sheet };
}

describe('Saved personal details through Companion (mobile, #370)', () => {
  it('a clear remember message saves exactly that detail once, with no AI answer, and its receipt names it', async () => {
    // Wrong if: the model is asked, the saved text differs from the message, the command
    // writes twice, analytics carries the detail, or the typed message is lost.
    renderScreen();
    await send(`Remember that ${FRIDAYS}.`);
    const card = await screen.findByTestId('detail-command-card');
    expect(await within(card).findByText(`Saved: “${FRIDAYS}”.`)).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
    const writes = detailWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].operations).toEqual([{ type: 'detail.create', text: FRIDAYS }]);
    expect(writes[0].authorization).toEqual({ kind: 'direct_command', message_id: mockSaved[0].id });
    expect(server.details().map(d => d.text)).toEqual([FRIDAYS]);
    for (const call of mockCapture.mock.calls) expect(JSON.stringify(call)).not.toMatch(/Fridays/);
    const result = mockCapture.mock.calls.find(c => c[0] === 'companion_action_result');
    expect(result?.[1]).toMatchObject({ action: 'command_detail', operation_type: 'detail.create', outcome: 'applied' });
  });

  it('an inferred detail is only a draft: Not now saves nothing, and approval saves it once', async () => {
    // Wrong if: a suggestion is saved before approval, Not now writes, or a double tap saves twice.
    answersDetail('Fridays work for many offices.', FRIDAYS);
    renderScreen();
    await send('I can only go on Fridays. Where do I get a SIN?');
    const card = await screen.findByTestId('detail-draft-card');
    expect(within(card).getByText('Needs your approval. Not saved.')).toBeTruthy();
    expect(server.details()).toEqual([]);

    fireEvent.press(within(card).getByRole('button', { name: `Review the suggested detail: ${FRIDAYS}` }));
    let sheet = await screen.findByTestId('companion-task-sheet');
    expect(within(sheet).getByRole('header', { name: 'Remember this detail?' })).toBeTruthy();
    fireEvent.press(await within(sheet).findByRole('button', { name: 'Not now' }));
    expect(await within(sheet).findByText('Not saved.')).toBeTruthy();
    expect(detailWrites()).toHaveLength(0);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));

    answersDetail('Noted.', FRIDAYS);
    await send('Fridays are best for me.');
    await waitFor(() => expect(screen.getAllByTestId('detail-draft-card')).toHaveLength(2));
    fireEvent.changeText(composer(), 'My next question');
    fireEvent.press(
      within(screen.getAllByTestId('detail-draft-card')[1]).getByRole('button', {
        name: `Review the suggested detail: ${FRIDAYS}`,
      })
    );
    sheet = await screen.findByTestId('companion-task-sheet');
    const approve = await within(sheet).findByRole('button', { name: 'Remember this' });
    await waitFor(() => expect(enabled(approve)).toBe(true));
    fireEvent.press(approve);
    fireEvent.press(approve);
    expect(await within(sheet).findByText(`Saved: “${FRIDAYS}”.`)).toBeTruthy();
    expect(detailWrites()).toHaveLength(1);
    expect(detailWrites()[0].authorization).toMatchObject({ kind: 'approved_proposal', proposal_revision: 1 });
    expect(server.details().map(d => d.text)).toEqual([FRIDAYS]);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
  });

  it('edits at the revision shown and keeps typed text through close and reopen; its receipt names before and after', async () => {
    // Wrong if: the typed edit is lost when the sheet closes, the edit names another
    // revision, or the receipt does not name the exact change.
    renderScreen();
    let { sheet } = await rememberAndOpen();
    fireEvent.press(within(sheet).getByRole('button', { name: `Edit saved detail: ${FRIDAYS}` }));
    fireEvent.changeText(within(sheet).getByLabelText('Saved detail'), 'I can attend appointments on Saturdays');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    fireEvent.press(within(screen.getByTestId('detail-command-card')).getByRole('button', { name: 'View saved details' }));
    sheet = await screen.findByTestId('companion-task-sheet');
    expect(within(sheet).getByLabelText('Saved detail').props.value).toBe('I can attend appointments on Saturdays');
    const save = within(sheet).getByRole('button', { name: 'Save change' });
    await waitFor(() => expect(enabled(save)).toBe(true));
    fireEvent.press(save);
    expect(
      await within(sheet).findByText(`Changed “${FRIDAYS}” to “I can attend appointments on Saturdays”.`)
    ).toBeTruthy();
    const edit = detailWrites().find(w => w.operations?.[0]?.type === 'detail.update')!;
    expect(edit.operations[0]).toEqual({
      type: 'detail.update',
      detail_id: server.details()[0].detail_id,
      text: 'I can attend appointments on Saturdays',
      expected_revision: 1,
    });
    expect(edit.authorization).toEqual({ kind: 'ui_control' });
    // The command's receipt keeps its own text and is now history.
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    const card = screen.getByTestId('detail-command-card');
    await within(card).findByText('Saved earlier. This detail has changed since.');
    expect(within(card).getByText(`Saved: “${FRIDAYS}”.`)).toBeTruthy();
  });

  it('every removal asks first; Cancel sends nothing; Remove names the detail and Undo restores it', async () => {
    // Wrong if: a removal is sent without confirmation, Cancel writes, or Undo is not
    // tied to the removal receipt.
    renderScreen();
    const { sheet } = await rememberAndOpen();
    const before = detailWrites().length;
    fireEvent.press(within(sheet).getByRole('button', { name: `Remove saved detail: ${FRIDAYS}` }));
    expect(within(sheet).getByText('Remove this saved detail?')).toBeTruthy();
    expect(within(sheet).getByText(`“${FRIDAYS}” will no longer be used in later conversations.`)).toBeTruthy();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(detailWrites()).toHaveLength(before);
    fireEvent.press(within(sheet).getByRole('button', { name: `Remove saved detail: ${FRIDAYS}` }));
    fireEvent.press(within(sheet).getByRole('button', { name: 'Remove detail' }));
    expect(
      await within(sheet).findByText(`Removed “${FRIDAYS}”. It will not be used in later conversations.`)
    ).toBeTruthy();
    const removal = detailWrites()[detailWrites().length - 1];
    expect(removal.authorization).toEqual({ kind: 'ui_control', removal_confirmed: true });
    expect(server.details()[0].removed).toBe(true);
    await waitFor(() => expect(within(sheet).queryAllByTestId('saved-detail-row')).toHaveLength(0));

    fireEvent.press(within(sheet).getByRole('button', { name: `Undo removing “${FRIDAYS}”` }));
    expect(await within(sheet).findByText(`Restored “${FRIDAYS}”.`)).toBeTruthy();
    const undo = detailWrites()[detailWrites().length - 1];
    expect([undo.action, undo.receipt_operation_id]).toEqual(['undo', removal.operation_id]);
    expect(server.details()[0].removed).toBe(false);
  });

  it('the Undo of a save removes it only after confirmation; an Undo after a newer edit offers a reviewed change', async () => {
    // Wrong if: Undo of a save is sent without confirmation, or an old receipt's Undo
    // overwrites a newer edit made on another device.
    renderScreen();
    await send(`Remember that ${FRIDAYS}`);
    const card = await screen.findByTestId('detail-command-card');
    await within(card).findByText(`Saved: “${FRIDAYS}”.`);
    const before = detailWrites().length;
    fireEvent.press(within(card).getByRole('button', { name: `Undo saving “${FRIDAYS}”` }));
    expect(detailWrites()).toHaveLength(before);
    expect(within(card).getByText(`Undoing this removes “${FRIDAYS}”. It will no longer be used in later conversations.`)).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Cancel' }));
    expect(detailWrites()).toHaveLength(before);

    // Another device edits the detail, and this device reads it.
    server.editDetailElsewhere(server.details()[0].detail_id, 'I can attend appointments on Mondays');
    fireEvent.press(within(card).getByRole('button', { name: 'View saved details' }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    await within(sheet).findByText('I can attend appointments on Mondays');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await within(card).findByText('Saved earlier. This detail has changed since.');
    expect(within(card).queryByRole('button', { name: `Undo saving “${FRIDAYS}”` })).toBeNull();
    expect(server.details()[0].text).toBe('I can attend appointments on Mondays');
  });

  it('a lost reply is looked up and shown from its receipt; the edit is never sent again', async () => {
    // Wrong if: an unknown outcome is retried blind or shown as saved before the lookup.
    renderScreen();
    const { sheet } = await rememberAndOpen();
    useServer(scriptedServerWithDrop());
    fireEvent.press(within(sheet).getByRole('button', { name: `Edit saved detail: ${FRIDAYS}` }));
    fireEvent.changeText(within(sheet).getByLabelText('Saved detail'), 'I prefer mornings');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Save change' }));
    expect(await within(sheet).findByText(`Changed “${FRIDAYS}” to “I prefer mornings”.`)).toBeTruthy();
    const updates = server.sent.filter(b => b.action === 'apply' && b.operations?.[0]?.type === 'detail.update');
    expect(updates).toHaveLength(1);
    const lookups = server.sent.filter(b => b.action === 'status');
    expect(lookups.map(l => l.operation_id)).toEqual([updates[0].operation_id]);
  });

  it('an account change drops the previous account\'s details and typed edits before the next account renders', async () => {
    // Wrong if: the next account sees the previous account's detail or its typed edit.
    renderScreen();
    const { sheet } = await rememberAndOpen();
    fireEvent.press(within(sheet).getByRole('button', { name: `Edit saved detail: ${FRIDAYS}` }));
    fireEvent.changeText(within(sheet).getByLabelText('Saved detail'), 'Typed by the first account');
    // The next account's own records (the stand-in holds one account at a time).
    useServer(scriptedServer());
    await switchAccount(`other-${userCounter}`);
    await waitFor(() => expect(screen.queryByText(FRIDAYS)).toBeNull());
    expect(screen.queryByDisplayValue('Typed by the first account')).toBeNull();
  });
});

/**
 * The same stand-in, but the first detail edit's reply is lost after it committed:
 * the server saves it, the client sees a network failure.
 */
function scriptedServerWithDrop() {
  const previous = server;
  let dropped = false;
  const wrapped = {
    ...previous,
    fetch: jest.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      if (!dropped && body.action === 'apply' && body.operations?.[0]?.type === 'detail.update') {
        dropped = true;
        previous.sent.push(body);
        previous.handle(body);
        throw new TypeError('Network request failed');
      }
      return previous.fetch(url, init);
    }),
  };
  return wrapped as unknown as ReturnType<typeof scriptedServer>;
}
