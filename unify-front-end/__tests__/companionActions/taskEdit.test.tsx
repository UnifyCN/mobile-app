// Mounted acceptance of editing existing tasks through Companion (mobile-app#365,
// direction B): the actual Companion screen, send hook, task cards and task bottom
// sheet, driven through user controls. The companion-actions network is the scripted
// contract stand-in (testSupport/companionActionsServer.ts); message saves and reads
// and the model stream are scripted. Server authorization, revisions and persistence
// are proven against the real endpoint and database in the web repo
// (supabase/tests/companion-actions); this is not evidence of them.
import React from 'react';
import {
  act,
  fireEvent,
  fireEventAsync,
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
    mockServer().customTasks().map((t: { id: string; title: string; priority: string; description: string }) => ({
      id: Number(t.id),
      user_id: mockUserId,
      priority: t.priority,
      title: t.title,
      description: t.description,
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
  // The managed client also disposes resources removed during account changes.
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

const PHONE = 'Get a phone plan';
const SIN = 'Get a SIN';
/** The model answers; `proposal` is the one change it suggests, or none. */
function answers(text: string, proposal: Record<string, unknown> | null) {
  mockStream.mockImplementation(
    async (
      _q: string,
      _c: string,
      _h: unknown,
      cb: {
        onMetadata: (m: unknown) => void;
        onComplete: (c: unknown) => void;
      }
    ) => {
      cb.onMetadata({ sources: [], queryType: 'newcomer_settlement' });
      cb.onComplete({
        cleanAnswer: text,
        ...(proposal ? { actionProposal: { type: 'task.edit', version: 1, ...proposal } } : {}),
      });
    }
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
  await screen.findByPlaceholderText(/Ask anything|limit/i);
  await waitFor(() =>
    expect(screen.getByPlaceholderText(/Ask anything|limit/i).props.editable).toBe(true)
  );
  fireEvent.changeText(screen.getByPlaceholderText(/Ask anything|limit/i), text);
  await waitFor(() => expect(composer().props.value).toBe(text));
  await waitFor(() => expect(sendButton().props.disabled).toBe(false));
  await fireEventAsync.press(sendButton());
}
const writes = () => server.sent.filter(b => b.action === 'apply');
const enabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  el.props.accessibilityState?.disabled !== true;
const priorityOf = (ref: string) =>
  server.customTasks().find(t => `custom:${t.id}` === ref)?.priority;

async function openEditDraft(title = PHONE) {
  const card = await screen.findByTestId('task-edit-draft-card');
  fireEvent.press(
    within(card).getByRole('button', { name: `Review the suggested change to ${title}` })
  );
  const sheet = await screen.findByTestId('companion-task-sheet');
  expect(within(sheet).getByRole('header', { name: 'Review change' })).toBeTruthy();
  return { card, sheet };
}
async function approveButton(sheet: ReturnType<typeof screen.getByTestId>, title = PHONE) {
  const approve = await within(sheet).findByRole('button', {
    name: `Save this change to ${title}`,
  });
  await waitFor(() => expect(enabled(approve)).toBe(true));
  return approve;
}

let phoneRef: string;
beforeEach(() => {
  mockUserId = `edit-user-${++userCounter}`;
  mockCapture = jest.fn();
  mockPush.mockReset();
  mockMessageCount = 0;
  mockSaved.length = 0;
  mockNextMessageId = 100;
  mockStream.mockReset();
  clearTaskActionStores(null);
  useServer(scriptedServer({}, { published: { 'sanity:sin': SIN } }));
  phoneRef = server.addCustomTask(PHONE);
});
afterEach(() => {
  global.fetch = realFetch;
  clients.splice(0).forEach(client => client.clear());
});

describe('Edit existing tasks through Companion (mobile)', () => {
  it('a clear rename command saves exactly that change without an AI answer, names it in the card, and Checklist reads the new title', async () => {
    renderScreen();
    await send(`Rename task "${PHONE}" to "Get a prepaid plan"`);
    const card = await screen.findByTestId('task-command-card');
    expect(await within(card).findByText('Changed in Checklist: Get a prepaid plan')).toBeTruthy();
    expect(within(card).getByText('Title: “Get a phone plan” → “Get a prepaid plan”')).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].authorization).toEqual({ kind: 'direct_command', message_id: mockSaved[0].id });
    expect(writes()[0].operations).toEqual([
      { type: 'task.edit_details', task_ref: phoneRef, expected_revision: 1, title: 'Get a prepaid plan' },
    ]);
    // The task list is the same Checklist read: it shows the saved title.
    fireEvent.press(screen.getByRole('button', { name: /Your tasks/ }));
    const list = await screen.findByTestId('companion-task-sheet');
    expect(await within(list).findByRole('button', { name: /Get a prepaid plan/ })).toBeTruthy();
    expect(within(list).queryByRole('button', { name: new RegExp(`^${PHONE}`) })).toBeNull();
  });

  it('a state command names a published task by its Checklist title and saves only its state', async () => {
    renderScreen();
    await send(`Mark task "${SIN}" as waiting: Appointment on Friday`);
    const card = await screen.findByTestId('task-command-card');
    expect(await within(card).findByText(`${SIN}: Not started → Waiting`)).toBeTruthy();
    expect(writes()[0].operations).toEqual([
      {
        type: 'task.set_state',
        task_ref: 'sanity:sin',
        state: 'waiting',
        expected_revision: 0,
        waiting_reason: 'Appointment on Friday',
      },
    ]);
    expect(server.row('sanity:sin')).toMatchObject({ state: 'waiting', reason: 'Appointment on Friday' });
  });

  it('an ambiguous or unknown target asks a question and writes nothing', async () => {
    server.addCustomTask(PHONE);
    renderScreen();
    await send(`Set priority of task "${PHONE}" to Do now`);
    expect(
      await screen.findByText(`2 tasks are called “${PHONE}”, so I did not change any of them. Open the one you mean in Checklist and change it there.`)
    ).toBeTruthy();
    await send('Rename task "Get a bus pass" to "Get a transit pass"');
    expect(await screen.findByText(/I could not find a Checklist task with that title/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('a suggested change is a draft until approved; approval saves the reviewed change once and the typed message stays', async () => {
    answers('Since the store is closing, do it today.', { task_ref: phoneRef, field: 'priority', value: 'Do now' });
    renderScreen();
    await send('The phone store closes tomorrow');
    const card = await screen.findByTestId('task-edit-draft-card');
    expect(within(card).getByText('Draft · not saved yet')).toBeTruthy();
    expect(within(card).getByText('Priority: Do now')).toBeTruthy();
    expect(priorityOf(phoneRef)).toBe('Do soon');
    expect(writes()).toHaveLength(0);
    fireEvent.changeText(composer(), 'My next question');

    const { sheet } = await openEditDraft();
    expect(within(sheet).getByText('Now: Do soon')).toBeTruthy();
    expect(within(sheet).getByText('After you save: Do now')).toBeTruthy();
    const approve = await approveButton(sheet);
    fireEvent.press(approve);
    fireEvent.press(approve);
    expect(await within(sheet).findByText(`Changed in Checklist: ${PHONE}`)).toBeTruthy();
    expect(within(sheet).getByText('Priority: Do soon → Do now')).toBeTruthy();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].authorization).toEqual({
      kind: 'approved_proposal',
      proposal_id: server.drafts()[0].proposal_id,
      proposal_revision: 1,
    });
    expect(priorityOf(phoneRef)).toBe('Do now');

    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
    expect(await within(screen.getByTestId('task-edit-draft-card')).findByText('Saved in Checklist')).toBeTruthy();
  });

  it('a newer edit elsewhere gives a revised draft that shows the old and current values and needs its own approval', async () => {
    answers('Do it today.', { task_ref: phoneRef, field: 'priority', value: 'Do now' });
    renderScreen();
    await send('The phone store closes tomorrow');
    const { sheet } = await openEditDraft();
    // Another device changes the priority while this review is open.
    server.editDetailsElsewhere(phoneRef, { priority: 'Explore and connect' });
    fireEvent.press(await approveButton(sheet));
    expect(
      await within(sheet).findByText('This task changed after the change was suggested. Check the current values before you save.')
    ).toBeTruthy();
    expect(within(sheet).getByText('Now: Explore and connect')).toBeTruthy();
    expect(within(sheet).getByText('When suggested: Do soon')).toBeTruthy();
    expect(priorityOf(phoneRef)).toBe('Explore and connect');
    expect(writes()).toHaveLength(1);

    fireEvent.press(await approveButton(sheet));
    expect(await within(sheet).findByText('Priority: Explore and connect → Do now')).toBeTruthy();
    expect(writes()).toHaveLength(2);
    expect(writes()[1].authorization.proposal_revision).toBe(2);
    expect(priorityOf(phoneRef)).toBe('Do now');
  });
});


it('keeps the first direct edit receipt and marks it historical after a second edit', async () => {
  renderScreen();
  await send(`Rename task "${PHONE}" to "Mobile plan"`);
  const first = await screen.findByTestId('task-command-card');
  await within(first).findByText('Changed in Checklist: Mobile plan');
  await send('Rename task "Mobile plan" to "Prepaid plan"');
  await screen.findByText('Changed in Checklist: Prepaid plan');
  await waitFor(() => {
    const data = clients[0].getQueryData<{
      commands: Array<{ receipt: { current: boolean } }>;
    }>(['companion-conversation-actions', mockUserId, 'conv-1']);
    expect(data?.commands[0]?.receipt.current).toBe(false);
  });
  expect(await within(first).findByText(/This task changed after this/)).toBeTruthy();
  expect(within(first).getByText('Changed in Checklist: Mobile plan')).toBeTruthy();
  expect(within(first).getByText('Title: “Get a phone plan” → “Mobile plan”')).toBeTruthy();
});

// #365 review S365-002 (red first): a reason-only state command names both reasons.
it('a waiting reason change names the reason before and after on the command card, and keeps them after a later edit', async () => {
  // Wrong if: the card says only Waiting → Waiting, shows other reasons than the saved
  // ones, or loses them when the receipt becomes history.
  // Hold the committed first response until the second interaction has started.
  // The test controls this order without a sleep or a faster/slower machine.
  let releaseFirstApply: () => void = () => {};
  const firstApplyReply = new Promise<void>(resolve => { releaseFirstApply = resolve; });
  let holdFirstApply = true;
  global.fetch = async (input, init) => {
    const response = await (server.fetch as unknown as typeof fetch)(input, init);
    if (
      holdFirstApply &&
      typeof init?.body === 'string' &&
      JSON.parse(init.body).action === 'apply'
    ) {
      holdFirstApply = false;
      await firstApplyReply;
    }
    return response;
  };
  renderScreen();
  const firstSend = send(`Mark task "${PHONE}" as waiting: Appointment on Friday`);
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(composer().props.editable).toBe(false);
  // The driver must wait for the real controls before the next user action.
  const secondSend = send(`Mark task "${PHONE}" as waiting: Appointment on Monday`);
  try {
    await act(async () => { await Promise.resolve(); });
  } finally {
    releaseFirstApply();
  }
  await firstSend;
  await secondSend;
  await waitFor(() => expect(screen.getAllByTestId('task-command-card')).toHaveLength(2));
  const first = screen.getAllByTestId('task-command-card')[0];
  const second = screen.getAllByTestId('task-command-card')[1];
  expect(await within(first).findByText(`${PHONE}: Not started → Waiting`)).toBeTruthy();
  expect(within(first).getByText('Waiting for: (empty) → “Appointment on Friday”')).toBeTruthy();
  expect(await within(second).findByText(`${PHONE}: Waiting → Waiting`)).toBeTruthy();
  expect(
    within(second).getByText('Waiting for: “Appointment on Friday” → “Appointment on Monday”')
  ).toBeTruthy();
  expect(server.row(phoneRef)).toMatchObject({ state: 'waiting', reason: 'Appointment on Monday' });
  // A later edit makes the second receipt history; it keeps its saved reasons.
  await send(`Rename task "${PHONE}" to "Prepaid plan"`);
  await screen.findByText('Changed in Checklist: Prepaid plan');
  expect(await within(second).findByText(/This task changed after this/)).toBeTruthy();
  expect(
    within(second).getByText('Waiting for: “Appointment on Friday” → “Appointment on Monday”')
  ).toBeTruthy();
  // The private reason text never reaches analytics.
  expect(mockCapture.mock.calls.length).toBeGreaterThan(0);
  expect(JSON.stringify(mockCapture.mock.calls)).not.toContain('Appointment on');
});

// #365 + #370 composition (post-merge acceptance, written after the merge): one
// conversation uses both command families through the same send hook and cards.
it('in one conversation, a waiting command, an ambiguous edit, a remember command and a repeated one each get their own saved result or question', async () => {
  // Wrong if: one family's command is answered by the model, an ambiguous edit loses its
  // #365 question, a remember command does not save exactly its detail, a repeated one
  // saves twice, a card shows the other family's result, or analytics gets private text.
  server.addCustomTask(SIN);
  renderScreen();
  await send(`Mark task "${PHONE}" as waiting: Appointment on Friday`);
  const edit = await screen.findByTestId('task-command-card');
  expect(within(edit).getByText('Waiting for: (empty) → “Appointment on Friday”')).toBeTruthy();

  server.addCustomTask(PHONE);
  await send(`Set priority of task "${PHONE}" to Do now`);
  expect(
    await screen.findByText(`2 tasks are called “${PHONE}”, so I did not change any of them. Open the one you mean in Checklist and change it there.`)
  ).toBeTruthy();

  await send('Remember that I can attend appointments on Fridays');
  const detail = await screen.findByTestId('detail-command-card');
  expect(await within(detail).findByText('Saved: “I can attend appointments on Fridays”.')).toBeTruthy();
  await send('Remember that I can attend appointments on Fridays');
  expect(
    await screen.findByText('That detail is already saved. You can see it under Saved details.')
  ).toBeTruthy();

  expect(screen.getAllByTestId('task-command-card')).toHaveLength(1);
  expect(screen.getAllByTestId('detail-command-card')).toHaveLength(1);
  expect(writes().map(b => b.operations[0].type)).toEqual(['task.set_state', 'detail.create']);
  expect(server.details().map(d => d.text)).toEqual(['I can attend appointments on Fridays']);
  expect(server.row(phoneRef)).toMatchObject({ state: 'waiting', reason: 'Appointment on Friday' });
  expect(mockStream).not.toHaveBeenCalled();
  expect(JSON.stringify(mockCapture.mock.calls)).not.toMatch(/Appointment on|Fridays/);
});
