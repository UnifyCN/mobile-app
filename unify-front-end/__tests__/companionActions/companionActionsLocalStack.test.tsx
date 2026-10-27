// Mounted acceptance against the real local stack (mobile-app#361): the real
// Checklist and Companion screens send real HTTP requests with real user JWTs to
// the real companion-actions edge function, which writes through this repo's
// migration (applied here from supabase/migrations) to a real Postgres with RLS.
// Only Sanity content, profile and generation hooks are stand-ins.
//
// Runs only when ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY
// point at the disposable 127.0.0.1 stack of the web repo
// (supabase/tests/companion-actions/run.sh, ACTIONS_KEEP=1). Otherwise it is skipped.
// See DOCS/companion-actions/361-task-actions.md.
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
import en from '@/i18n/locales/en/translation.json';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = process.env.ACTIONS_API_URL ?? '';
const ANON_KEY = process.env.ACTIONS_ANON_KEY ?? '';
const SERVICE_KEY = process.env.ACTIONS_SERVICE_ROLE_KEY ?? '';
const DB_CONTAINER = process.env.ACTIONS_DB_CONTAINER ?? 'supabase_db_unify-actions-361';
const REST_CONTAINER = process.env.ACTIONS_REST_CONTAINER ?? 'supabase_rest_unify-actions-361';
const enabled = /^http:\/\/127\.0\.0\.1:\d+$/.test(API_URL) && Boolean(ANON_KEY && SERVICE_KEY);
process.env.EXPO_PUBLIC_SUPABASE_URL = API_URL;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
const mockJwts = new Map<string, string>();

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
      getSession: async () => ({
        data: {
          session: {
            user: { id: mockUserId },
            access_token: mockJwts.get(mockUserId),
          },
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

import ChecklistScreen from '@/app/(tabs)/Checklist/index';
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
function mount(node: React.ReactElement) {
  // A new query client per mount: nothing is shared but the server.
  const client = createTestQueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={testI18n()}>{node}</I18nextProvider>
    </QueryClientProvider>
  );
}

const realFetch: typeof fetch = (globalThis as any).__realFetch ?? global.fetch;

async function http(pathname: string, init: RequestInit & { key?: string; jwt?: string }) {
  const res = await realFetch(`${API_URL}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      apikey: init.key ?? ANON_KEY,
      authorization: `Bearer ${init.jwt ?? init.key ?? ANON_KEY}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

function psql(sqlText: string) {
  execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'postgres'],
    { input: sqlText, stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

async function newAccount(label: string) {
  const email = `${label}-${Date.now()}@mobile361.invalid`;
  const password = 'mobile-actions-1';
  const created = await http('/auth/v1/admin/users', {
    method: 'POST',
    key: SERVICE_KEY,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (created.status !== 200) throw new Error(`createUser ${created.status}`);
  const token = await http('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (token.status !== 200) throw new Error(`signIn ${token.status}`);
  mockJwts.set(created.json.id, token.json.access_token);
  return { id: created.json.id as string, jwt: token.json.access_token as string };
}

const actions = (jwt: string, body: Record<string, unknown>, platform = 'web') =>
  http('/functions/v1/companion-actions', {
    method: 'POST',
    jwt,
    body: JSON.stringify({
      contract_version: 1,
      client: { platform, app_version: 'test' },
      ...body,
    }),
  });

const describeStack = enabled ? describe : describe.skip;

describeStack('Task progress against the real local stack (mobile)', () => {
  beforeAll(async () => {
    const gate = await http('/rest/v1/companion_feature_gate?select=enabled', {
      method: 'GET',
      key: SERVICE_KEY,
    });
    if (gate.status !== 200) {
      // This repo's migration file, exactly as it ships.
      psql(
        fs.readFileSync(
          path.resolve(__dirname, '../../supabase/migrations/20261025235536_companion_task_actions.sql'),
          'utf8'
        )
      );
    }
    psql(`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
            max_contract_version = 1, allowed_platforms = '{ios,android,web}';`);
    execFileSync('docker', ['kill', '--signal=SIGUSR1', REST_CONTAINER], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      const ready = await http('/rest/v1/rpc/companion_read_tasks', {
        method: 'POST',
        key: SERVICE_KEY,
        body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
      });
      if (ready.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    global.fetch = realFetch;
  }, 60_000);

  afterEach(() => {
    clients.splice(0).forEach(client => client.clear());
  });

  it('a state and waiting reason saved in the mobile Checklist are the same record in Companion, on web and in the legacy table; another account sees nothing', async () => {
    const owner = await newAccount('owner');
    const stranger = await newAccount('stranger');
    mockUserId = owner.id;
    mockCapture = jest.fn();

    const checklist = mount(<ChecklistScreen />);
    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    const notStarted = await screen.findByRole('radio', { name: 'Not started' });
    await waitFor(() => expect(notStarted).toBeSelected());
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Waiting' })).not.toBeDisabled()
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    expect(
      await screen.findByText('Changed from Not started to Waiting', {}, { timeout: 10_000 })
    ).toBeTruthy();
    fireEvent.changeText(
      await screen.findByLabelText('What are you waiting for?'),
      'A letter from Service Canada'
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save waiting reason' })).not.toBeDisabled()
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save waiting reason' }));
    await waitFor(
      () => expect(screen.queryByText('Saving…')).toBeNull(),
      { timeout: 10_000 }
    );
    checklist.unmount();

    // The web client reads the same saved record through the same boundary.
    const web = await actions(owner.jwt, { action: 'read' });
    expect(web.status).toBe(200);
    const sin = web.json.tasks.find((t: any) => t.task_ref === 'sanity:sin');
    expect(sin).toMatchObject({
      state: 'waiting',
      waiting_reason: 'A letter from Service Canada',
      removed: false,
    });
    expect(sin.last_receipt).toMatchObject({ before_state: 'waiting', after_state: 'waiting', current: true });

    // The legacy Checklist row an older client reads: still open, same identity.
    const legacy = await http(
      `/rest/v1/user_tasks?select=sanity_checklist_id,completed,dismissed_at&sanity_checklist_id=eq.sin`,
      { method: 'GET', jwt: owner.jwt }
    );
    expect(legacy.json).toEqual([{ sanity_checklist_id: 'sin', completed: false, dismissed_at: null }]);

    // Another account sees none of it.
    const other = await actions(stranger.jwt, { action: 'read' });
    expect(other.status).toBe(200);
    expect(other.json.tasks).toEqual([]);

    // A new Companion mount (a later conversation) shows the saved progress.
    mount(<CompanionScreen />);
    const entry = await screen.findByRole('button', { name: /Your tasks/ });
    await waitFor(
      () => expect(within(entry).getByText('In progress: 0 · Waiting: 1')).toBeTruthy(),
      { timeout: 10_000 }
    );
    fireEvent.press(entry);
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: /Get a SIN/ }));
    const reason = await within(sheet).findByLabelText('What are you waiting for?');
    expect(reason.props.value).toBe('A letter from Service Canada');

    // Undo of the newest receipt restores Waiting with no reason, through the real service.
    await waitFor(() =>
      expect(within(sheet).getByRole('button', { name: 'Undo this change' })).not.toBeDisabled()
    );
    fireEvent.press(within(sheet).getByRole('button', { name: 'Undo this change' }));
    expect(
      await within(sheet).findByText(
        'Undid a change. The task is back to Waiting.',
        {},
        { timeout: 10_000 }
      )
    ).toBeTruthy();
    const after = await actions(owner.jwt, { action: 'read' });
    expect(after.json.tasks.find((t: any) => t.task_ref === 'sanity:sin')).toMatchObject({
      state: 'waiting',
      waiting_reason: null,
    });
  }, 60_000);
});

// ------------------------------------------------------------------ #366 task steps
// The same real stack with the #363 and #366 migrations of this repo applied. A new step
// under a content-backed task needs its published document: the edge runtime asks the
// content stand-in below (ACTIONS_CONTENT_PORT, see the web repo's run.sh).
const CONTENT_PORT = Number(process.env.ACTIONS_CONTENT_PORT ?? '60675');

function startContentStandIn(published: string[]) {
  const server = require('http').createServer((req: any, res: any) => {
    const url = new URL(req.url, 'http://stand-in');
    let id: unknown = null;
    try {
      id = JSON.parse(url.searchParams.get('$id') ?? 'null');
    } catch {
      id = null;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ result: typeof id === 'string' && published.includes(id) ? id : null }));
  });
  return new Promise<{ close: () => Promise<void> }>(resolve =>
    server.listen(CONTENT_PORT, '127.0.0.1', () =>
      resolve({ close: () => new Promise<void>(done => server.close(() => done())) })
    )
  );
}

const SIN_STEPS = [
  'Review the official requirements',
  'Prepare the required documents',
  'Submit the application yourself',
];

async function openChecklistTask() {
  fireEvent.press(await screen.findByText('Get a SIN'));
  fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
  const input = await screen.findByLabelText('New step');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add step' })).toBeTruthy());
  return input;
}

async function addStepThroughControl(title: string) {
  fireEvent.changeText(screen.getByLabelText('New step'), title);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add step' })).not.toBeDisabled(), {
    timeout: 10_000,
  });
  fireEvent.press(screen.getByRole('button', { name: 'Add step' }));
  return screen.findByRole('checkbox', { name: title }, { timeout: 10_000 });
}

async function toggle(title: string, checked: boolean) {
  await waitFor(() => expect(screen.getByRole('checkbox', { name: title })).not.toBeDisabled(), {
    timeout: 10_000,
  });
  fireEvent.press(screen.getByRole('checkbox', { name: title }));
  await waitFor(
    () =>
      checked
        ? expect(screen.getByRole('checkbox', { name: title })).toBeChecked()
        : expect(screen.getByRole('checkbox', { name: title })).not.toBeChecked(),
    { timeout: 10_000 }
  );
}

const stepsOf = (json: any, ref: string) =>
  (json.steps ?? []).filter((s: any) => s.task_ref === ref).map((s: any) => [s.title, s.done]);

describeStack('Task steps against the real local stack (mobile, #366)', () => {
  let content: { close: () => Promise<void> };
  beforeAll(async () => {
    const steps = await http('/rest/v1/rpc/companion_read_steps', {
      method: 'POST',
      key: SERVICE_KEY,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
    });
    if (steps.status !== 200) {
      // This repo's migrations, exactly as they ship.
      for (const file of ['20261026165156_companion_task_create.sql', '20261027183644_companion_task_steps.sql']) {
        psql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', file), 'utf8'));
      }
      execFileSync('docker', ['kill', '--signal=SIGUSR1', REST_CONTAINER], { stdio: 'ignore' });
      for (let i = 0; i < 50; i++) {
        const ready = await http('/rest/v1/rpc/companion_read_steps', {
          method: 'POST',
          key: SERVICE_KEY,
          body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
        });
        if (ready.status === 200) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    content = await startContentStandIn(['sin']);
  }, 60_000);

  afterAll(async () => {
    await content?.close();
  });

  afterEach(() => {
    clients.splice(0).forEach(client => client.clear());
  });

  it('steps added and checked in the mobile Checklist never complete the task; explicit completion keeps the unfinished step; Companion, web and a new mount read the same steps; another account sees none', async () => {
    // Wrong if: a step is missing from another surface, checking every step changes the
    // task, completion marks the unfinished step done, or another account reads a step.
    const owner = await newAccount('steps-owner');
    const stranger = await newAccount('steps-stranger');
    mockUserId = owner.id;
    mockCapture = jest.fn();

    const checklist = mount(<ChecklistScreen />);
    await openChecklistTask();
    for (const title of SIN_STEPS) await addStepThroughControl(title);
    expect(screen.getByLabelText('New step').props.value).toBe('');
    for (const title of SIN_STEPS) await toggle(title, true);
    expect(
      await screen.findByText('All steps are done. This task stays Not started until you mark it complete.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark task complete' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Not started' })).toBeSelected();

    await toggle(SIN_STEPS[2], false);
    expect(screen.queryByRole('button', { name: 'Mark task complete' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Completed' })).not.toBeDisabled(), {
      timeout: 10_000,
    });
    fireEvent.press(screen.getByRole('radio', { name: 'Completed' }));
    expect(await screen.findByText('Completed with 2 of 3 steps done.', {}, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: SIN_STEPS[2] })).toBeDisabled());
    checklist.unmount();

    const web = await actions(owner.jwt, { action: 'read' });
    expect(web.json.tasks.find((t: any) => t.task_ref === 'sanity:sin')).toMatchObject({ state: 'completed' });
    expect(stepsOf(web.json, 'sanity:sin')).toEqual([
      [SIN_STEPS[0], true],
      [SIN_STEPS[1], true],
      [SIN_STEPS[2], false],
    ]);
    const other = await actions(stranger.jwt, { action: 'read' });
    expect(other.json.steps).toEqual([]);

    // A later Companion mount (another conversation) reads the same saved steps.
    mount(<CompanionScreen />);
    fireEvent.press(await screen.findByRole('button', { name: /Your tasks/ }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: /Get a SIN/ }));
    expect(await within(sheet).findByText('Completed with 2 of 3 steps done.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByRole('checkbox', { name: SIN_STEPS[0] })).toBeChecked();
    expect(within(sheet).getByRole('checkbox', { name: SIN_STEPS[2] })).not.toBeChecked();
  }, 90_000);

  it('removing a step asks first; Keep changes nothing; Remove and its Undo go through the real service; the offered completion completes the task', async () => {
    // Wrong if: a step is removed without confirmation, Keep sends a write, the Undo does
    // not restore the step, or the offered completion does not save Completed.
    const owner = await newAccount('steps-remove');
    mockUserId = owner.id;
    mockCapture = jest.fn();
    mount(<ChecklistScreen />);
    await openChecklistTask();
    await addStepThroughControl('Bring two IDs');
    await addStepThroughControl('Choose a bank');

    fireEvent.press(screen.getByRole('button', { name: 'Remove step: Bring two IDs' }));
    expect(await screen.findByText('Remove “Bring two IDs”?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Keep step' }));
    expect(screen.getByRole('checkbox', { name: 'Bring two IDs' })).toBeTruthy();
    expect(stepsOf((await actions(owner.jwt, { action: 'read' })).json, 'sanity:sin')).toHaveLength(2);

    fireEvent.press(screen.getByRole('button', { name: 'Remove step: Bring two IDs' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Remove step' }));
    expect(await screen.findByText('Removed step: Bring two IDs', {}, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Bring two IDs' })).toBeNull(), {
      timeout: 10_000,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo “Removed step: Bring two IDs”' })).not.toBeDisabled(), {
      timeout: 10_000,
    });
    fireEvent.press(screen.getByRole('button', { name: 'Undo “Removed step: Bring two IDs”' }));
    expect(await screen.findByRole('checkbox', { name: 'Bring two IDs' }, { timeout: 10_000 })).toBeTruthy();

    await toggle('Bring two IDs', true);
    await toggle('Choose a bank', true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark task complete' })).not.toBeDisabled(), {
      timeout: 10_000,
    });
    fireEvent.press(screen.getByRole('button', { name: 'Mark task complete' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Completed' })).toBeSelected(), { timeout: 10_000 });
    const after = await actions(owner.jwt, { action: 'read' });
    expect(after.json.tasks.find((t: any) => t.task_ref === 'sanity:sin')).toMatchObject({ state: 'completed' });
    expect(stepsOf(after.json, 'sanity:sin')).toEqual([
      ['Bring two IDs', true],
      ['Choose a bank', true],
    ]);
  }, 90_000);
});

if (!enabled) {
  it('local stack checks are skipped: ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are not set', () => {
    expect(enabled).toBe(false);
  });
}
