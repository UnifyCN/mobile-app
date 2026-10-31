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
import { AccessibilityInfo, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
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

const mockChecklistRows:any[]=[];
const mockLegacyCompleted=jest.fn();
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
    from:(table:string)=>{
      const sdk=require('@supabase/supabase-js').createClient(process.env.ACTIONS_API_URL,process.env.ACTIONS_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(globalThis as any).__planRealFetch,headers:{Authorization:`Bearer ${mockJwts.get(mockUserId)}`}}});
      return sdk.from(table);
    },
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
  setCustomChecklistTaskCompletion: jest.fn(async (input:any)=>{await jest.requireActual('@/services/checklist/customChecklistTasks').setCustomChecklistTaskCompletion(input);mockLegacyCompleted();}),
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
        <RetainedTabs />
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

  it('a retry after a relevant profile change asks for a new approval of the remaining addition, still reachable after a restart; approving adds exactly one task', async () => {
    // Wrong if: the needs-review result is not shown, the same Retry is offered again,
    // the review is missing the remaining addition or its before/current context, it is
    // gone after a restart, approval adds zero or two tasks, or the reused tasks change.
    const acc = await newAccount('plan-e');
    mockUserId = acc.id;
    psql(`create function public.test364_mobile_fault() returns trigger language plpgsql as $f$
            begin if new.title = '${PHONE}' then raise exception 'injected fault'; end if; return new; end $f$;
          create trigger test364_mobile_fault before insert on custom_checklist_tasks
            for each row execute function public.test364_mobile_fault();`);
    let saved: any;
    try {
      saved = await savedPlanFor(acc);
    } finally {
      psql('drop trigger test364_mobile_fault on custom_checklist_tasks; drop function public.test364_mobile_fault();');
    }
    expect(saved.status).toBe('partial');
    const reused = () =>
      psql(`select string_agg(sanity_checklist_id || ':' || coalesce(revision, 0) || ':' || completed, ',' order by sanity_checklist_id)
              from user_tasks where user_id = '${acc.id}';`);
    const reusedBefore = reused();

    const first = mount();
    fireEvent.press(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
    let sheet = await screen.findByTestId('companion-task-sheet');
    expect(await within(sheet).findByText(`Could not add: ${PHONE}. Everything else is saved.`)).toBeTruthy();
    const patched = await http(`/rest/v1/user_onboarding_profiles?id=eq.${acc.id}`, {
      method: 'PATCH', jwt: acc.jwt, body: JSON.stringify({ city: 'Surrey' }),
    });
    expect(patched.status).toBeLessThan(300);
    fireEvent.press(await enabledButton(within(sheet), 'Try adding 1 task again'));
    expect(await within(sheet).findByText(`Not added, because something changed: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
    expect(await within(sheet).findByText('City: Surrey', {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByText('Before: Vancouver')).toBeTruthy();
    expect(within(sheet).getByRole('checkbox', { name: `Add ${PHONE}` }).props.accessibilityState.checked).toBe(true);
    await enabledButton(within(sheet), 'Approve and add 1 task');
    expect(within(sheet).queryByRole('button', { name: 'Try adding 1 task again' })).toBeNull();
    expect(sqlCount(acc.id)).toBe(0);

    // A restart: new query client, no store state. The review is reached from the entry.
    first.unmount();
    clients.splice(0).forEach(client => client.clear());
    clearPlanStores(null);
    mount();
    const entry = await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, .*needs your review`) }, { timeout: 10_000 });
    fireEvent.press(entry);
    sheet = await screen.findByTestId('companion-task-sheet');
    expect(await within(sheet).findByText('City: Surrey', {}, { timeout: 10_000 })).toBeTruthy();
    // It changes again before approval: nothing is written and the refreshed review shows it.
    await http(`/rest/v1/user_onboarding_profiles?id=eq.${acc.id}`, {
      method: 'PATCH', jwt: acc.jwt, body: JSON.stringify({ city: 'Burnaby' }),
    });
    fireEvent.press(await enabledButton(within(sheet), 'Approve and add 1 task'));
    expect(await within(sheet).findByText('City: Burnaby', {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByText('Before: Surrey')).toBeTruthy();
    expect(sqlCount(acc.id)).toBe(0);
    const approve = await enabledButton(within(sheet), 'Approve and add 1 task');
    fireEvent.press(approve);
    fireEvent.press(approve);
    expect(await within(sheet).findByText(`Added after your review: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
    expect(sqlCount(acc.id, `title = '${PHONE}'`)).toBe(1);
    expect(sqlCount(acc.id)).toBe(1);
    expect(reused()).toBe(reusedBefore);
    expect(within(sheet).queryByRole('button', { name: /Approve and add/ })).toBeNull();
    expect(await within(sheet).findByRole('button', { name: `${PHONE}, Not started` }, { timeout: 10_000 })).toBeTruthy();
    expect(JSON.stringify(mockCapture.mock.calls)).not.toContain(PHONE);
  }, 90_000);

  it('a lost reply to the revised review approval is looked up before anything else; a failed lookup stays unresolved and never writes again', async () => {
    // Wrong if: the review approval is sent twice, a failed lookup is shown as saved or
    // as not saved, or approval stays available while the outcome is unknown.
    const acc = await newAccount('plan-f');
    mockUserId = acc.id;
    psql(`create function public.test364_mobile_fault() returns trigger language plpgsql as $f$
            begin if new.title = '${PHONE}' then raise exception 'injected fault'; end if; return new; end $f$;
          create trigger test364_mobile_fault before insert on custom_checklist_tasks
            for each row execute function public.test364_mobile_fault();`);
    let saved: any;
    try {
      saved = await savedPlanFor(acc);
    } finally {
      psql('drop trigger test364_mobile_fault on custom_checklist_tasks; drop function public.test364_mobile_fault();');
    }
    await http(`/rest/v1/user_onboarding_profiles?id=eq.${acc.id}`, {
      method: 'PATCH', jwt: acc.jwt, body: JSON.stringify({ city: 'Surrey' }),
    });
    const retried = await actions(acc.jwt, {
      action: 'plan_retry', operation_id: (globalThis.crypto as Crypto).randomUUID(),
      receipt_operation_id: saved.operation_id, authorization: { kind: 'ui_control' },
    }, 'ios');
    expect(retried.json.receipt.results[0].outcome).toBe('needs_review');
    let applies = 0;
    let lookups = 0;
    global.fetch = (async (url: any, init: any) => {
      const body = String(init?.body ?? '');
      if (body.includes('"action":"plan_apply"')) {
        applies++;
        await realFetch(url, init);
        throw new TypeError('Network request failed');
      }
      if (body.includes('"action":"plan_status"') && ++lookups === 1) throw new TypeError('Network request failed');
      return realFetch(url, init);
    }) as typeof fetch;
    mount();
    fireEvent.press(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, .*needs your review`) }, { timeout: 10_000 }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await enabledButton(within(sheet), 'Approve and add 1 task'));
    expect(await within(sheet).findByText('We could not check the result. The change may or may not have saved.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(isEnabled(within(sheet).getByRole('button', { name: 'Approve and add 1 task' }))).toBe(false);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Check again' }));
    expect(await within(sheet).findByText(`Added after your review: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
    expect(applies).toBe(1);
    expect(sqlCount(acc.id)).toBe(1);
  }, 60_000);

  it('two unfinished retry reviews both stay reachable after a restart; each is approved on its own', async () => {
    // Wrong if: after a restart either review is missing, Retry is offered for an addition
    // waiting in a review, approving one review removes or changes the other, an approval
    // adds the wrong task or two, the saved addition changes, or the typed message is lost.
    const LIBRARY = 'Get a library card';
    const acc = await newAccount('plan-g');
    mockUserId = acc.id;
    const fault = (titles: string[]) =>
      psql(`create or replace function public.test364_mobile_fault2() returns trigger language plpgsql as $f$
              begin if new.title in (${titles.map(t => `'${t}'`).join(', ') || 'null'}) then raise exception 'injected fault'; end if; return new; end $f$;`);
    fault([PHONE, LIBRARY]);
    psql(`create trigger test364_mobile_fault2 before insert on custom_checklist_tasks
            for each row execute function public.test364_mobile_fault2();`);
    try {
      const p = await actions(acc.jwt, { action: 'plan_prepare', goal: GOAL,
        items: [...SUGGESTION.items, { kind: 'new', title: LIBRARY }] });
      const draft = p.json.plan_proposal;
      const saved = await actions(acc.jwt, {
        action: 'plan_apply', operation_id: (globalThis.crypto as Crypto).randomUUID(),
        authorization: { kind: 'approved_proposal', proposal_id: draft.plan_proposal_id, proposal_revision: draft.proposal_revision },
        items: draft.items,
      }, 'ios');
      expect(saved.json.receipt.results.map((r: { outcome: string }) => r.outcome)).toEqual(['reused', 'reused', 'failed', 'failed']);
      fault([LIBRARY]);
      // The user adds their own phone task elsewhere: Retry asks how to treat the match.
      const mine = await http('/rest/v1/custom_checklist_tasks', {
        method: 'POST', jwt: acc.jwt, headers: { prefer: 'return=representation' },
        body: JSON.stringify({ user_id: acc.id, title: PHONE, description: '', priority: 'Do soon' }),
      });
      expect(mine.status).toBeLessThan(300);

      const first = mount();
      fireEvent.changeText(composer(), 'Keep this question');
      fireEvent.press(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
      let sheet = await screen.findByTestId('companion-task-sheet');
      fireEvent.press(await enabledButton(within(sheet), 'Try adding 2 tasks again'));
      await within(sheet).findByRole('checkbox', { name: `Add ${PHONE}` }, { timeout: 10_000 });
      // The library card failed again; a relevant change opens a separate review for it.
      await http(`/rest/v1/user_onboarding_profiles?id=eq.${acc.id}`, {
        method: 'PATCH', jwt: acc.jwt, body: JSON.stringify({ city: 'Surrey' }),
      });
      fireEvent.press(await enabledButton(within(sheet), 'Try adding 1 task again'));
      await within(sheet).findByRole('checkbox', { name: `Add ${LIBRARY}` }, { timeout: 10_000 });
      fault([]);

      // A restart: new query client, no store state. Both reviews are reached from the entry.
      first.unmount();
      clients.splice(0).forEach(client => client.clear());
      clearPlanStores(null);
      mount();
      fireEvent.changeText(composer(), 'Keep this question');
      fireEvent.press(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, .*needs your review`) }, { timeout: 10_000 }));
      sheet = await screen.findByTestId('companion-task-sheet');
      await within(sheet).findByRole('checkbox', { name: `Add ${LIBRARY}` }, { timeout: 10_000 });
      expect(within(sheet).queryByRole('checkbox', { name: `Add ${PHONE}` })).not.toBeNull();
      expect(within(sheet).queryByRole('button', { name: /Try adding/ })).toBeNull();
      // Each open review is its own section, named by what it would add.
      const review = (title: string) => {
        const named = within(sheet).getAllByTestId('plan-retry-review')
          .filter(s => within(s).queryByRole('header', { name: `Review the remaining change: ${title}` }));
        expect(named).toHaveLength(1);
        return within(named[0]);
      };

      // Approving the library-card review leaves the phone review as it was.
      fireEvent.press(await enabledButton(review(LIBRARY), 'Approve and add 1 task'));
      expect(await within(sheet).findByText(`Added after your review: ${LIBRARY}.`, {}, { timeout: 10_000 })).toBeTruthy();
      expect(sqlCount(acc.id, `title = '${LIBRARY}'`)).toBe(1);
      expect(within(sheet).getByRole('checkbox', { name: `Add ${PHONE}` }).props.accessibilityState.checked).toBe(true);
      expect(within(sheet).getByText(`You may already have this task: ${PHONE}`)).toBeTruthy();

      // The phone review: the user keeps their own task instead of adding another.
      fireEvent.press(await enabledButton(within(sheet), 'Use the task I have'));
      fireEvent.press(await enabledButton(within(sheet), 'Save without adding it'));
      expect(await within(sheet).findByText(`Using the task you already have: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
      expect(sqlCount(acc.id, `title = '${PHONE}'`)).toBe(1);
      expect(sqlCount(acc.id)).toBe(2);
      expect(within(sheet).queryByRole('button', { name: /Approve and add|Save without adding/ })).toBeNull();
      expect(composer().props.value).toBe('Keep this question');
    } finally {
      psql('drop trigger if exists test364_mobile_fault2 on custom_checklist_tasks; drop function if exists public.test364_mobile_fault2();');
    }
  }, 120_000);

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

import ChecklistScreen from '@/app/(tabs)/Checklist';
jest.mock('react-native-confetti-cannon',()=>()=>null);
jest.mock('react-native-draggable-flatlist',()=>{
 const {View}=require('react-native');
 return {__esModule:true,default:({data,renderItem,ListHeaderComponent,ListFooterComponent}:any)=><View>{ListHeaderComponent}{data.map((item:any,index:number)=><View key={index}>{renderItem({item,drag:()=>{},isActive:false})}</View>)}{ListFooterComponent}</View>,ScaleDecorator:({children}:any)=>children};
});
jest.mock('@/hooks/checklist/useChecklistTasks',()=>({useChecklistTasks:()=>{
 const React=require('react');const [tasks,setTasks]=React.useState(mockChecklistRows);
 return {tasks,setTasks,refetch:async()=>{},isLoading:false};
}}));
jest.mock('@/hooks/checklist/useChecklistProfile',()=>({useChecklistProfile:()=>({persona:'skilled_worker',province:'British Columbia',isLoading:false,refresh:async()=>false})}));
jest.mock('@/components/checklist/ArrivalCountdownSection',()=>({ArrivalCountdownSection:()=>null}));
jest.mock('@/components/checklist/ChecklistItem',()=>({ChecklistItem:({task,onPress}:any)=>{
 const {TouchableOpacity,Text}=require('react-native');return <TouchableOpacity accessibilityRole='button' accessibilityLabel={`Checklist ${task.task.task_name}`} onPress={onPress}><Text>{task.task.task_name}</Text></TouchableOpacity>;
}}));
function RetainedTabs(){
 const [tab,setTab]=React.useState('companion');const [visited,setVisited]=React.useState(false);
 return <View>
  <TouchableOpacity accessibilityRole='button' accessibilityLabel='Select Checklist tab' onPress={()=>{setVisited(true);setTab('checklist');}}><Text>Checklist</Text></TouchableOpacity>
  <TouchableOpacity accessibilityRole='button' accessibilityLabel='Select Companion tab' onPress={()=>setTab('companion')}><Text>Companion</Text></TouchableOpacity>
  <View style={{display:tab==='companion'?'flex':'none'}}><CompanionScreen/></View>
  {visited&&<View style={{display:tab==='checklist'?'flex':'none'}}><ChecklistScreen/></View>}
 </View>;
}
describeStack('Independent retained mobile Checklist completion',()=>{
 beforeEach(()=>{global.fetch=realFetch;clearPlanStores(null);clearTaskActionStores(null);mockLegacyCompleted.mockClear();});
 afterEach(()=>{global.fetch=realFetch;clients.splice(0).forEach(c=>c.clear());});
 it('Checklist completion refreshes the retained Companion plan entry',async()=>{
  // Falsifier: the real Checklist screen completion callback and service save Completed,
  // but the retained Companion screen still shows its old plan count after tab return.
  const acc=await newAccount('r3-native-legacy');mockUserId=acc.id;
  const saved=await savedPlanFor(acc);const ref=saved.receipt.results[2].task_ref;
  mockChecklistRows.splice(0,mockChecklistRows.length,{user_task_id:1,user_id:acc.id,task_id:null,sanity_checklist_id:null,custom_task_id:Number(ref.slice(7)),source:'custom',completed:false,completed_at:null,dismissed_at:null,task:{task_name:PHONE,task_description:'',priority:'Do soon'}});
  mount();const entry=await screen.findByRole('button',{name:new RegExp(`Your plan, ${GOAL}, 0 of 3 done`)},{timeout:10_000});
  fireEvent.changeText(composer(),'Retain my question');
  fireEvent.press(screen.getByRole('button',{name:'Select Checklist tab'}));
  fireEvent.press(await screen.findByRole('button',{name:`Checklist ${PHONE}`}));
  fireEvent.press(await screen.findByRole('button',{name:en.checklist.markAsComplete}));
  await waitFor(()=>expect(mockLegacyCompleted).toHaveBeenCalledTimes(1),{timeout:10_000});
  const now=await actions(acc.jwt,{action:'read'});expect(now.json.tasks.find((t:any)=>t.task_ref===ref).state).toBe('completed');
  fireEvent.press(screen.getByRole('button',{name:'Select Companion tab'}));
  expect(composer().props.value).toBe('Retain my question');
  await waitFor(()=>expect(screen.queryByRole('button',{name:new RegExp(`Your plan, ${GOAL}, 1 of 3 done`)})).not.toBeNull(),{timeout:2000});
 },60_000);
});

// Composition of #364 and #366 (integration reconciliation): the same real stack and the
// actual Companion screen, plan entry, task sheet and step controls. Added with the
// integration. The step migration is applied after the plan migration when missing.
describeStack('Plan and task steps together against the real local stack (mobile)', () => {
  beforeAll(async () => {
    if (psql(`select to_regprocedure('public.companion_read_steps(uuid)') is not null;`) !== 't') {
      psql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261027183644_companion_task_steps.sql'), 'utf8'));
      psql(`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
              max_contract_version = 1, allowed_platforms = '{ios,android,web}';`);
      execFileSync('docker', ['kill', '--signal=SIGUSR1', REST_CONTAINER], { stdio: 'ignore' });
    }
    for (let i = 0; i < 50; i++) {
      const ready = await http('/rest/v1/rpc/companion_read_steps', {
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

  it('a task the approved plan added takes a step; the step never completes the task or the plan; explicit completion updates the plan and keeps the step', async () => {
    // Wrong if: the plan-added task has no step controls, checking its only step changes
    // the task state or the plan count, or completion loses the step or the plan count.
    const acc = await newAccount('plan-steps');
    mockUserId = acc.id;
    answersWithPlan();
    mount();
    await send('I arrive in Vancouver next week. Help me plan my first week.');
    const card = await screen.findByTestId('plan-card', {}, { timeout: 10_000 });
    fireEvent.press(within(card).getByRole('button', { name: `Review plan: ${GOAL}` }));
    let sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await enabledButton(within(sheet), 'Approve and add 1 task'));
    await within(sheet).findByText('Added 1 task. Reused 2 tasks you already had.', {}, { timeout: 10_000 });
    const plans = async () => (await actions(acc.jwt, { action: 'plans' })).json.plans;
    const phoneRef = (await plans())[0].items[2].task_ref as string;
    expect(phoneRef).toMatch(/^custom:/);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());

    // Open the same task from the plan and add and check one step.
    fireEvent.press(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, 0 of 3 done`) }, { timeout: 10_000 }));
    sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: `${PHONE}, Not started` }));
    sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.changeText(await within(sheet).findByLabelText('New step', {}, { timeout: 10_000 }), 'Compare phone plans');
    fireEvent.press(await enabledButton(within(sheet), 'Add step'));
    await within(sheet).findByRole('checkbox', { name: 'Compare phone plans' }, { timeout: 10_000 });
    await waitFor(() => expect(isEnabled(within(sheet).getByRole('checkbox', { name: 'Compare phone plans' }))).toBe(true), { timeout: 10_000 });
    fireEvent.press(within(sheet).getByRole('checkbox', { name: 'Compare phone plans' }));
    await within(sheet).findByText('Checked step: Compare phone plans', {}, { timeout: 10_000 });
    expect(await within(sheet).findByText('All steps are done. This task stays Not started until you mark it complete.')).toBeTruthy();
    expect(within(sheet).getByRole('radio', { name: 'Not started' }).props.accessibilityState.checked).toBe(true);
    let read = (await actions(acc.jwt, { action: 'read' })).json;
    expect(read.tasks.find((t: { task_ref: string }) => t.task_ref === phoneRef).state).toBe('not_started');
    expect(read.steps.filter((s: { task_ref: string }) => s.task_ref === phoneRef).map((s: { title: string; done: boolean }) => [s.title, s.done]))
      .toEqual([['Compare phone plans', true]]);
    expect((await plans())[0].items.map((i: { state: string }) => i.state)).toEqual(['not_started', 'not_started', 'not_started']);

    // Only the explicit completion completes the task; the plan and step history follow.
    fireEvent.press(await enabledButton(within(sheet), 'Mark task complete'));
    expect(await within(sheet).findByText('Completed with 1 of 1 steps done.', {}, { timeout: 10_000 })).toBeTruthy();
    read = (await actions(acc.jwt, { action: 'read' })).json;
    expect(read.tasks.find((t: { task_ref: string }) => t.task_ref === phoneRef).state).toBe('completed');
    expect(read.steps.filter((s: { task_ref: string }) => s.task_ref === phoneRef).map((s: { title: string; done: boolean }) => [s.title, s.done]))
      .toEqual([['Compare phone plans', true]]);
    expect((await plans())[0].items.map((i: { state: string }) => i.state)).toEqual(['not_started', 'not_started', 'completed']);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}, 1 of 3 done`) }, { timeout: 10_000 })).toBeTruthy();
  }, 90_000);
});

// ------------------------------------------------------------------ #367 task removal
// The same real stack with this repo's #367 migration applied last, in timestamp order:
// #361, #363, #364, #366, #365 (20261028001530), #367. The actual Companion screen, send
// hook, removal card, plan entry and task sheet.
describeStack('Task removal against the real local stack (mobile, #367)', () => {
  let announcementSpy: jest.SpyInstance<void, [announcement: string]>;
  beforeAll(async () => {
    const has = (sig: string) => psql(`select to_regprocedure('public.${sig}') is not null;`) === 't';
    // The earlier blocks applied #361-#366. #365 precedes #367 and is applied here when
    // missing; refuse an out-of-order stack instead of guessing.
    if (!has('companion_read_steps(uuid)') || !has('companion_plans_read(uuid)'))
      throw new Error('#366 and #364 must be applied before #367');
    const has365 = has('companion_prepare_edit(uuid,jsonb,jsonb,text)');
    const has370 = has('companion_read_details(uuid)');
    const has367 = has('companion_remove_prepare(uuid,text,jsonb)');
    if (has367 && (!has365 || !has370)) throw new Error('#365 and #370 must be applied before #367');
    if (has370 && !has365) throw new Error('#365 must be applied before #370');
    if (!has365)
      psql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261028001530_companion_task_edit.sql'), 'utf8'));
    if (!has370)
      psql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261028004902_companion_saved_details.sql'), 'utf8'));
    if (!has367) {
      psql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261028025026_companion_task_remove.sql'), 'utf8'));
      psql(`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
              max_contract_version = 1, allowed_platforms = '{ios,android,web}';`);
      execFileSync('docker', ['kill', '--signal=SIGUSR1', REST_CONTAINER], { stdio: 'ignore' });
    }
    for (let i = 0; i < 50; i++) {
      const ready = await http('/rest/v1/rpc/companion_read_tasks', {
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
    // The react-native Jest preset already mocks this function, so spyOn returns that mock
    // with the calls of earlier tests (a completion in the steps block): start from none.
    announcementSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announcementSpy.mockClear();
  });
  afterEach(() => {
    announcementSpy.mockRestore();
    global.fetch = realFetch;
    clients.splice(0).forEach(client => client.clear());
  });

  const taskNow = async (jwt: string, ref: string) =>
    (await actions(jwt, { action: 'read' })).json.tasks.find((t: { task_ref: string }) => t.task_ref === ref);
  const removalReceipts = (userId: string) =>
    Number(psql(`select count(*) from companion_action_receipts where user_id = '${userId}'
                  and outcome->'results'->0->>'type' = 'task.remove';`));
  // This file's Checklist rows stand in for the legacy read: the account has "Get your SIN".
  const sinRow = (userId: string) => ({
    user_task_id: 1, user_id: userId, task_id: null, sanity_checklist_id: 'sin-number',
    custom_task_id: null, source: 'sanity', completed: false, completed_at: null, dismissed_at: null,
    task: { task_name: 'Get your SIN', task_description: '', priority: 'Do now' },
  });
  const planItem = async (jwt: string, ref: string) =>
    (await actions(jwt, { action: 'plans' })).json.plans[0].items.find((i: { task_ref: string }) => i.task_ref === ref);

  it('composition: remember and edit a detail, remove and restore a plan task, retain the draft and exclude another account', async () => {
    // Added after the merge. Fails on lost detail dispatch, removal, receipts or ownership.
    const acc = await newAccount('compose-mobile');
    const stranger = await newAccount('compose-mobile-other');
    mockUserId = acc.id;
    await savedPlanFor(acc);
    mockChecklistRows.splice(0, mockChecklistRows.length, sinRow(acc.id));
    mount();
    await send('Remember that I prefer Friday appointments');
    const detailCard = await screen.findByTestId('detail-command-card', {}, { timeout: 10_000 });
    expect(within(detailCard).getByText(/I prefer Friday appointments/)).toBeTruthy();
    fireEvent.press(within(detailCard).getByRole('button', { name: 'View saved details' }));
    let sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await enabledButton(within(sheet), 'Edit saved detail: I prefer Friday appointments'));
    fireEvent.changeText(within(sheet).getByLabelText('Saved detail'), 'I prefer Saturday appointments');
    fireEvent.press(await enabledButton(within(sheet), 'Save change'));
    await within(sheet).findByText('Changed “I prefer Friday appointments” to “I prefer Saturday appointments”.', {}, { timeout: 10_000 });
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    await send('Remove task: Get your SIN');
    const removal = await screen.findByTestId('task-removal-card', {}, { timeout: 10_000 });
    fireEvent.changeText(composer(), 'Keep my next question');
    fireEvent.press(within(removal).getByRole('button', { name: 'Review removal of Get your SIN' }));
    sheet = await screen.findByTestId('companion-task-sheet');
    await within(sheet).findByText('Remove “Get your SIN”?', {}, { timeout: 10_000 });
    fireEvent.press(await enabledButton(within(sheet), 'Remove task'));
    await within(sheet).findByText('Removed from your Checklist: Get your SIN', {}, { timeout: 10_000 });
    expect((await planItem(acc.jwt, 'sanity:sin-number')).removed).toBe(true);
    fireEvent.press(await enabledButton(within(sheet), 'Undo: Removed from your Checklist: Get your SIN'));
    await within(sheet).findByText('Restored to your Checklist: Get your SIN', {}, { timeout: 10_000 });
    expect((await planItem(acc.jwt, 'sanity:sin-number')).removed).toBe(false);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('Keep my next question');
    const own = await actions(acc.jwt, { action: 'read' });
    expect(own.json.details.map((d: { text: string; revision: number }) => [d.text, d.revision])).toEqual([['I prefer Saturday appointments', 2]]);
    expect((await actions(stranger.jwt, { action: 'read' })).json.details).toEqual([]);
    switchAccount(stranger.id);
    await waitFor(() => expect(screen.queryByTestId('detail-command-card')).toBeNull());
    expect(mockStream).not.toHaveBeenCalled();
  }, 90_000);

  it('a removal request in a conversation only opens a review; Cancel writes nothing; the confirmed removal names the plan, reads as removed there, and its Undo restores it; the draft stays', async () => {
    // Wrong if: the command removes anything or calls the model; the review does not name
    // the plan; Cancel writes; the confirmed removal is not the legacy dismissal; the plan
    // does not read it as removed; Undo does not restore it; the typed draft is lost.
    const acc = await newAccount('remove-command');
    mockUserId = acc.id;
    await savedPlanFor(acc);
    mockChecklistRows.splice(0, mockChecklistRows.length, sinRow(acc.id));
    mount();
    await send('Remove task: Get your SIN');
    const card = await screen.findByTestId('task-removal-card', {}, { timeout: 10_000 });
    expect(within(card).getByText('Get your SIN')).toBeTruthy();
    expect(within(card).getByText('Not removed · needs your confirmation')).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
    expect((await taskNow(acc.jwt, 'sanity:sin-number'))?.removed ?? false).toBe(false);
    expect(removalReceipts(acc.id)).toBe(0);
    fireEvent.changeText(composer(), 'My next question');

    fireEvent.press(within(card).getByRole('button', { name: 'Review removal of Get your SIN' }));
    let sheet = await screen.findByTestId('companion-task-sheet');
    expect(await within(sheet).findByText('Remove “Get your SIN”?', {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByText(`Saved plans that include it: ${GOAL}. It shows there as removed.`)).toBeTruthy();
    expect(within(sheet).getByText('Current state: Not started')).toBeTruthy();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(within(sheet).queryByText('Remove “Get your SIN”?')).toBeNull();
    expect(removalReceipts(acc.id)).toBe(0);
    expect((await taskNow(acc.jwt, 'sanity:sin-number'))?.removed ?? false).toBe(false);
    expect(announcementSpy).not.toHaveBeenCalled();

    // Cancel keeps the request open: the card still offers its review, and the draft stays.
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
    const again = await screen.findByTestId('task-removal-card');
    fireEvent.press(within(again).getByRole('button', { name: 'Review removal of Get your SIN' }));
    sheet = await screen.findByTestId('companion-task-sheet');
    await within(sheet).findByText('Remove “Get your SIN”?', {}, { timeout: 10_000 });
    fireEvent.press(await enabledButton(within(sheet), 'Remove task'));
    expect(await within(sheet).findByText('Removed from your Checklist: Get your SIN', {}, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(announcementSpy.mock.calls).toEqual([
      ['Removed from your Checklist: Get your SIN'],
    ]));
    expect(within(sheet).getByText('Saved plans: 1 · Steps kept: 0 · Reminders stopped: 0')).toBeTruthy();
    expect((await taskNow(acc.jwt, 'sanity:sin-number')).removed).toBe(true);
    expect(psql(`select dismissed_at is not null from user_tasks where user_id = '${acc.id}' and sanity_checklist_id = 'sin-number';`)).toBe('t');
    expect((await planItem(acc.jwt, 'sanity:sin-number')).removed).toBe(true);
    expect(removalReceipts(acc.id)).toBe(1);

    const undo = 'Undo: Removed from your Checklist: Get your SIN';
    fireEvent.press(await enabledButton(within(sheet), undo));
    expect(await within(sheet).findByText('Restored to your Checklist: Get your SIN', {}, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(announcementSpy.mock.calls).toEqual([
      ['Removed from your Checklist: Get your SIN'],
      ['Restored to your Checklist: Get your SIN'],
    ]));
    expect((await taskNow(acc.jwt, 'sanity:sin-number')).removed).toBe(false);
    expect((await planItem(acc.jwt, 'sanity:sin-number')).removed).toBe(false);
    // Positive control: a state change in the same panel keeps the state announcement.
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: 'In progress' }).props.accessibilityState?.disabled).toBe(false), {
      timeout: 10_000,
    });
    fireEvent.press(within(sheet).getByRole('radio', { name: 'In progress' }));
    await waitFor(() => expect(announcementSpy.mock.calls).toEqual([
      ['Removed from your Checklist: Get your SIN'],
      ['Restored to your Checklist: Get your SIN'],
      ['Saved. Task state: In progress.'],
    ]), { timeout: 10_000 });
    expect((await taskNow(acc.jwt, 'sanity:sin-number')).state).toBe('in_progress');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    expect(composer().props.value).toBe('My next question');
    // The card's review was used: it names its removal, with no review control.
    const used = await screen.findByTestId('task-removal-card');
    await waitFor(() => expect(within(used).queryByRole('button', { name: 'Review removal of Get your SIN' })).toBeNull(), {
      timeout: 10_000,
    });
    expect(within(used).getByText('Removed from your Checklist')).toBeTruthy();
    expect(JSON.stringify(mockCapture.mock.calls)).not.toContain('Get your SIN');
  }, 90_000);

  it('a change on another device between review and approval opens a revised review and removes nothing; the approved removal keeps steps; an Undo another device already made changes nothing', async () => {
    // Wrong if: an approval of the old review removes the changed task; the revised review
    // is not shown; steps are deleted with the task; a stale Undo writes.
    const acc = await newAccount('remove-panel');
    mockUserId = acc.id;
    const saved = await savedPlanFor(acc);
    const phoneRef = saved.receipt.results[2].task_ref as string;
    const step = await actions(acc.jwt, {
      action: 'apply', operation_id: (globalThis.crypto as Crypto).randomUUID(), authorization: { kind: 'ui_control' },
      operations: [{ type: 'step.create', task_ref: phoneRef, titles: ['Compare phone plans'] }],
    });
    expect(step.status).toBe(200);
    mount();
    fireEvent.press(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
    let sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await within(sheet).findByRole('button', { name: `${PHONE}, Not started` }));
    sheet = await screen.findByTestId('companion-task-sheet');
    fireEvent.press(await enabledButton(within(sheet), `Remove task: ${PHONE}`));
    expect(await within(sheet).findByText(`Remove “${PHONE}”?`, {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByText('Steps kept as history: 1')).toBeTruthy();

    // Another device moves the task on while the review is open.
    const before = await taskNow(acc.jwt, phoneRef);
    const moved = await actions(acc.jwt, {
      action: 'apply', operation_id: (globalThis.crypto as Crypto).randomUUID(), authorization: { kind: 'ui_control' },
      operations: [{ type: 'task.set_state', task_ref: phoneRef, state: 'in_progress', expected_revision: before.revision }],
    });
    expect(moved.status).toBe(200);
    fireEvent.press(await enabledButton(within(sheet), 'Remove task'));
    expect(await within(sheet).findByText('This task changed after you opened this review. Check the details and confirm again.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByText('Current state: In progress')).toBeTruthy();
    expect((await taskNow(acc.jwt, phoneRef)).removed).toBe(false);
    expect(removalReceipts(acc.id)).toBe(0);

    fireEvent.press(await enabledButton(within(sheet), 'Remove task'));
    expect(await within(sheet).findByText(`Removed from your Checklist: ${PHONE}`, {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(sheet).getByText('Saved plans: 1 · Steps kept: 1 · Reminders stopped: 0')).toBeTruthy();
    const read = (await actions(acc.jwt, { action: 'read' })).json;
    expect(read.tasks.find((t: { task_ref: string }) => t.task_ref === phoneRef).removed).toBe(true);
    expect(Number(psql(`select count(*) from companion_task_steps where user_id = '${acc.id}' and task_ref = '${phoneRef}';`))).toBe(1);

    // Another device undoes the removal first; this device's Undo of the same receipt
    // then changes nothing and says so.
    const receipt = Number(psql(`select count(*) from companion_action_receipts where user_id = '${acc.id}';`));
    const removal = psql(`select operation_id from companion_action_receipts where user_id = '${acc.id}'
                           and outcome->'results'->0->>'type' = 'task.remove';`);
    const web = await actions(acc.jwt, {
      action: 'undo', operation_id: (globalThis.crypto as Crypto).randomUUID(),
      receipt_operation_id: removal, authorization: { kind: 'ui_control' },
    });
    expect(web.status).toBe(200);
    fireEvent.press(await enabledButton(within(sheet), `Undo: Removed from your Checklist: ${PHONE}`));
    expect(await within(sheet).findByText('That change was already undone.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(Number(psql(`select count(*) from companion_action_receipts where user_id = '${acc.id}';`))).toBe(receipt + 1);
    expect((await taskNow(acc.jwt, phoneRef)).removed).toBe(false);
  }, 90_000);

  it('a removal request card turns historical after another device removed the task; its review cannot remove again', async () => {
    // Wrong if: the old card or its sheet still offers a removal of the removed task, or
    // the stale review writes a second removal.
    const acc = await newAccount('remove-stale');
    mockUserId = acc.id;
    mockChecklistRows.splice(0, mockChecklistRows.length, sinRow(acc.id));
    mount();
    await send('Remove task: Get your SIN');
    const card = await screen.findByTestId('task-removal-card', {}, { timeout: 10_000 });

    // Another device removes it through its own reviewed removal.
    const p = await actions(acc.jwt, { action: 'prepare', operation: { type: 'task.remove', task_ref: 'sanity:sin-number', expected_revision: 0 } });
    const d = p.json.proposal;
    const w = await actions(acc.jwt, {
      action: 'apply', operation_id: (globalThis.crypto as Crypto).randomUUID(), operations: d.operations,
      authorization: { kind: 'approved_proposal', proposal_id: d.proposal_id, proposal_revision: d.proposal_revision, removal_confirmed: true },
    });
    expect(w.status).toBe(200);

    // Opening the old request reads current progress: the task is removed, nothing to confirm.
    // This screen has not read progress since; the stale review opens on current progress.
    fireEvent.press(within(card).getByRole('button', { name: 'Review removal of Get your SIN' }));
    const sheet = await screen.findByTestId('companion-task-sheet');
    expect(await within(sheet).findByText(en.taskActions.removed, {}, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(within(sheet).queryByText('Remove “Get your SIN”?')).toBeNull());
    expect(within(sheet).queryByRole('button', { name: 'Remove task' })).toBeNull();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('companion-task-sheet')).toBeNull());
    const old = screen.getByTestId('task-removal-card');
    await waitFor(() => expect(within(old).queryByRole('button', { name: 'Review removal of Get your SIN' })).toBeNull(), {
      timeout: 10_000,
    });
    expect(within(old).getByText(en.taskActions.removed)).toBeTruthy();
    expect(removalReceipts(acc.id)).toBe(1);
  }, 60_000);

  it("another account sees none of a removal review, card or receipt", async () => {
    // Wrong if: the second account's screen shows the first account's card or can read its review.
    const a = await newAccount('remove-owner');
    const b = await newAccount('remove-other');
    mockUserId = a.id;
    mockChecklistRows.splice(0, mockChecklistRows.length, sinRow(a.id));
    mount();
    await send('Remove task: Get your SIN');
    await screen.findByTestId('task-removal-card', {}, { timeout: 10_000 });
    switchAccount(b.id);
    await waitFor(() => expect(screen.queryByTestId('task-removal-card')).toBeNull());
    const proposal = psql(`select id from companion_proposals where user_id = '${a.id}' and kind = 'task_remove';`);
    const read = await actions(b.jwt, { action: 'proposal', proposal_id: proposal });
    expect(read.status).toBe(404);
  }, 60_000);
});
