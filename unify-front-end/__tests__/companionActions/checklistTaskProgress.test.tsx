// Mounted acceptance: the real Checklist screen, its real task sheet and the task
// progress controls (mobile-app#361), driven through user controls. The network is
// the scripted contract stand-in in testSupport/companionActionsServer.ts; the real
// endpoint and database are covered by companionActionsLocalStack.test.tsx and the
// web repo's supabase/tests/companion-actions.
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
import { AppState, Platform, StyleSheet } from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { scriptedServer } from '@/testSupport/companionActionsServer';

// The scripted fetch answers every request; nothing leaves the process.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59371';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

let mockUserId = 'user-1';
let mockCapture: jest.Mock;
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
  return { KeyboardAvoidingView: View };
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
  useCurrentUser: () => ({ refreshUser: mockRefreshUser }),
}));
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
        <ChecklistScreen />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

let server: ReturnType<typeof scriptedServer>;
const realFetch = global.fetch;
let userCounter = 0;

beforeEach(() => {
  mockUserId = `user-${++userCounter}`;
  mockCapture = jest.fn();
  server = scriptedServer();
  global.fetch = server.fetch as unknown as typeof fetch;
});
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
  clients.splice(0).forEach(client => client.clear());
});

/** Another account signs in on this device, as supabase-js reports it. */
async function switchAccount(nextUserId: string) {
  mockUserId = nextUserId;
  await act(async () => {
    for (const listener of [...mockAuthListeners]) {
      listener('SIGNED_IN', {
        user: { id: nextUserId },
        access_token: `jwt-${nextUserId}`,
      });
    }
  });
}

const companionActionUrls = () =>
  server.fetch.mock.calls.map(call => String(call[0]));

/** The app returns to the foreground: every AppState listener hears 'active'. */
function captureForeground() {
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _name: string,
    cb: (state: string) => void
  ) => {
    listeners.push(cb);
    return { remove: () => {} };
  }) as never);
  return () =>
    act(async () => {
      listeners.forEach(cb => cb('active'));
    });
}

async function openTaskProgress() {
  fireEvent.press(await screen.findByText('Get a SIN'));
  fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
  const notStarted = await screen.findByRole('radio', { name: 'Not started' });
  await waitFor(() => expect(notStarted).toBeSelected());
}

describe('Checklist task progress (mobile)', () => {
  it('saves Waiting with a reason from explicit controls, shows the exact receipt, and the row shows it', async () => {
    renderScreen();
    await openTaskProgress();

    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    expect(
      await screen.findByText('Changed from Not started to Waiting')
    ).toBeTruthy();
    expect(server.writes()).toHaveLength(1);
    const first = server.writes()[0];
    expect(first.client.platform).toBe('ios');
    expect(first.authorization).toEqual({ kind: 'ui_control' });
    expect(first.operations).toEqual([
      {
        type: 'task.set_state',
        task_ref: 'sanity:sin',
        state: 'waiting',
        expected_revision: 0,
      },
    ]);

    const reason = await screen.findByLabelText('What are you waiting for?');
    fireEvent.changeText(reason, 'A letter from Service Canada');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save waiting reason' })
      ).not.toBeDisabled()
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save waiting reason' }));
    await waitFor(() => expect(server.writes()).toHaveLength(2));
    expect(server.writes()[1].operations[0]).toEqual({
      type: 'task.set_state',
      task_ref: 'sanity:sin',
      state: 'waiting',
      expected_revision: 1,
      waiting_reason: 'A letter from Service Canada',
    });
    expect(server.writes()[1].operation_id).not.toBe(first.operation_id);
    // A reason-only save names what changed, not "Waiting to Waiting".
    expect(await screen.findByText('Updated the waiting reason')).toBeTruthy();
    expect(screen.queryByText('Changed from Waiting to Waiting')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    const row = await screen.findByTestId('checklist-row-sanity:sin');
    await waitFor(() =>
      expect(
        within(row).getByText('Waiting for: A letter from Service Canada')
      ).toBeTruthy()
    );
    expect(within(row).getByText('Waiting')).toBeTruthy();
  });

  it('Undo names its own receipt and restores the earlier state and waiting reason', async () => {
    server = scriptedServer({
      'sanity:sin': { state: 'waiting', reason: 'Bank letter', revision: 3 },
    });
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    const waiting = await screen.findByRole('radio', { name: 'Waiting' });
    await waitFor(() => expect(waiting).toBeSelected());

    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    expect(await screen.findByText('Changed from Waiting to In progress')).toBeTruthy();
    const change = server.writes()[0];

    fireEvent.press(screen.getByRole('button', { name: 'Undo this change' }));
    expect(
      await screen.findByText('Undid a change. The task is back to Waiting.')
    ).toBeTruthy();
    const undo = server.writes()[1];
    expect(undo.action).toBe('undo');
    expect(undo.receipt_operation_id).toBe(change.operation_id);
    expect(undo.authorization).toEqual({ kind: 'ui_control' });
    expect(server.row('sanity:sin')).toMatchObject({
      state: 'waiting',
      reason: 'Bank letter',
    });
    await waitFor(() =>
      expect(screen.getByLabelText('What are you waiting for?').props.value).toBe(
        'Bank letter'
      )
    );
    // A reversal is final: it offers no Undo of its own.
    expect(screen.queryByRole('button', { name: 'Undo this change' })).toBeNull();
  });

  it('Undo after a newer edit elsewhere keeps the newer state and offers a reviewed change', async () => {
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    expect(await screen.findByText('Changed from Not started to In progress')).toBeTruthy();

    server.editElsewhere('sanity:sin', 'completed');
    fireEvent.press(screen.getByRole('button', { name: 'Undo this change' }));
    expect(
      await screen.findByText('This task changed after that action')
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Undo will not replace the newer progress. Now: Completed. This change would set: Not started.'
      )
    ).toBeTruthy();
    expect(server.row('sanity:sin')?.state).toBe('completed');

    // Keep current: nothing is written.
    const before = server.writes().length;
    fireEvent.press(screen.getByRole('button', { name: 'Keep current' }));
    expect(server.writes()).toHaveLength(before);
    expect(server.row('sanity:sin')?.state).toBe('completed');

    // Asking again and approving sends the reviewed proposal, never a blind overwrite.
    fireEvent.press(await screen.findByRole('button', { name: 'Undo this change' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Apply this change' }));
    await waitFor(() => expect(server.row('sanity:sin')?.state).toBe('not_started'));
    const approved = server.writes()[server.writes().length - 1];
    expect(approved.authorization).toEqual({
      kind: 'approved_proposal',
      proposal_id: '7e1f1f6c-1111-4111-8111-000000000001',
      proposal_revision: 1,
    });
    expect(approved.operations[0]).toMatchObject({ state: 'not_started', expected_revision: 2 });
  });

  it('a lost response is looked up before any retry and shows the recorded receipt', async () => {
    let dropNextApply = true;
    server = scriptedServer(
      {},
      {
        override: body => {
          if (body.action === 'apply' && dropNextApply) {
            dropNextApply = false;
            // The write commits, then the connection drops before the reply.
            server.handle(body);
            return 'network-error';
          }
          return undefined;
        },
      }
    );
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    expect(await screen.findByText('Changed from Not started to In progress')).toBeTruthy();
    const actions = server.sent.map(b => b.action).filter(a => a !== 'read');
    expect(actions).toEqual(['apply', 'status']);
    expect(server.sent.find(b => b.action === 'status')?.operation_id).toBe(
      server.writes()[0].operation_id
    );
  });

  it('pending and failed lookups stay unresolved and never write; not applied retries the same operation', async () => {
    let statusReply: 'pending' | 'fail' | 'not_applied' = 'pending';
    server = scriptedServer(
      {},
      {
        override: body => {
          if (body.action === 'apply' && server.writes().length === 1) return 'network-error';
          if (body.action === 'status') {
            if (statusReply === 'fail') return 'network-error';
            return { status: 200, body: { status: statusReply, operation_id: body.operation_id } };
          }
          return undefined;
        },
      }
    );
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'Completed' }));

    expect(
      await screen.findByText('The change is still being saved. Check again in a moment.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // Controls stay locked: another tap cannot start a second write.
    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    expect(server.writes()).toHaveLength(1);

    statusReply = 'fail';
    fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
    expect(
      await screen.findByText('We could not check the result. The change may or may not have saved.')
    ).toBeTruthy();
    expect(server.writes()).toHaveLength(1);

    statusReply = 'not_applied';
    fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Changed from Not started to Completed')).toBeTruthy();
    const [first, retry] = server.writes();
    expect(retry.operation_id).toBe(first.operation_id);
    expect(retry.operations).toEqual(first.operations);
    expect(retry.authorization).toEqual(first.authorization);
  });

  it('offline: controls are off and nothing is sent; reconnecting reads current progress first', async () => {
    let offline = true;
    server = scriptedServer(
      { 'sanity:sin': { state: 'in_progress', revision: 4 } },
      { override: () => (offline ? 'network-error' : undefined) }
    );
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    expect(
      await screen.findByText(
        'You are offline. The progress shown may be out of date, and changes are turned off.'
      )
    ).toBeTruthy();
    const waiting = screen.getByRole('radio', { name: 'Waiting' });
    expect(waiting).toBeDisabled();
    fireEvent.press(waiting);
    expect(server.writes()).toHaveLength(0);

    // Back online: the next read returns the saved state before any write is possible.
    offline = false;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5_200));
    });
    const inProgress = await screen.findByRole('radio', { name: 'In progress' });
    await waitFor(() => expect(inProgress).toBeSelected());
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Waiting' })).not.toBeDisabled());
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0].operations[0].expected_revision).toBe(4);
  }, 15_000);

  it('an account change drops the previous account\'s drafts and receipts', async () => {
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    expect(await screen.findByText('Changed from Not started to Waiting')).toBeTruthy();
    fireEvent.changeText(
      await screen.findByLabelText('What are you waiting for?'),
      'Private note of account one'
    );

    await switchAccount('someone-else');
    await waitFor(() =>
      expect(screen.queryByText('Changed from Not started to Waiting')).toBeNull()
    );
    expect(screen.queryByDisplayValue('Private note of account one')).toBeNull();
    // The next read carries the new account's token.
    await waitFor(() =>
      expect(
        server.fetch.mock.calls.some(
          call => (call[1] as any).headers.authorization === 'Bearer jwt-someone-else'
        )
      ).toBe(true)
    );
  });

  it('task controls call only the actions service and report allowlisted results without private text', async () => {
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    fireEvent.changeText(
      await screen.findByLabelText('What are you waiting for?'),
      'Passport renewal from IRCC'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save waiting reason' }));
    await waitFor(() => expect(server.writes()).toHaveLength(2));

    // No model or AI-allowance request is made by task controls.
    expect(companionActionUrls().every(url => url.endsWith('/functions/v1/companion-actions'))).toBe(true);

    const events = mockCapture.mock.calls.filter(([name]) => name === 'companion_action_result');
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const [, props] of events) {
      expect(Object.keys(props).sort()).toEqual(
        ['action', 'entry_surface', 'operation_type', 'outcome', 'to_state'].sort()
      );
      expect(JSON.stringify(props)).not.toMatch(/Passport|IRCC|SIN|sanity:|jwt/);
    }
    expect(events[0][1]).toEqual({
      operation_type: 'task.set_state',
      action: 'set_state',
      outcome: 'applied',
      entry_surface: 'checklist',
      to_state: 'waiting',
    });
  });

  it('a shown receipt becomes historical after a newer change elsewhere, and its Undo stays tied to it', async () => {
    const foreground = captureForeground();
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    expect(await screen.findByText('Changed from Not started to In progress')).toBeTruthy();
    const mine = server.writes()[0];

    // The web app saves a newer change with its own receipt.
    server.handle({
      action: 'apply',
      operation_id: 'web-operation-1',
      authorization: { kind: 'ui_control' },
      operations: [
        { type: 'task.set_state', task_ref: 'sanity:sin', state: 'completed', expected_revision: 1 },
      ],
    });
    await foreground();
    const completed = await screen.findByRole('radio', { name: 'Completed' });
    await waitFor(() => expect(completed).toBeSelected());
    expect(
      await screen.findByText(/This task changed after this/)
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Undo this change' }));
    expect(await screen.findByText('This task changed after that action')).toBeTruthy();
    const undo = server.writes().find(b => b.action === 'undo');
    expect(undo?.receipt_operation_id).toBe(mine.operation_id);
    expect(server.row('sanity:sin')?.state).toBe('completed');
  });

  it('sign-out clears unsaved drafts and results; signing in again does not bring them back', async () => {
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    expect(await screen.findByText('Changed from Not started to Waiting')).toBeTruthy();
    fireEvent.changeText(
      await screen.findByLabelText('What are you waiting for?'),
      'Unsaved private note'
    );
    const me = mockUserId;

    await act(async () => {
      for (const listener of [...mockAuthListeners]) listener('SIGNED_OUT', null);
    });
    // Signing out closes the open task sheet (the Checklist is keyed by
    // account). Sign in again and reopen the same task.
    expect(screen.queryByLabelText('What are you waiting for?')).toBeNull();
    await switchAccount(me);
    await waitFor(() => expect(screen.getAllByText('Get a SIN')).toHaveLength(1));
    fireEvent.press(screen.getByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    const reason = await screen.findByLabelText('What are you waiting for?');
    await waitFor(() => expect(reason.props.value).toBe(''));
    expect(screen.queryByText('Saved.')).toBeNull();
  });
});

// Corrections from the #361 Spec review (F2, F8). Each test names the failing
// condition it was written against.
describe('review corrections (mobile)', () => {
  const OFFLINE =
    'You are offline. The progress shown may be out of date, and changes are turned off.';
  const minHeightOf = (name: string) =>
    StyleSheet.flatten(screen.getByRole('button', { name }).props.style)
      .minHeight as number;

  it('F2: after a failed current-state read, Try again sends nothing', async () => {
    const foreground = captureForeground();
    let offline = false;
    server = scriptedServer(
      {},
      {
        override: body => {
          if (body.action === 'apply') return 'network-error';
          if (body.action === 'read' && offline) return 'network-error';
          return undefined;
        },
      }
    );
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    await screen.findByRole('button', { name: 'Try again' });
    offline = true;
    await foreground();
    await screen.findByText(OFFLINE);
    const writes = server.writes().length;
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {});
    expect(server.writes()).toHaveLength(writes);
  });

  it('F2: after a failed current-state read, Apply this change sends nothing', async () => {
    const foreground = captureForeground();
    let offline = false;
    server = scriptedServer(
      {},
      {
        override: body =>
          body.action === 'read' && offline ? 'network-error' : undefined,
      }
    );
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'In progress' }));
    await screen.findByText('Changed from Not started to In progress');
    server.editElsewhere('sanity:sin', 'completed');
    fireEvent.press(screen.getByRole('button', { name: 'Undo this change' }));
    await screen.findByRole('button', { name: 'Apply this change' });
    offline = true;
    await foreground();
    await screen.findByText(OFFLINE);
    const writes = server.writes().length;
    expect(screen.getByRole('button', { name: 'Apply this change' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Apply this change' }));
    await act(async () => {});
    expect(server.writes()).toHaveLength(writes);
    expect(server.row('sanity:sin')?.state).toBe('completed');
  });

  it('F8: on Android, save, Undo and recovery controls are at least 48dp; iOS keeps 44pt', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    let lose = false;
    server = scriptedServer(
      {},
      {
        override: body => {
          if (body.action === 'apply' && lose) return 'network-error';
          if (body.action === 'status' && lose)
            return { status: 200, body: { status: 'not_applied' } };
          return undefined;
        },
      }
    );
    global.fetch = server.fetch as unknown as typeof fetch;
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    await screen.findByLabelText('What are you waiting for?');
    await screen.findByRole('button', { name: 'Undo this change' });
    expect(minHeightOf('Save waiting reason')).toBeGreaterThanOrEqual(48);
    expect(minHeightOf('Undo this change')).toBeGreaterThanOrEqual(48);

    server.editElsewhere('sanity:sin', 'completed');
    fireEvent.press(screen.getByRole('button', { name: 'Undo this change' }));
    await screen.findByRole('button', { name: 'Apply this change' });
    expect(minHeightOf('Apply this change')).toBeGreaterThanOrEqual(48);
    expect(minHeightOf('Keep current')).toBeGreaterThanOrEqual(48);

    fireEvent.press(screen.getByRole('button', { name: 'Keep current' }));
    lose = true;
    const inProgress = screen.getByRole('radio', { name: 'In progress' });
    await waitFor(() => expect(inProgress).toBeEnabled());
    fireEvent.press(inProgress);
    await screen.findByRole('button', { name: 'Try again' });
    expect(minHeightOf('Try again')).toBeGreaterThanOrEqual(48);
  });

  it('F8: on Android, the Checklist progress header controls are at least 48dp', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    renderScreen();
    await openTaskProgress();
    for (const name of [en.taskActions.backToDetails, 'Close']) {
      const style = StyleSheet.flatten(
        screen.getByRole('button', { name }).props.style
      );
      expect(style.width).toBeGreaterThanOrEqual(48);
      expect(style.height).toBeGreaterThanOrEqual(48);
    }
  });

  it('F8: iOS keeps its 44pt minimum', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    renderScreen();
    await openTaskProgress();
    fireEvent.press(screen.getByRole('radio', { name: 'Waiting' }));
    await screen.findByRole('button', { name: 'Undo this change' });
    expect(minHeightOf('Save waiting reason')).toBeGreaterThanOrEqual(44);
    expect(minHeightOf('Undo this change')).toBeGreaterThanOrEqual(44);
  });
});

// Corrections from the #361 Spec review round 2 (F1, F4, F6 on mobile).
describe('review r2 corrections (mobile)', () => {
  const customTasks = () =>
    require('@/services/checklist/customChecklistTasks')
      .getCustomChecklistTasks as jest.Mock;
  afterEach(() => customTasks().mockReset().mockResolvedValue([]));

  it("F1: after another account signs in, Checklist no longer shows A's private task", async () => {
    const a = mockUserId;
    customTasks().mockImplementation(async (userId: string) =>
      userId === a
        ? [
            {
              id: 4321,
              user_id: a,
              priority: 'Do now',
              title: 'Private clinic visit of A',
              description: 'Private note of A',
              completed: false,
              completed_at: null,
              created_at: '2026-10-25T00:00:00Z',
            },
          ]
        : []
    );
    renderScreen();
    // A has the private task open in the detail sheet when B signs in.
    fireEvent.press(await screen.findByText('Private clinic visit of A'));
    await screen.findByText('Private note of A');
    await switchAccount('checklist-account-b');
    await waitFor(() =>
      expect(
        server.sent.filter(b => b.action === 'read').length
      ).toBeGreaterThan(1)
    );
    await screen.findByText('Get a SIN');
    expect(screen.queryByText('Private clinic visit of A')).toBeNull();
    expect(screen.queryByText('Private note of A')).toBeNull();
  });

  it('F4: a save reply that arrives after newer typing keeps the newer waiting draft', async () => {
    server = scriptedServer({ 'sanity:sin': { state: 'waiting', reason: 'Old reason' } });
    const base = server.fetch as unknown as typeof fetch;
    let release: () => void = () => {};
    let held = false;
    global.fetch = (async (...args: Parameters<typeof fetch>) => {
      const body = JSON.parse(String(args[1]?.body));
      const reply = await base(...args);
      if (body.action === 'apply') {
        held = true;
        await new Promise<void>(resolve => (release = resolve));
      }
      return reply;
    }) as typeof fetch;
    renderScreen();
    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    const reason = await screen.findByLabelText('What are you waiting for?');
    await waitFor(() => expect(reason.props.value).toBe('Old reason'));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'In progress' })).toBeEnabled()
    );
    fireEvent.changeText(reason, 'First saved reason');
    fireEvent.press(screen.getByRole('button', { name: 'Save waiting reason' }));
    await waitFor(() => expect(held).toBe(true));
    fireEvent.changeText(
      screen.getByLabelText('What are you waiting for?'),
      'New unsaved reason typed during save'
    );
    await act(async () => release());
    await screen.findByText('Updated the waiting reason');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'In progress' })).toBeEnabled()
    );
    expect(server.row('sanity:sin')?.reason).toBe('First saved reason');
    expect(screen.getByLabelText('What are you waiting for?').props.value).toBe(
      'New unsaved reason typed during save'
    );
  });

  it('F6: reopening Track progress reads current progress before any control is enabled', async () => {
    renderScreen();
    await openTaskProgress();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Waiting' })).toBeEnabled()
    );
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    server.editElsewhere('sanity:sin', 'completed');
    const reads = server.sent.filter(b => b.action === 'read').length;

    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    // Until the new read arrives, nothing can be changed.
    expect(screen.getByRole('radio', { name: 'Waiting' })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Completed' })).toBeSelected()
    );
    expect(server.sent.filter(b => b.action === 'read').length).toBeGreaterThan(
      reads
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Waiting' })).toBeEnabled()
    );
  });
});
