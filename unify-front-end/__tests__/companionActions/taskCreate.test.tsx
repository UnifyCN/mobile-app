// Mounted acceptance of adding one task through Companion (mobile-app#363,
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
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { StyleSheet, TouchableOpacity } from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { scriptedServer } from '@/testSupport/companionActionsServer';
import { clearTaskActionStores } from '@/services/companionActions/taskActionStore';
import {
  TASK_PROPOSAL_ROOT,
  taskProposalKey,
} from '@/hooks/companion/useTaskActions';

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
  const client = new QueryClient({
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

const PHONE = 'Set up phone service';
/** The model answers; `title` is the one task it suggests, or none. */
function answers(text: string, title: string | null) {
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
        ...(title
          ? { actionProposal: { type: 'task.create_custom', version: 1, title } }
          : {}),
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
  fireEvent.changeText(await screen.findByPlaceholderText(/Ask anything|limit/i), text);
  fireEvent.press(sendButton());
}
const creates = () =>
  server.sent.filter(
    b => b.action === 'apply' && b.operations?.[0]?.type === 'task.create_custom'
  );
const enabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  el.props.accessibilityState?.disabled !== true;
async function openDraft(title = PHONE) {
  const card = await screen.findByTestId('task-draft-card');
  expect(within(card).getByText(title)).toBeTruthy();
  fireEvent.press(
    within(card).getByRole('button', { name: `Review the suggested task ${title}` })
  );
  const sheet = await screen.findByTestId('companion-task-sheet');
  expect(within(sheet).getByRole('header', { name: 'Review new task' })).toBeTruthy();
  return { card, sheet };
}
async function approveIn(sheet: ReturnType<typeof screen.getByTestId>, title: string) {
  const approve = await within(sheet).findByRole('button', {
    name: `Add 1 task to Checklist: ${title}`,
  });
  await waitFor(() => expect(enabled(approve)).toBe(true));
  return approve;
}

beforeEach(() => {
  mockUserId = `create-user-${++userCounter}`;
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

describe('Add one task through Companion (mobile)', () => {
  it('shows a suggested task as a draft, reviews its exact title and context, adds it once, and Checklist reads the same task', async () => {
    answers('A phone plan helps with both.', PHONE);
    renderScreen();
    await send('What else do I need for my first week in Vancouver?');

    const card = await screen.findByTestId('task-draft-card');
    expect(within(card).getByText('Draft · not in your Checklist yet')).toBeTruthy();
    expect(server.customTasks()).toEqual([]);
    expect(creates()).toHaveLength(0);
    // The typed message stays while the user reviews.
    fireEvent.changeText(composer(), 'My next question');

    const { sheet } = await openDraft();
    expect(within(sheet).getByLabelText('Task title').props.value).toBe(PHONE);
    expect(within(sheet).getByText('Priority: Do soon')).toBeTruthy();
    expect(within(sheet).getByText('City: Vancouver')).toBeTruthy();
    expect(within(sheet).getByText('Province: British Columbia')).toBeTruthy();
    const approve = await approveIn(sheet, PHONE);
    expect(within(approve).getByText('Add 1 task to Checklist')).toBeTruthy();

    fireEvent.press(approve);
    fireEvent.press(approve);
    expect(await within(sheet).findByText(`Added to Checklist: ${PHONE}`)).toBeTruthy();
    expect(creates()).toHaveLength(1);
    expect(server.customTasks().map(t => t.title)).toEqual([PHONE]);
    expect(creates()[0].authorization).toEqual({
      kind: 'approved_proposal',
      proposal_id: server.drafts()[0].proposal_id,
      proposal_revision: 1,
    });

    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
    await within(screen.getByTestId('task-draft-card')).findByText(
      `Added to Checklist: ${PHONE}`
    );

    // The task list (the same Checklist read) has the same task.
    fireEvent.press(screen.getByRole('button', { name: /Your tasks/ }));
    const list = await screen.findByTestId('companion-task-sheet');
    expect(await within(list).findByRole('button', { name: new RegExp(PHONE) })).toBeTruthy();
  });

  it('a clear command adds exactly its task without an AI answer; an unclear one asks and writes nothing', async () => {
    renderScreen();
    await send('Add task: Buy a transit pass');
    expect(await screen.findByText('Added to Checklist: Buy a transit pass')).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
    expect(creates()).toHaveLength(1);
    expect(creates()[0].authorization).toEqual({
      kind: 'direct_command',
      message_id: mockSaved[0].id,
    });

    await send('Add a task');
    expect(await screen.findByText(/Which task do you want to add\?/)).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
    expect(creates()).toHaveLength(1);
    expect(server.customTasks().map(t => t.title)).toEqual(['Buy a transit pass']);
  });

  it('a lost reply is looked up first; pending and failed lookups never write; not applied retries the same operation', async () => {
    let mode: 'drop' | 'pending' | 'lookup_fail' | null = 'drop';
    useServer(
      scriptedServer(
        {},
        {
          override: body => {
            if (body.action === 'apply' && mode === 'drop') {
              mode = 'pending';
              return 'network-error'; // the write never reached the server
            }
            if (body.action === 'status' && mode === 'pending') {
              mode = 'lookup_fail';
              return { status: 200, body: { status: 'pending' } };
            }
            if (body.action === 'status' && mode === 'lookup_fail') {
              mode = null;
              return 'network-error';
            }
            return undefined;
          },
        }
      )
    );
    answers('Answer.', PHONE);
    renderScreen();
    await send('Phone?');
    const { sheet } = await openDraft();
    fireEvent.press(await approveIn(sheet, PHONE));
    await within(sheet).findByText(/still being saved/i);
    expect(within(sheet).queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Check again' }));
    await within(sheet).findByText(/could not check/i);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Check again' }));
    const retry = await within(sheet).findByRole('button', { name: 'Try again' });
    const firstId = creates()[0].operation_id;
    await waitFor(() => expect(enabled(retry)).toBe(true));
    fireEvent.press(retry);
    await within(sheet).findByText(`Added to Checklist: ${PHONE}`);
    expect(new Set(creates().map(b => b.operation_id))).toEqual(new Set([firstId]));
    expect(server.customTasks()).toHaveLength(1);
  });

  it('an edited title and a changed profile each need a new approval of the shown revision', async () => {
    answers('Answer.', PHONE);
    renderScreen();
    await send('Phone?');
    const { sheet } = await openDraft();
    fireEvent.changeText(within(sheet).getByLabelText('Task title'), 'Get a Canadian SIM card');
    // An unsaved edit cannot be approved.
    const unsaved = within(sheet).getByRole('button', { name: /^Add 1 task to Checklist/ });
    expect(enabled(unsaved)).toBe(false);
    fireEvent.press(unsaved);
    expect(creates()).toHaveLength(0);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Save title' }));
    await within(sheet).findByText('You changed the title. Check it, then add the task.');

    server.setProfile({ city: 'Toronto', province: 'Ontario', arrival_date: '2026-11-02' });
    fireEvent.press(await approveIn(sheet, 'Get a Canadian SIM card'));
    await within(sheet).findByText(
      'Your profile changed since this draft was made. Check it again before you add the task.'
    );
    expect(within(sheet).getByText('City: Toronto')).toBeTruthy();
    expect(within(sheet).getByText('Before: Vancouver')).toBeTruthy();
    expect(server.customTasks()).toEqual([]);
    fireEvent.press(await approveIn(sheet, 'Get a Canadian SIM card'));
    await within(sheet).findByText('Added to Checklist: Get a Canadian SIM card');
    expect(creates().map(b => b.authorization.proposal_revision)).toEqual([2, 3]);
    expect(server.customTasks().map(t => t.title)).toEqual(['Get a Canadian SIM card']);
  });

  it('Undo of an added task asks first; Keep changes nothing; after a newer edit it offers a reviewed removal', async () => {
    renderScreen();
    await send('Add task: Buy a transit pass');
    const card = await screen.findByTestId('task-command-card');
    await within(card).findByText('Added to Checklist: Buy a transit pass');
    fireEvent.press(within(card).getByRole('button', { name: 'View task' }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    const undo = await within(sheet).findByRole('button', {
      name: 'Undo adding Buy a transit pass',
    });
    await waitFor(() => expect(enabled(undo)).toBe(true));
    fireEvent.press(undo);
    expect(
      await within(sheet).findByText('Remove “Buy a transit pass” from your Checklist?')
    ).toBeTruthy();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Keep task' }));
    expect(server.sent.filter(b => b.action === 'undo')).toHaveLength(0);

    // Another platform changes the task: Undo keeps that change and offers removal for review.
    server.editElsewhere(`custom:${server.customTasks()[0].id}`, 'in_progress');
    const again = await within(sheet).findByRole('button', {
      name: 'Undo adding Buy a transit pass',
    });
    await waitFor(() => expect(enabled(again)).toBe(true));
    fireEvent.press(again);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Remove' }));
    await within(sheet).findByText(
      'This task changed after it was added, so nothing was removed. You can still remove it.'
    );
    expect(server.customTasks()).toHaveLength(1);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Remove task' }));
    await waitFor(() => expect(server.customTasks()).toHaveLength(0));
    const approval = server.sent.filter(b => b.action === 'apply').at(-1)!;
    expect(approval.authorization.removal_confirmed).toBe(true);
  });

  it('at the AI limit a draft can still be added and no model request is made', async () => {
    answers('Answer.', PHONE);
    renderScreen();
    await send('Phone?');
    await screen.findByTestId('task-draft-card');
    expect(mockStream).toHaveBeenCalledTimes(1);
    mockMessageCount = 6; // the daily allowance is used up
    const { sheet } = await openDraft();
    fireEvent.press(await approveIn(sheet, PHONE));
    await within(sheet).findByText(`Added to Checklist: ${PHONE}`);
    expect(server.customTasks()).toHaveLength(1);
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it("an account change hides the previous account's cards, and a late draft reply reaches nobody", async () => {
    let release: (() => void) | null = null;
    const s = scriptedServer();
    useServer(s);
    const held = s.fetch;
    global.fetch = (async (url: string, init: { body: string }) => {
      if (JSON.parse(init.body).action === 'prepare')
        await new Promise<void>(r => (release = r));
      return held(url, init);
    }) as unknown as typeof fetch;
    answers('Answer.', PHONE);
    renderScreen();
    await send('Phone?');
    await waitFor(() => expect(release).not.toBeNull());
    mockUserId = 'create-user-other';
    await act(async () => {
      for (const listener of [...mockAuthListeners])
        listener('SIGNED_IN', { user: { id: mockUserId }, access_token: `jwt-${mockUserId}` });
    });
    await act(async () => release!());
    for (let i = 0; i < 6; i += 1) await act(async () => {});
    expect(screen.queryByTestId('task-draft-card')).toBeNull();
    expect(screen.queryByText(PHONE)).toBeNull();
  });

  it('reports only allowlisted action results, never the task title or message', async () => {
    renderScreen();
    await send('Add task: Buy a transit pass');
    await screen.findByText('Added to Checklist: Buy a transit pass');
    const events = mockCapture.mock.calls.filter(([name]) => name === 'companion_action_result');
    expect(events.length).toBeGreaterThan(0);
    for (const [, props] of events) {
      expect(JSON.stringify(props)).not.toMatch(/transit|Add task/i);
      expect(Object.keys(props).sort()).toEqual([
        'action',
        'entry_surface',
        'operation_type',
        'outcome',
      ]);
    }
    expect(events[0][1]).toMatchObject({
      operation_type: 'task.create_custom',
      action: 'command_create',
      outcome: 'applied',
    });
  });
});

// Save title and Not now replies that arrive after the account changed (#363 review
// S363-1). Each intent belongs to the account and epoch it started in. The reply is
// held at the transport after the stand-in answered, so it carries that account's
// private draft. A late reply must not put it back after the account scope removed
// it, nor write it under a later epoch of the same account; a token refresh of the
// same account keeps it.
describe('late Save title and Not now replies stay with their account', () => {
  const REVISED = 'Private revised task A';
  type Intent = 'revise' | 'cancel';
  const proposalEntries = (client: QueryClient, account: string) =>
    client.getQueryCache().findAll({ queryKey: [TASK_PROPOSAL_ROOT, account] });

  function authEvent(event: string, accountId: string | null) {
    return act(async () => {
      for (const listener of [...mockAuthListeners])
        listener(
          event,
          accountId ? { user: { id: accountId }, access_token: `jwt-${accountId}` } : null
        );
    });
  }

  /** Opens the draft, starts `intent` and holds its reply after the stand-in answered. */
  async function startHeld(intent: Intent, reply?: () => { status: number; body: unknown }) {
    answers('Answer.', PHONE);
    renderScreen();
    const client = clients[clients.length - 1];
    const owner = mockUserId;
    await send('Phone?');
    const { sheet } = await openDraft();
    await approveIn(sheet, PHONE);
    const proposalId = server.drafts()[0].proposal_id;
    expect(client.getQueryData(taskProposalKey(owner, proposalId))).toBeTruthy();
    const transport = global.fetch;
    let release: (() => void) | null = null;
    global.fetch = (async (url: string, init: { body: string }) => {
      const answered = await transport(url, init);
      if (JSON.parse(init.body).action !== intent) return answered;
      await new Promise<void>(r => (release = r));
      if (!reply) return answered;
      const r = reply();
      return { status: r.status, ok: false, json: async () => r.body };
    }) as unknown as typeof fetch;
    if (intent === 'revise') {
      fireEvent.changeText(within(sheet).getByLabelText('Task title'), REVISED);
      fireEvent.press(within(sheet).getByRole('button', { name: 'Save title' }));
    } else {
      fireEvent.press(within(sheet).getByRole('button', { name: 'Not now' }));
    }
    await waitFor(() => expect(release).not.toBeNull());
    return { client, owner, proposalId, release: () => act(async () => release!()) };
  }

  for (const intent of ['revise', 'cancel'] as const) {
    it(`${intent}: a reply after another account signed in does not restore the draft`, async () => {
      const { client, owner, proposalId, release } = await startHeld(intent);
      mockUserId = 'create-user-B';
      await authEvent('SIGNED_IN', mockUserId);
      await waitFor(() => expect(proposalEntries(client, owner)).toHaveLength(0));
      await release();
      for (let i = 0; i < 4; i += 1) await act(async () => {});
      expect(client.getQueryData(taskProposalKey(owner, proposalId))).toBeUndefined();
      expect(proposalEntries(client, owner)).toHaveLength(0);
      expect(proposalEntries(client, 'create-user-B')).toHaveLength(0);
      expect(screen.queryByText(REVISED)).toBeNull();
      expect(screen.queryByText(PHONE)).toBeNull();
    });

    it(`${intent}: a reply after sign-out does not restore the draft`, async () => {
      const { client, owner, proposalId, release } = await startHeld(intent);
      await authEvent('SIGNED_OUT', null);
      await waitFor(() => expect(proposalEntries(client, owner)).toHaveLength(0));
      await release();
      for (let i = 0; i < 4; i += 1) await act(async () => {});
      expect(client.getQueryData(taskProposalKey(owner, proposalId))).toBeUndefined();
      expect(proposalEntries(client, owner)).toHaveLength(0);
      expect(screen.queryByText(REVISED)).toBeNull();
    });

    it(`${intent}: a reply after sign-out and the same account signing back in is not written under the new session`, async () => {
      const { client, owner, proposalId, release } = await startHeld(intent);
      await authEvent('SIGNED_OUT', null);
      await waitFor(() => expect(proposalEntries(client, owner)).toHaveLength(0));
      await authEvent('SIGNED_IN', owner);
      await release();
      for (let i = 0; i < 4; i += 1) await act(async () => {});
      expect(client.getQueryData(taskProposalKey(owner, proposalId))).toBeUndefined();
      expect(proposalEntries(client, owner)).toHaveLength(0);
    });

    it(`${intent}: a token refresh of the same account keeps the reply and shows it`, async () => {
      const { client, owner, proposalId, release } = await startHeld(intent);
      await authEvent('TOKEN_REFRESHED', owner);
      await release();
      const sheet = screen.getByTestId('companion-task-sheet');
      if (intent === 'revise') {
        expect(await within(sheet).findByText(REVISED)).toBeTruthy();
        await approveIn(sheet, REVISED);
      } else {
        expect(
          await within(sheet).findByText('You closed this draft. Nothing was added.')
        ).toBeTruthy();
      }
      const kept = client.getQueryData<{ status: string; operation: { title: string } }>(
        taskProposalKey(owner, proposalId)
      );
      expect(kept).toMatchObject(
        intent === 'revise'
          ? { status: 'draft', operation: { title: REVISED } }
          : { status: 'cancelled' }
      );
    });
  }

  it('a late refusal after a token refresh of the same account is still shown', async () => {
    const { release } = await startHeld('cancel', () => ({
      status: 403,
      body: { error: 'forbidden' },
    }));
    await authEvent('TOKEN_REFRESHED', mockUserId);
    await release();
    const sheet = screen.getByTestId('companion-task-sheet');
    expect(
      await within(sheet).findByText(en.taskActions.refused)
    ).toBeTruthy();
  });
});

// Retry of a draft's approval after the first apply never reached the server (#363
// review F1). Retry repeats the reviewed operation with its own operation identity,
// so it is allowed only while the draft still shows that reviewed title. A changed
// title, saved or not, needs its own review: saving it makes a new revision whose
// approval is a new change. An unknown outcome stays a lookup only.
describe('Retry of an approved draft follows the shown title', () => {
  const SIM = 'Get a Canadian SIM card';
  /** The first apply is lost before the server; then status answers `lookups` in order. */
  function lostFirstApply(lookups: Array<'not_applied' | 'network-error'> = []) {
    let dropped = false;
    useServer(
      scriptedServer(
        {},
        {
          override: body => {
            if (body.action === 'apply' && !dropped) {
              dropped = true;
              return 'network-error';
            }
            if (body.action === 'status' && lookups.length) {
              const next = lookups.shift()!;
              return next === 'network-error'
                ? 'network-error'
                : { status: 200, body: { status: next } };
            }
            return undefined;
          },
        }
      )
    );
  }
  async function approvedThenLost() {
    answers('Answer.', PHONE);
    renderScreen();
    await send('Phone?');
    const { sheet } = await openDraft();
    fireEvent.press(await approveIn(sheet, PHONE));
    return sheet;
  }
  const button = (sheet: ReturnType<typeof screen.getByTestId>, name: string | RegExp) =>
    within(sheet).getByRole('button', { name });
  const settle = async () => {
    for (let i = 0; i < 8; i += 1) await act(async () => {});
  };

  it('an unsaved title edit after confirmed-not-applied cannot retry the old reviewed title', async () => {
    lostFirstApply();
    const sheet = await approvedThenLost();
    const retry = await within(sheet).findByRole('button', { name: 'Try again' });
    await waitFor(() => expect(enabled(retry)).toBe(true));
    fireEvent.changeText(within(sheet).getByLabelText('Task title'), SIM);
    expect(enabled(button(sheet, /^Add 1 task/))).toBe(false);
    expect(enabled(button(sheet, 'Try again'))).toBe(false);
    fireEvent.press(button(sheet, 'Try again'));
    await settle();
    expect(server.customTasks()).toEqual([]);
    expect(creates()).toHaveLength(1);
  });

  it('putting the reviewed title back allows Retry of the same operation', async () => {
    lostFirstApply();
    const sheet = await approvedThenLost();
    await within(sheet).findByRole('button', { name: 'Try again' });
    fireEvent.changeText(within(sheet).getByLabelText('Task title'), SIM);
    fireEvent.changeText(within(sheet).getByLabelText('Task title'), PHONE);
    await waitFor(() => expect(enabled(button(sheet, 'Try again'))).toBe(true));
    fireEvent.press(button(sheet, 'Try again'));
    await within(sheet).findByText(`Added to Checklist: ${PHONE}`);
    expect(creates()).toHaveLength(2);
    expect(new Set(creates().map(b => b.operation_id)).size).toBe(1);
    expect(creates()[1].operations).toEqual(creates()[0].operations);
    expect(server.customTasks().map(t => t.title)).toEqual([PHONE]);
  });

  it('a saved title edit after confirmed-not-applied replaces the old approval with a review of the new title', async () => {
    lostFirstApply();
    const sheet = await approvedThenLost();
    await within(sheet).findByRole('button', { name: 'Try again' });
    fireEvent.changeText(within(sheet).getByLabelText('Task title'), SIM);
    await waitFor(() => expect(enabled(button(sheet, 'Save title'))).toBe(true));
    fireEvent.press(button(sheet, 'Save title'));
    // The old approval is gone; the saved title is a new revision to review.
    const approve = await approveIn(sheet, SIM);
    expect(within(sheet).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(server.customTasks()).toEqual([]);
    fireEvent.press(approve);
    await within(sheet).findByText(`Added to Checklist: ${SIM}`);
    expect(creates()).toHaveLength(2);
    expect(creates()[1].operation_id).not.toBe(creates()[0].operation_id);
    expect(creates()[1].operations[0].title).toBe(SIM);
    expect(creates()[1].authorization).toMatchObject({
      kind: 'approved_proposal',
      proposal_revision: 2,
    });
    expect(server.customTasks().map(t => t.title)).toEqual([SIM]);
  });

  it('while the outcome is unknown an edit allows only Check again, never a write or a title save', async () => {
    lostFirstApply(['network-error', 'not_applied']);
    const sheet = await approvedThenLost();
    await within(sheet).findByText(/could not check/i);
    fireEvent.changeText(within(sheet).getByLabelText('Task title'), SIM);
    expect(within(sheet).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(enabled(button(sheet, 'Save title'))).toBe(false);
    expect(enabled(button(sheet, /^Add 1 task/))).toBe(false);
    expect(enabled(button(sheet, 'Check again'))).toBe(true);
    fireEvent.press(button(sheet, 'Check again'));
    await within(sheet).findByRole('button', { name: 'Try again' });
    expect(enabled(button(sheet, 'Try again'))).toBe(false);
    await settle();
    expect(creates()).toHaveLength(1);
    expect(server.sent.filter(b => b.action === 'revise')).toHaveLength(0);
    expect(server.customTasks()).toEqual([]);
  });
});
