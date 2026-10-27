// Mounted acceptance for task steps (mobile-app#366): the real Checklist screen, its
// real task sheet and the steps controls, driven through user controls. The network is
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
import { createTestQueryClient } from '@/testSupport/queryClient';
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
  const client = createTestQueryClient({
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
/** Per test: answers a request differently (a dropped reply, a pending lookup). */
let mockOverride: ((body: Record<string, any>) => any) | null = null;
const realFetch = global.fetch;
let userCounter = 0;

beforeEach(() => {
  mockUserId = `user-${++userCounter}`;
  mockCapture = jest.fn();
  mockOverride = null;
  server = scriptedServer({}, { override: body => mockOverride?.(body) });
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
  // Opening is an editing entry: controls turn on once its read has finished.
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Waiting' })).toBeEnabled()
  );
}


async function openSteps() {
  fireEvent.press(await screen.findByText('Get a SIN'));
  fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Waiting' })).toBeEnabled());
  return screen.getByLabelText('New step');
}

async function addStep(title: string) {
  fireEvent.changeText(screen.getByLabelText('New step'), title);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add step' })).toBeEnabled());
  fireEvent.press(screen.getByRole('button', { name: 'Add step' }));
}

const stepWrites = () =>
  server.writes().filter(w => w.action === 'apply' && String(w.operations[0].type).startsWith('step.'));

describe('Task steps (mobile, stand-in network)', () => {
  it('a step reply lost after commit is looked up, never resent; the step and its receipt appear once', async () => {
    // Wrong if: a second apply is sent, or the step shows twice or not at all.
    mockOverride = body => {
      if (body.action === 'apply' && body.operations[0].type === 'step.create' && !server.steps().length) {
        server.handle(body); // committed on the server; the reply is lost
        return 'network-error';
      }
      return undefined;
    };
    renderScreen();
    await openSteps();
    await addStep('Find your PR confirmation');
    expect(await screen.findByText('Added step: Find your PR confirmation')).toBeTruthy();
    expect(await screen.findAllByRole('checkbox', { name: 'Find your PR confirmation' })).toHaveLength(1);
    expect(stepWrites()).toHaveLength(1);
    expect(server.sent.filter(b => b.action === 'status')).toHaveLength(1);
    expect(screen.getByLabelText('New step').props.value).toBe('');
  });

  it('pending and failed lookups stay unresolved and send nothing; confirmed not applied retries the same operation', async () => {
    // Wrong if: pending or a failed lookup looks saved, enables a write, or the retry uses a new id.
    let lookup: 'pending' | 'fail' | 'not_applied' = 'pending';
    mockOverride = body => {
      if (body.action === 'apply' && body.operations[0].type === 'step.set_done' && lookup !== 'not_applied')
        return 'network-error';
      if (body.action === 'status' && lookup === 'pending') return { status: 200, body: { status: 'pending' } };
      if (body.action === 'status' && lookup === 'fail') return { status: 500, body: { error: 'internal' } };
      return undefined;
    };
    renderScreen();
    await openSteps();
    await addStep('Book an appointment');
    const box = await screen.findByRole('checkbox', { name: 'Book an appointment' });
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.press(box);
    expect(await screen.findByText('The change is still being saved. Check again in a moment.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Book an appointment' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Book an appointment' })).not.toBeChecked();
    lookup = 'fail';
    fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('We could not check the result. The change may or may not have saved.')).toBeTruthy();
    const setDone = stepWrites().filter(w => w.operations[0].type === 'step.set_done');
    expect(setDone).toHaveLength(1);
    lookup = 'not_applied';
    fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Book an appointment' })).toBeChecked());
    const retries = stepWrites().filter(w => w.operations[0].type === 'step.set_done');
    expect(retries).toHaveLength(2);
    expect(retries[1].operation_id).toBe(retries[0].operation_id);
    expect(retries[1].operations).toEqual(retries[0].operations);
  });

  it('the same step control stays mounted through its save and the re-read; a typed step survives close and reopen', async () => {
    // Wrong if: the checkbox element is replaced (focus would be lost), or the typed text is gone.
    renderScreen();
    await openSteps();
    await addStep('Review the official requirements');
    const box = await screen.findByRole('checkbox', { name: 'Review the official requirements' });
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.press(box);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Review the official requirements' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Review the official requirements' })).toBe(box);
    expect(await screen.findByText('Checked step: Review the official requirements')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('New step'), 'Prepare the required doc');
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('New step')).toBeNull());
    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    expect((await screen.findByLabelText('New step')).props.value).toBe('Prepare the required doc');
  });

  it('offline: a failed read turns step controls off, sends nothing and keeps the typed step', async () => {
    // Wrong if: a write is sent or queued while the read failed, or the typed text is lost.
    let offline = false;
    mockOverride = body => (offline && body.action === 'read' ? 'network-error' : undefined);
    renderScreen();
    await openSteps();
    await addStep('Bring two IDs');
    await screen.findByRole('checkbox', { name: 'Bring two IDs' });
    offline = true;
    fireEvent.changeText(screen.getByLabelText('New step'), 'Ask about fees');
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    fireEvent.press(await screen.findByText('Get a SIN'));
    fireEvent.press(await screen.findByRole('button', { name: 'Track progress' }));
    expect(await screen.findByText(/You are offline/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Bring two IDs' })).toBeDisabled();
    expect(screen.getByLabelText('New step').props.value).toBe('Ask about fees');
    const before = server.writes().length;
    fireEvent.press(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Bring two IDs' }));
    expect(server.writes()).toHaveLength(before);
  });

  it('a removal asks first and Keep sends nothing; removal and Undo keep their own receipts', async () => {
    // Wrong if: a removal write is sent before confirmation, or the Undo removes something else.
    renderScreen();
    await openSteps();
    await addStep('Choose a bank');
    await screen.findByRole('checkbox', { name: 'Choose a bank' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove step: Choose a bank' })).toBeEnabled());
    fireEvent.press(screen.getByRole('button', { name: 'Remove step: Choose a bank' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Keep step' }));
    expect(stepWrites().filter(w => w.operations[0].type === 'step.remove')).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', { name: 'Remove step: Choose a bank' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Remove step' }));
    expect(await screen.findByText('Removed step: Choose a bank')).toBeTruthy();
    const removal = stepWrites().find(w => w.operations[0].type === 'step.remove')!;
    expect(removal.authorization).toEqual({ kind: 'ui_control', removal_confirmed: true });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Choose a bank' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo “Removed step: Choose a bank”' })).toBeEnabled());
    fireEvent.press(screen.getByRole('button', { name: 'Undo “Removed step: Choose a bank”' }));
    expect(await screen.findByRole('checkbox', { name: 'Choose a bank' })).toBeTruthy();
    const undo = server.sent.filter(b => b.action === 'undo');
    expect(undo).toHaveLength(1);
    expect(undo[0].receipt_operation_id).toBe(removal.operation_id);
  });

  it("an account change drops the previous account's steps and typed step before the next account renders", async () => {
    // Wrong if: account B sees A's step, or A's typed step text.
    renderScreen();
    await openSteps();
    await addStep('A private step');
    await screen.findByRole('checkbox', { name: 'A private step' });
    fireEvent.changeText(screen.getByLabelText('New step'), 'A private draft');
    await switchAccount('user-other');
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'A private step' })).toBeNull());
    expect(screen.queryByDisplayValue('A private draft')).toBeNull();
  });

  it('step results reach analytics as allowlisted categories only, never the step text', async () => {
    // Wrong if: any captured property holds the step title or an id.
    renderScreen();
    await openSteps();
    await addStep('Secret step title');
    await screen.findByRole('checkbox', { name: 'Secret step title' });
    await waitFor(() => expect(mockCapture).toHaveBeenCalled());
    const events = mockCapture.mock.calls.filter(c => c[0] === 'companion_action_result');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0][1]).toEqual({
      operation_type: 'step.create',
      action: 'step_change',
      outcome: 'applied',
      entry_surface: 'checklist',
    });
    expect(JSON.stringify(mockCapture.mock.calls)).not.toMatch(/Secret step title|0000-4000-8000/);
  });

  it('on Android the step controls are at least 48dp; iOS keeps 44pt', async () => {
    // Wrong if: a step control or either text field is smaller than the platform minimum.
    const os = Platform.OS;
    try {
      for (const [platform, min] of [['android', 48], ['ios', 44]] as const) {
        (Platform as { OS: string }).OS = platform;
        const view = renderScreen();
        await openSteps();
        await addStep(`Step on ${platform}`);
        await screen.findByRole('checkbox', { name: `Step on ${platform}` });
        const newStepField = screen.getByLabelText('New step');
        for (const control of [
          newStepField,
          screen.getByRole('checkbox', { name: `Step on ${platform}` }),
          screen.getByRole('button', { name: `Edit step: Step on ${platform}` }),
          screen.getByRole('button', { name: `Remove step: Step on ${platform}` }),
          screen.getByRole('button', { name: 'Add step' }),
        ]) {
          const style = StyleSheet.flatten(
            typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style
          );
          expect(Math.max(style.minHeight ?? 0, style.height ?? 0)).toBeGreaterThanOrEqual(min);
        }
        fireEvent.press(screen.getByRole('button', { name: `Edit step: Step on ${platform}` }));
        const editStyle = StyleSheet.flatten(screen.getByLabelText('Step text').props.style);
        expect(Math.max(editStyle.minHeight ?? 0, editStyle.height ?? 0)).toBeGreaterThanOrEqual(min);
        fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
        view.unmount();
      }
    } finally {
      (Platform as { OS: string }).OS = os;
    }
  });
  it.each(['rename', 'add'] as const)('%s: a changed draft needs a new authorized intent after not_applied', async kind => {
    const type = kind === 'rename' ? 'step.update' : 'step.create';
    let drop = true;
    mockOverride = body => body.action === 'apply' && body.operations?.[0]?.type === type && drop ? 'network-error' : undefined;
    renderScreen();
    await openSteps();
    if (kind === 'rename') {
      await addStep('Original title');
      const edit = await screen.findByRole('button', { name: 'Edit step: Original title' });
      await waitFor(() => expect(edit).toBeEnabled());
      fireEvent.press(edit);
    }
    const field = screen.getByLabelText(kind === 'rename' ? 'Step text' : 'New step');
    const save = () => screen.getByRole('button', { name: kind === 'rename' ? 'Save step' : 'Add step' });
    fireEvent.changeText(field, 'First authorized title');
    fireEvent.press(save());
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = stepWrites().filter(w => w.operations[0].type === type);
    expect(before).toHaveLength(1);
    fireEvent.changeText(field, 'New visible draft');
    expect(retry).toBeDisabled();
    fireEvent.press(retry);
    expect(stepWrites().filter(w => w.operations[0].type === type)).toHaveLength(1);
    drop = false;
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.press(save());
    expect(await screen.findByRole('checkbox', { name: 'New visible draft' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'First authorized title' })).toBeNull();
    const writes = stepWrites().filter(w => w.operations[0].type === type);
    expect(writes).toHaveLength(2);
    expect(writes[1].operation_id).not.toBe(writes[0].operation_id);
  });

  it.each(['rename', 'add'] as const)('%s: an unchanged or restored draft retries the exact original operation', async kind => {
    const type = kind === 'rename' ? 'step.update' : 'step.create';
    let drop = true;
    mockOverride = body => body.action === 'apply' && body.operations?.[0]?.type === type && drop ? 'network-error' : undefined;
    renderScreen();
    await openSteps();
    if (kind === 'rename') {
      await addStep('Original title');
      const edit = await screen.findByRole('button', { name: 'Edit step: Original title' });
      await waitFor(() => expect(edit).toBeEnabled());
      fireEvent.press(edit);
    }
    const field = screen.getByLabelText(kind === 'rename' ? 'Step text' : 'New step');
    fireEvent.changeText(field, 'First authorized title');
    fireEvent.press(screen.getByRole('button', { name: kind === 'rename' ? 'Save step' : 'Add step' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.changeText(field, 'Unsaved alternate');
    fireEvent.changeText(field, 'First authorized title');
    expect(retry).toBeEnabled();
    drop = false;
    fireEvent.press(retry);
    expect(await screen.findByRole('checkbox', { name: 'First authorized title' })).toBeTruthy();
    const writes = stepWrites().filter(w => w.operations[0].type === type);
    expect(writes).toHaveLength(2);
    expect(writes[1].operation_id).toBe(writes[0].operation_id);
    expect(writes[1].operations).toEqual(writes[0].operations);
  });

  it.each(['rename', 'add'] as const)('%s: editing cannot replace an unknown write before confirmed non-application', async kind => {
    const type = kind === 'rename' ? 'step.update' : 'step.create';
    let pending = true;
    mockOverride = body => {
      if (body.action === 'apply' && body.operations?.[0]?.type === type) return 'network-error';
      if (body.action === 'status' && pending) return { status: 200, body: { status: 'pending' } };
      return undefined;
    };
    renderScreen();
    await openSteps();
    if (kind === 'rename') {
      await addStep('Original title');
      const edit = await screen.findByRole('button', { name: 'Edit step: Original title' });
      await waitFor(() => expect(edit).toBeEnabled());
      fireEvent.press(edit);
    }
    const field = screen.getByLabelText(kind === 'rename' ? 'Step text' : 'New step');
    const save = () => screen.getByRole('button', { name: kind === 'rename' ? 'Save step' : 'Add step' });
    fireEvent.changeText(field, 'First authorized title');
    fireEvent.press(save());
    const lookup = await screen.findByRole('button', { name: 'Check again' });
    fireEvent.changeText(field, 'New visible draft');
    expect(save()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.press(save());
    expect(stepWrites().filter(w => w.operations[0].type === type)).toHaveLength(1);
    pending = false;
    fireEvent.press(lookup);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDisabled();
    expect(save()).toBeEnabled();
    expect(field.props.value).toBe('New visible draft');
  });

});

it.each(['approve', 'keep'] as const)(
  'a conflicting rename Undo shows its exact proposed text before %s',
  async choice => {
    // Wrong if approval can restore an undisclosed title, or Keep sends a write.
    expect(server.handle({
      action: 'apply', operation_id: 'existing-step',
      authorization: { kind: 'ui_control' },
      operations: [{ type: 'step.create', task_ref: 'sanity:sin', titles: ['Gather the original papers'] }],
    }).status).toBe(200);
    renderScreen();
    await openSteps();
    const edit = await screen.findByRole('button', { name: 'Edit step: Gather the original papers' });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.press(edit);
    fireEvent.changeText(screen.getByLabelText('Step text'), 'Call the service centre');
    fireEvent.press(screen.getByRole('button', { name: 'Save step' }));
    const undo = await screen.findByRole('button', { name: 'Undo “Renamed step “Gather the original papers” to “Call the service centre””' });
    await waitFor(() => expect(undo).toBeEnabled());
    const step = server.steps()[0];
    expect(server.handle({
      action: 'apply', operation_id: 'remote-rename',
      authorization: { kind: 'ui_control' },
      operations: [{ type: 'step.update', step_id: step.step_id, title: 'Keep the newer instructions', expected_revision: step.revision }],
    }).status).toBe(200);
    fireEvent.press(undo);
    const approve = await screen.findByRole('button', { name: 'Apply this change' });
    await waitFor(() => expect(approve).toBeEnabled());
    expect(screen.getByRole('checkbox', { name: 'Keep the newer instructions' })).toBeTruthy();
    expect(screen.getByText('Proposed step text: Gather the original papers')).toBeTruthy();
    const writesBefore = stepWrites().length;
    if (choice === 'keep') {
      fireEvent.press(screen.getByRole('button', { name: 'Keep current' }));
      expect(stepWrites()).toHaveLength(writesBefore);
      expect(server.steps()[0].title).toBe('Keep the newer instructions');
    } else {
      fireEvent.press(approve);
      await screen.findByRole('checkbox', { name: 'Gather the original papers' });
      expect(stepWrites()).toHaveLength(writesBefore + 1);
      expect(stepWrites().at(-1)?.operations[0].title).toBe('Gather the original papers');
    }
  }
);
