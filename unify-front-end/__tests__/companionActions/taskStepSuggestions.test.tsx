// Mounted acceptance for suggested task steps (mobile-app#366): the real Companion screen,
// its conversation cards and the bottom sheet, driven through user controls. The
// network is the scripted contract stand-in; the real endpoint and database are
// covered by companionActionsLocalStack.test.tsx and the web repo's steps_test.ts.
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


const SIN_STEPS = [
  'Review the official requirements',
  'Prepare the required documents',
  'Submit the application yourself',
];
/** The model answers with suggested steps for one Checklist task. */
function answersSteps(text: string, taskRef: string, titles: string[]) {
  mockStream.mockImplementation(
    async (_q: string, _c: string, _h: unknown, cb: { onMetadata: (m: unknown) => void; onComplete: (c: unknown) => void }) => {
      cb.onMetadata({ sources: [], queryType: 'newcomer_settlement' });
      cb.onComplete({
        cleanAnswer: text,
        actionProposal: { type: 'step.create', version: 1, task_ref: taskRef, titles },
      });
    }
  );
}
const stepApplies = () =>
  server.sent.filter(b => b.action === 'apply' && String(b.operations?.[0]?.type).startsWith('step.'));

describe('Suggested steps through Companion (mobile, #366)', () => {
  it('suggested steps are a draft card; excluding one makes a new revision; approval adds exactly the selected steps once', async () => {
    // Wrong if: a step is saved before approval, the approval names an older revision or
    // other titles, a double tap adds twice, or the typed message is lost.
    answersSteps('Start with the official requirements.', 'sanity:sin', SIN_STEPS);
    renderScreen();
    await send('How do I get my SIN?');

    const card = await screen.findByTestId('step-draft-card');
    expect(within(card).getByText('Steps for Get a SIN')).toBeTruthy();
    expect(within(card).getByText('Draft · not saved yet')).toBeTruthy();
    expect(server.steps()).toEqual([]);
    expect(stepApplies()).toHaveLength(0);
    fireEvent.changeText(composer(), 'My next question');

    fireEvent.press(within(card).getByRole('button', { name: 'Review suggested steps for Get a SIN' }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    expect(within(sheet).getByRole('header', { name: 'Review suggested steps' })).toBeTruthy();
    expect(within(sheet).getByText('For: Get a SIN')).toBeTruthy();
    for (const title of SIN_STEPS) expect(within(sheet).getByRole('checkbox', { name: title })).toBeChecked();

    fireEvent.press(within(sheet).getByRole('checkbox', { name: SIN_STEPS[2] }));
    const approve = await within(sheet).findByRole('button', { name: 'Add selected steps (2)' });
    await waitFor(() => expect(enabled(approve)).toBe(true));
    const revise = server.sent.filter(b => b.action === 'revise');
    expect(revise).toHaveLength(1);
    expect(revise[0].operation.titles).toEqual(SIN_STEPS.slice(0, 2));

    fireEvent.press(approve);
    fireEvent.press(approve);
    expect(await within(sheet).findByText('Steps added to this task: 2')).toBeTruthy();
    expect(stepApplies()).toHaveLength(1);
    expect(stepApplies()[0].authorization).toEqual({
      kind: 'approved_proposal',
      proposal_id: server.stepDrafts()[0].proposal_id,
      proposal_revision: 2,
    });
    expect(server.steps().map(s => s.title)).toEqual(SIN_STEPS.slice(0, 2));

    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
    await within(screen.getByTestId('step-draft-card')).findByText('Steps added to this task: 2');
  });

  it('Not now closes the draft and writes no step; at the AI limit a draft can still be added without a model request', async () => {
    // Wrong if: Not now saves anything, or approval needs another AI answer.
    answersSteps('Here are steps.', 'sanity:sin', SIN_STEPS.slice(0, 1));
    renderScreen();
    await send('How do I get my SIN?');
    const card = await screen.findByTestId('step-draft-card');
    fireEvent.press(await within(card).findByRole('button', { name: 'Review suggested steps for Get a SIN' }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: 'Not now' }));
    expect(await within(sheet).findByText('Not added.')).toBeTruthy();
    expect(stepApplies()).toHaveLength(0);
    expect(server.steps()).toEqual([]);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));

    answersSteps('More steps.', 'sanity:sin', SIN_STEPS.slice(1, 2));
    await send('And then?');
    await waitFor(() => expect(screen.getAllByTestId('step-draft-card')).toHaveLength(2));
    const cards = screen.getAllByTestId('step-draft-card');
    const calls = mockStream.mock.calls.length;
    mockMessageCount = 999; // the AI allowance is used up from here on
    fireEvent.press(await within(cards[cards.length - 1]).findByRole('button', { name: 'Review suggested steps for Get a SIN' }));
    const again = await screen.findByTestId('companion-task-sheet');
    const add = await within(again).findByRole('button', { name: 'Add selected steps (1)' });
    await waitFor(() => expect(enabled(add)).toBe(true));
    fireEvent.press(add);
    expect(await within(again).findByText('Steps added to this task: 1')).toBeTruthy();
    expect(server.steps().map(s => s.title)).toEqual([SIN_STEPS[1]]);
    expect(mockStream.mock.calls.length).toBe(calls);
  });
});
