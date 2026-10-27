// Mounted acceptance of settlement plans (mobile-app#364, direction B) against the real
// local stack: the actual Companion screen, send hook, plan entry, plan cards and the
// task bottom sheet send real HTTP requests with real user JWTs to the real
// companion-actions edge function, which writes through this repo's migrations to a
// real Postgres with RLS. Conversations and messages are saved to the same database
// with the user's JWT (PostgREST). Only the model stream, Sanity content and
// generation-allowance hooks are stand-ins; the model answer carries the typed plan
// suggestion exactly as rag-query returns it (web repo index_companion_context_test.ts).
//
// Runs only when ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY point at
// the disposable 127.0.0.1 stack of the web repo (supabase/tests/companion-actions/run.sh,
// ACTIONS_KEEP=1). See DOCS/companion-actions/364-plan.md.
// Enabled runs must explicitly name that project's ACTIONS_DB_CONTAINER and
// ACTIONS_REST_CONTAINER. There is no default container selection.
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { StyleSheet, TouchableOpacity } from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = process.env.ACTIONS_API_URL ?? '';
const ANON_KEY = process.env.ACTIONS_ANON_KEY ?? '';
const SERVICE_KEY = process.env.ACTIONS_SERVICE_ROLE_KEY ?? '';
const DB_CONTAINER = process.env.ACTIONS_DB_CONTAINER?.trim() ?? '';
const REST_CONTAINER = process.env.ACTIONS_REST_CONTAINER?.trim() ?? '';
const enabled = /^http:\/\/127\.0\.0\.1:\d+$/.test(API_URL) && Boolean(ANON_KEY && SERVICE_KEY);
if (enabled && (!DB_CONTAINER || !REST_CONTAINER)) {
  throw new Error(
    'ACTIONS_DB_CONTAINER and ACTIONS_REST_CONTAINER are required for enabled local-stack tests.'
  );
}
process.env.EXPO_PUBLIC_SUPABASE_URL = API_URL;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
const mockJwts = new Map<string, string>();

let mockUserId = 'user-1';
let mockCapture: jest.Mock = jest.fn();
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
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
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
  const gesture: any = { onUpdate: () => gesture, onEnd: () => gesture, enabled: () => gesture };
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
    useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
  };
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9', extra: {} } },
}));
const mockPostHog = { capture: (...args: unknown[]) => mockCapture(...args), screen: () => {} };
jest.mock('posthog-react-native', () => ({ usePostHog: () => mockPostHog }));
jest.mock('@/context/HapticsContext', () => ({ useHapticsPreference: () => ({ hapticsEnabled: false }) }));
const mockRefreshStage = jest.fn().mockResolvedValue(undefined);
const mockApplyConfirmedArrival = jest.fn();
jest.mock('@/hooks/onboarding/useUserStage', () => ({
  useUserStage: () => ({
    currentStage: 0,
    stageChanged: false,
    arrivalDate: null,
    userId: mockUserId,
    refreshStage: mockRefreshStage,
    applyConfirmedArrival: mockApplyConfirmedArrival,
    isLoading: false,
  }),
}));
jest.mock('@/hooks/checklist/useRefreshingToday', () => ({
  useRefreshingToday: () => new Date(2026, 9, 27, 12, 0, 0),
}));
const mockRefreshUser = jest.fn();
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({ currentUser: { id: mockUserId, isPremium: false }, refreshUser: mockRefreshUser }),
}));

// Conversations and messages: the same tables the app uses, written and read with the
// signed-in user's JWT through PostgREST (row-level security applies).
const mockRest = (pathname: string, init: { method: string; body?: unknown; prefer?: string }) =>
  (globalThis as any).__planRealFetch(`${process.env.ACTIONS_API_URL}${pathname}`, {
    method: init.method,
    headers: {
      'content-type': 'application/json',
      apikey: process.env.ACTIONS_ANON_KEY,
      authorization: `Bearer ${mockJwts.get(mockUserId)}`,
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }).then(async (res: Response) => {
    const text = await res.text();
    if (!res.ok) throw new Error(`rest ${pathname} ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  });
jest.mock('@/services/companion/createConversation', () => ({
  createConversation: jest.fn(async () => {
    const [row] = await mockRest('/rest/v1/conversations?select=id,conversation_identifier', {
      method: 'POST',
      body: { user_id: mockUserId, title: 'Plan' },
      prefer: 'return=representation',
    });
    return { conversation_identifier: row.conversation_identifier, id: row.id };
  }),
}));
jest.mock('@/services/companion/saveMessage', () => ({
  saveMessage: jest.fn(async (p: { conversationIdentifier: string; role: string; content: string }) => {
    const [conv] = await mockRest(
      `/rest/v1/conversations?select=id&conversation_identifier=eq.${p.conversationIdentifier}`,
      { method: 'GET' }
    );
    const [row] = await mockRest('/rest/v1/messages?select=id', {
      method: 'POST',
      body: { conversation_id: conv.id, role: p.role, content: p.content },
      prefer: 'return=representation',
    });
    return { id: row.id };
  }),
}));
jest.mock('@/services/companion/getConversationMessages', () => ({
  getConversationMessages: jest.fn(async (conversation: string) => {
    const rows = await mockRest(
      `/rest/v1/messages?select=id,role,content,created_at,conversations!inner(conversation_identifier)&conversations.conversation_identifier=eq.${conversation}&order=id`,
      { method: 'GET' }
    );
    return rows.map((m: any) => ({ id: m.id, role: m.role, content: m.content, sources: null, created_at: m.created_at }));
  }),
}));
jest.mock('@/services/companion/getConversations', () => ({ getConversations: jest.fn(async () => []) }));
let mockMessageCount = 0;
jest.mock('@/hooks/companion/useChatbotUsage', () => ({
  useChatbotUsage: () => ({ data: { message_count: mockMessageCount } }),
}));
jest.mock('@/hooks/companion/useCompanionReviewPrompt', () => ({ useCompanionReviewPrompt: () => {} }));
jest.mock('@/hooks/companion/usePersonalizedStarters', () => ({ usePersonalizedStarters: () => ({ data: undefined }) }));
const mockStream = jest.fn();
jest.mock('@/utils/gemini', () => ({
  AICompanionBusyError: class extends Error {},
  AICompanionLimitError: class extends Error {},
  streamGeminiAPI: (...a: unknown[]) => mockStream(...a),
}));
jest.mock('@/components/companion/TypingIndicator', () => ({ TypingIndicator: () => null }));
jest.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/components/companion/AnimatedDottedBackground', () => ({ AnimatedDottedBackground: () => null }));
jest.mock('@/components/companion/StarterPrompts', () => ({ StarterPrompts: () => null }));
jest.mock('@/components/companion/PartnerSpotlightBanner', () => () => null);
jest.mock('@/components/icons/SendIcon.svg', () => () => null);
jest.mock('lucide-react-native', () => ({ History: () => null, Plus: () => null }));
jest.mock('@/components/common/BottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/sanity/useSanityLanguage', () => ({ useSanityLanguage: () => 'en' }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } } }),
      getSession: async () => ({
        data: { session: { user: { id: mockUserId }, access_token: mockJwts.get(mockUserId) } },
      }),
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        mockAuthListeners.add(listener);
        return { data: { subscription: { unsubscribe: () => mockAuthListeners.delete(listener) } } };
      },
    },
  },
}));
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: jest.fn(async () => ({ persona: 'skilled_worker', province: 'British Columbia' })),
}));
jest.mock('@/sanity-custom', () => ({
  sanityClient: {
    fetch: jest.fn(async () => [
      { _id: 'sin-number', _type: 'checklist', title: 'Get your SIN', class: 'do_now', class_order: 1 },
      { _id: 'bank-account', _type: 'checklist', title: 'Open a bank account', class: 'do_now', class_order: 2 },
    ]),
  },
}));
jest.mock('@/services/checklist/getUserTasks', () => ({ getUserTasks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn().mockResolvedValue([]),
  deleteCustomChecklistTask: jest.fn(),
  setCustomChecklistTaskCompletion: jest.fn(),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: jest.fn().mockResolvedValue([]),
  upsertChecklistTaskOrder: jest.fn(),
}));
jest.mock('@/services/checklist/setChecklistItemCompletion', () => ({ setChecklistItemCompletion: jest.fn() }));
jest.mock('@/services/checklist/setChecklistItemDismissed', () => ({ setChecklistItemDismissed: jest.fn() }));
jest.mock('@/components/home/HomeHeader', () => () => null);
jest.mock('@/components/LoadingScreen', () => () => null);
jest.mock('@/components/partners/SpotlightRow', () => () => null);

import CompanionScreen from '@/app/(tabs)/companion/index';
import { clearPlanStores } from '@/services/companionActions/planStore';
import { clearTaskActionStores } from '@/services/companionActions/taskActionStore';

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
function mount() {
  // A new query client per mount (a client restart): nothing is shared but the server.
  // The managed client also disposes resources removed during account changes.
  const client = createTestQueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={testI18n()}>
        <CompanionScreen />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

const realFetch: typeof fetch = (globalThis as any).__realFetch ?? global.fetch;
(globalThis as any).__planRealFetch = realFetch;

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
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-qtA', '-U', 'postgres', '-d', 'postgres'],
    { input: sqlText, stdio: ['pipe', 'pipe', 'pipe'] }
  ).toString().trim();
}

async function newAccount(label: string) {
  const email = `${label}-${Date.now()}@mobile364.invalid`;
  const password = 'mobile-plans-1';
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
  const id = created.json.id as string;
  const jwt = token.json.access_token as string;
  mockJwts.set(id, jwt);
  // The fictional Vancouver arrival: profile and the two existing Checklist tasks.
  await http('/rest/v1/user_onboarding_profiles', {
    method: 'POST',
    jwt,
    body: JSON.stringify({ id, persona: 'skilled_worker', city: 'Vancouver', province: 'British Columbia',
      arrival_date: '2026-11-02T00:00:00Z', stage: 0, wants_reminders: false }),
  });
  for (const sanity of ['sin-number', 'bank-account']) {
    await http('/rest/v1/user_tasks', {
      method: 'POST',
      jwt,
      body: JSON.stringify({ user_id: id, sanity_checklist_id: sanity, completed: false }),
    });
  }
  return { id, jwt };
}

const actions = (jwt: string, body: Record<string, unknown>, platform = 'web') =>
  http('/functions/v1/companion-actions', {
    method: 'POST',
    jwt,
    body: JSON.stringify({ contract_version: 1, client: { platform, app_version: 'test' }, ...body }),
  });

const GOAL = 'Your first week in Vancouver';
const PHONE = 'Set up phone service';
const SUGGESTION = {
  type: 'plan',
  version: 1,
  goal: GOAL,
  items: [
    { kind: 'existing', task_ref: 'sanity:sin-number', label: 'Get your SIN' },
    { kind: 'existing', task_ref: 'sanity:bank-account', label: 'Open a bank account' },
    { kind: 'new', title: PHONE },
  ],
};

/** The model answer, with the typed plan suggestion rag-query extracted. */
function answersWithPlan() {
  mockStream.mockImplementation(async (_q: string, _c: string, _h: unknown, cb: any) => {
    cb.onMetadata({ sources: [], queryType: 'newcomer_settlement' });
    cb.onComplete({ cleanAnswer: 'You already have your SIN and bank tasks. A phone plan helps with both.', actionProposal: SUGGESTION });
  });
}

const composer = () => screen.getByPlaceholderText('Ask anything...');
const sendButton = () => {
  const button = screen.UNSAFE_getAllByType(TouchableOpacity).find(b => StyleSheet.flatten(b.props.style)?.borderRadius === 20);
  if (!button) throw new Error('send control missing');
  return button;
};
async function send(text: string) {
  fireEvent.changeText(await screen.findByPlaceholderText(/Ask anything|limit/i), text);
  fireEvent.press(sendButton());
}
const isEnabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  el.props.accessibilityState?.disabled !== true;
async function enabledButton(scope: ReturnType<typeof within>, name: string | RegExp) {
  await scope.findByRole('button', { name }, { timeout: 10_000 });
  await waitFor(() => expect(isEnabled(scope.getByRole('button', { name }))).toBe(true), { timeout: 10_000 });
  return scope.getByRole('button', { name });
}
const sqlCount = (userId: string, where = 'true') =>
  Number(psql(`select count(*) from custom_checklist_tasks where user_id = '${userId}' and ${where};`));

/** A saved plan, made through the real endpoint as another platform would. */
async function savedPlanFor(acc: { id: string; jwt: string }) {
  const p = await actions(acc.jwt, { action: 'plan_prepare', goal: GOAL, items: SUGGESTION.items });
  const draft = p.json.plan_proposal;
  const w = await actions(acc.jwt, {
    action: 'plan_apply',
    operation_id: (globalThis.crypto as Crypto).randomUUID(),
    authorization: { kind: 'approved_proposal', proposal_id: draft.plan_proposal_id, proposal_revision: draft.proposal_revision },
    items: draft.items,
  }, 'ios');
  if (w.status !== 200) throw new Error(`plan_apply ${w.status} ${JSON.stringify(w.json)}`);
  return w.json;
}

function switchAccount(id: string) {
  mockUserId = id;
  act(() => {
    for (const l of [...mockAuthListeners]) l('SIGNED_IN', { user: { id }, access_token: mockJwts.get(id) });
  });
}

const describeStack = enabled ? describe : describe.skip;

describeStack('Settlement plans against the real local stack (mobile)', () => {
  it('a saved task completion reconciles the plan entry without reopening the screen', async () => {
    const acc = await newAccount('plan-progress');
    mockUserId = acc.id;
    const saved = await savedPlanFor(acc);
    mount();
    const entry = await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, 0 of 3 done`) }, { timeout: 10_000 });
    fireEvent.changeText(composer(), 'Keep this question');
    fireEvent.press(entry);
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: `${PHONE}, Not started` }));
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: 'Completed' })).not.toBeDisabled());
    fireEvent.press(within(sheet).getByRole('radio', { name: 'Completed' }));
    await within(sheet).findByText('Changed from Not started to Completed', {}, { timeout: 10_000 });
    const current = await actions(acc.jwt, { action: 'read' });
    const phoneRef = saved.receipt.results[2].task_ref;
    expect(current.json.tasks.find((row: { task_ref: string }) => row.task_ref === phoneRef).state).toBe('completed');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, 1 of 3 done`) }, { timeout: 10_000 });
    expect(composer().props.value).toBe('Keep this question');
  }, 60_000);
  beforeAll(async () => {
    const applied = (name: string) => psql(`select to_regclass('public.${name}') is not null;`) === 't';
    const migrations = path.resolve(__dirname, '../../supabase/migrations');
    if (!applied('companion_action_receipts'))
      psql(fs.readFileSync(path.join(migrations, '20261025235536_companion_task_actions.sql'), 'utf8'));
    if (psql(`select to_regprocedure('public.companion_prepare_proposal(uuid,jsonb,jsonb)') is not null;`) !== 't')
      psql(fs.readFileSync(path.join(migrations, '20261026165156_companion_task_create.sql'), 'utf8'));
    if (!applied('companion_plan_proposals'))
      psql(fs.readFileSync(path.join(migrations, '20261027183338_companion_settlement_plan.sql'), 'utf8'));
    psql(`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
            max_contract_version = 1, allowed_platforms = '{ios,android,web}';`);
    execFileSync('docker', ['kill', '--signal=SIGUSR1', REST_CONTAINER], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      const ready = await http('/rest/v1/rpc/companion_plans_read', {
        method: 'POST',
        key: SERVICE_KEY,
        body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
      });
      if (ready.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, 60_000);

  beforeEach(() => {
    global.fetch = realFetch;
    mockCapture = jest.fn();
    mockStream.mockReset();
    clearPlanStores(null);
    clearTaskActionStores(null);
  });
  afterEach(() => {
    global.fetch = realFetch;
    clients.splice(0).forEach(client => client.clear());
  });

  it('a suggested plan is a draft that reuses two tasks and proposes one; excluding changes the count; approval adds exactly one task', async () => {
    const acc = await newAccount('plan-a');
    mockUserId = acc.id;
    answersWithPlan();
    mount();
    await send('I arrive in Vancouver next week. Help me plan my first week.');

    const card = await screen.findByTestId('plan-card', {}, { timeout: 10_000 });
    expect(within(card).getByText('Draft plan · not saved yet')).toBeTruthy();
    expect(within(card).getByText(GOAL)).toBeTruthy();
    expect(within(card).getByText('2 tasks you already have · 1 new task')).toBeTruthy();
    expect(sqlCount(acc.id)).toBe(0);
    // The typed message stays while the user reviews.
    fireEvent.changeText(composer(), 'My next question');

    fireEvent.press(within(card).getByRole('button', { name: `Review plan: ${GOAL}` }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    expect(within(sheet).getByRole('header', { name: 'Review plan' })).toBeTruthy();
    expect(await within(sheet).findByText('Get your SIN')).toBeTruthy();
    expect(within(sheet).getByText('Open a bank account')).toBeTruthy();
    expect(within(sheet).getAllByText('Already in your Checklist · Not started')).toHaveLength(2);
    expect(within(sheet).getByText('City: Vancouver')).toBeTruthy();
    const include = within(sheet).getByRole('checkbox', { name: `Add ${PHONE}` });
    expect(include.props.accessibilityState.checked).toBe(true);
    await enabledButton(within(sheet), 'Approve and add 1 task');

    // Excluding the addition is a draft edit (a new revision): the count follows it.
    fireEvent.press(include);
    await enabledButton(within(sheet), 'Save plan with existing tasks');
    expect(sqlCount(acc.id)).toBe(0);
    fireEvent.press(within(sheet).getByRole('checkbox', { name: `Add ${PHONE}` }));
    const approve = await enabledButton(within(sheet), 'Approve and add 1 task');

    fireEvent.press(approve);
    fireEvent.press(approve);
    expect(await within(sheet).findByText('Added 1 task. Reused 2 tasks you already had.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(sqlCount(acc.id, `title = '${PHONE}'`)).toBe(1);
    expect(Number(psql(`select count(*) from companion_plans where user_id = '${acc.id}';`))).toBe(1);

    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
    // The persistent entry, outside any message, now names the saved plan.
    const entry = await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 });
    expect(within(entry).getByText('0 of 3 done')).toBeTruthy();
    // Analytics carry categories and a count only.
    const sent = JSON.stringify(mockCapture.mock.calls);
    expect(sent).not.toContain(PHONE);
    expect(sent).not.toContain(GOAL);
  }, 60_000);

  it('the plan entry resumes the saved plan after a restart with current progress, never reads as "no plan" while loading, and Undo removes only the added task after confirmation', async () => {
    const acc = await newAccount('plan-b');
    mockUserId = acc.id;
    const saved = await savedPlanFor(acc);
    const phoneRef = saved.receipt.results[2].task_ref as string;
    // Progress made later on the web: the plan shows it, never a copy.
    const st = await actions(acc.jwt, { action: 'apply', operation_id: (globalThis.crypto as Crypto).randomUUID(),
      authorization: { kind: 'ui_control' }, operations: [{ type: 'task.set_state', task_ref: 'sanity:sin-number', state: 'completed', expected_revision: 1 }] });
    expect(st.status).toBe(200);

    // Hold the first plan read: the entry says it is checking, not that there is no plan.
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    let heldOnce = false;
    global.fetch = (async (url: any, init: any) => {
      if (!heldOnce && String(init?.body ?? '').includes('"action":"plans"')) {
        heldOnce = true;
        await held;
      }
      return realFetch(url, init);
    }) as typeof fetch;
    mount();
    expect(await screen.findByText('Checking your saved plan…')).toBeTruthy();
    release();
    const entry = await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 });
    expect(within(entry).getByText('1 of 3 done')).toBeTruthy();

    fireEvent.press(entry);
    const sheet = await screen.findByTestId('companion-task-sheet');
    expect(await within(sheet).findByText('Saved plan · uses your shared Checklist')).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /Get your SIN, Completed/ })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: new RegExp(`${PHONE}, Not started`) })).toBeTruthy();
    expect(within(sheet).getByText('Added 1 task. Reused 2 tasks you already had.')).toBeTruthy();

    // Undo removes a task: it asks first. Keep sends nothing.
    fireEvent.press(await enabledButton(within(sheet), 'Undo plan change'));
    expect(await within(sheet).findByText(`This removes 1 task the plan added: ${PHONE}. Your other tasks stay as they are.`)).toBeTruthy();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Keep plan' }));
    expect(sqlCount(acc.id, 'removed_at is null')).toBe(1);
    fireEvent.press(await enabledButton(within(sheet), 'Undo plan change'));
    fireEvent.press(await enabledButton(within(sheet), 'Undo plan'));
    expect(await within(sheet).findByText('Plan undone. Removed 1 task.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(sqlCount(acc.id, 'removed_at is null')).toBe(0);
    expect(psql(`select completed from user_tasks where user_id = '${acc.id}' and sanity_checklist_id = 'sin-number';`)).toBe('t');
    expect(phoneRef).toMatch(/^custom:/);
  }, 60_000);

  it('a reply lost after commit is looked up and shown as saved; a failed lookup stays unresolved and never writes', async () => {
    const acc = await newAccount('plan-c');
    mockUserId = acc.id;
    const p = await actions(acc.jwt, { action: 'plan_prepare', goal: GOAL, items: SUGGESTION.items });
    expect(p.status).toBe(200);
    let applies = 0;
    let statusCalls = 0;
    global.fetch = (async (url: any, init: any) => {
      const body = String(init?.body ?? '');
      if (body.includes('"action":"plan_apply"')) {
        applies++;
        await realFetch(url, init); // committed on the server
        throw new TypeError('Network request failed'); // the reply never arrives
      }
      if (body.includes('"action":"plan_status"') && ++statusCalls === 1) {
        throw new TypeError('Network request failed');
      }
      return realFetch(url, init);
    }) as typeof fetch;
    mount();
    const entry = await screen.findByRole('button', { name: new RegExp(`Draft plan, ${GOAL}`) }, { timeout: 10_000 });
    fireEvent.press(entry);
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await enabledButton(within(sheet), 'Approve and add 1 task'));
    expect(await within(sheet).findByText('We could not check the result. The change may or may not have saved.', {}, { timeout: 10_000 })).toBeTruthy();
    // Unresolved: approval is off; only a lookup is offered.
    expect(isEnabled(within(sheet).getByRole('button', { name: 'Approve and add 1 task' }))).toBe(false);
    expect(applies).toBe(1);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Check again' }));
    expect(await within(sheet).findByText('Added 1 task. Reused 2 tasks you already had.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(applies).toBe(1);
    expect(sqlCount(acc.id)).toBe(1);
  }, 60_000);

  it("an account change hides the previous account's plan entry, cards and open plan before the next account renders", async () => {
    const a = await newAccount('plan-d1');
    const b = await newAccount('plan-d2');
    mockUserId = a.id;
    await savedPlanFor(a);
    mount();
    const entry = await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 });
    fireEvent.press(entry);
    await screen.findByTestId('companion-task-sheet');
    switchAccount(b.id);
    expect(screen.queryByText(GOAL)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    // B has no plan: once B's read answers, no plan entry and none of A's data.
    await waitFor(() => expect(screen.queryByText('Checking your saved plan…')).toBeNull(), { timeout: 10_000 });
    expect(screen.queryByRole('button', { name: /Your plan/ })).toBeNull();
    expect(screen.queryByText(GOAL)).toBeNull();
  }, 60_000);
});

if (!enabled) {
  it('local stack checks are skipped: ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are not set', () => {
    expect(enabled).toBe(false);
  });
}
