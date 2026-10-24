import React from 'react';

const h = React.createElement;
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';

const mockStore = new Map<string, string>();
// When set, marker reads wait for it. Models a slow device storage read.
let mockStorageGate: Promise<void> | null = null;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    // Plain functions: restoreAllMocks would wipe jest.fn implementations.
    getItem: async (key: string) => {
      if (mockStorageGate) await mockStorageGate;
      return mockStore.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));

const mockCapture = jest.fn();
jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

let mockToday = new Date(2026, 9, 23, 12, 0, 0);
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));

const mockUpdateArrivalDate = jest.fn();
jest.mock('@/services/onboarding/updateArrivalDate', () => ({
  updateArrivalDate: (...args: unknown[]) => mockUpdateArrivalDate(...args),
}));

jest.mock('@/components/common/BottomSheet', () => {
  const { Pressable, View } = require('react-native');
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({
      visible,
      onClose,
      children,
    }: {
      visible: boolean;
      onClose: () => void;
      children: React.ReactNode;
    }) =>
      visible
        ? createElement(
            View,
            { testID: 'sheet' },
            createElement(Pressable, {
              testID: 'sheet-backdrop',
              onPress: onClose,
            }),
            children
          )
        : null,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

import { ArrivalCountdownSection } from '@/components/checklist/ArrivalCountdownSection';

type Props = React.ComponentProps<typeof ArrivalCountdownSection>;

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  h(QueryClientProvider, { client }, children);
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper });

const FAKE_TIMERS_KEEP_REAL = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
] as const;

// The real clock is frozen with the card's day, so the save event counts days
// from the same day on any date and in any zone.
const setToday = (date: Date) => {
  mockToday = date;
  jest.setSystemTime(date);
};

// The shown-once guard keeps in-memory state for the whole file, so each test
// signs in as a new user.
let userCounter = 0;
let currentUser = 'user-0';

const baseProps = (): Props => ({
  userId: currentUser,
  arrivalDate: '2026-12-02',
  today: mockToday,
  refreshStage: jest.fn().mockResolvedValue(undefined),
  refreshUser: jest.fn(),
  refetchChecklist: jest.fn().mockResolvedValue(undefined),
  applyConfirmedArrival: jest.fn(),
});

const shownCalls = () =>
  mockCapture.mock.calls.filter(([name]) => name === 'arrival_countdown_shown');

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
    react: { useSuspense: false },
  });
});

beforeEach(() => {
  currentUser = `user-${++userCounter}`;
  mockStore.clear();
  mockStorageGate = null;
  mockFocused = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.useFakeTimers({
    now: new Date(2026, 9, 23, 12, 0, 0),
    doNotFake: [...FAKE_TIMERS_KEEP_REAL],
  });
  mockToday = new Date(2026, 9, 23, 12, 0, 0);
  jest.clearAllMocks();
  mockUpdateArrivalDate.mockResolvedValue({
    id: currentUser,
    arrival_date: '2026-12-15',
    stage: 0,
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('card visibility', () => {
  it('shows the day count for a future date', async () => {
    render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(screen.getByText('40 days until you land')).toBeTruthy();
  });

  it('shows the first 30 days from arrival day to day 30', async () => {
    const { rerender } = render(
      h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: '2026-10-23' })
    );
    expect(screen.getByText('Your first 30 days')).toBeTruthy();
    rerender(
      h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: '2026-09-24' })
    );
    expect(screen.getByText('Your first 30 days')).toBeTruthy();
    rerender(
      h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: '2026-09-23' })
    );
    expect(screen.queryByText('Your first 30 days')).toBeNull();
  });

  it('shows nothing, and no entry point, without an arrival date', async () => {
    render(h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: null }));
    await flush();
    expect(screen.queryByRole('button')).toBeNull();
    expect(shownCalls()).toHaveLength(0);
  });

  it('shows nothing for an unparseable date', async () => {
    render(
      h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: 'not-a-date' })
    );
    await flush();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('rolls over when the day changes', async () => {
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    expect(screen.getByText('40 days until you land')).toBeTruthy();
    setToday(new Date(2026, 9, 24, 0, 5, 0));
    rerender(h(ArrivalCountdownSection, baseProps()));
    expect(screen.getByText('39 days until you land')).toBeTruthy();
  });
});

describe('arrival_countdown_shown', () => {
  it('fires once with state and days', async () => {
    render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(shownCalls()).toEqual([
      [
        'arrival_countdown_shown',
        { state: 'pre_arrival', days_until_arrival: 40 },
      ],
    ]);
  });

  it('sends no days for the first-30-days card', async () => {
    render(
      h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: '2026-10-20' })
    );
    await flush();
    expect(shownCalls()).toEqual([
      ['arrival_countdown_shown', { state: 'first_30_days' }],
    ]);
  });

  it('does not fire again on remount the same day', async () => {
    const first = render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    first.unmount();
    render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(shownCalls()).toHaveLength(1);
  });

  it('fires once when several cards mount at the same moment', async () => {
    render(
      h(
        React.Fragment,
        null,
        h(ArrivalCountdownSection, baseProps()),
        h(ArrivalCountdownSection, baseProps()),
        h(ArrivalCountdownSection, baseProps())
      )
    );
    await flush();
    expect(shownCalls()).toHaveLength(1);
  });

  it('fires again on the next local day', async () => {
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    setToday(new Date(2026, 9, 24, 8, 0, 0));
    rerender(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(shownCalls().map(([, props]) => props.days_until_arrival)).toEqual([
      40, 39,
    ]);
  });

  it('does not fire again when only the card text changes the same day', async () => {
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    rerender(
      h(ArrivalCountdownSection, { ...baseProps(), arrivalDate: '2026-12-15' })
    );
    await flush();
    expect(shownCalls()).toHaveLength(1);
  });

  it('counts each account separately', async () => {
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    rerender(
      h(ArrivalCountdownSection, { ...baseProps(), userId: `${currentUser}-b` })
    );
    await flush();
    expect(shownCalls()).toHaveLength(2);
  });

  it('sends nothing for an account that left before the marker was read', async () => {
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    // Switch account before the async marker read settles.
    rerender(h(ArrivalCountdownSection, { ...baseProps(), userId: null }));
    await flush();
    expect(shownCalls()).toHaveLength(0);
    const keys = [...mockStore.keys()];
    expect(keys.some(k => k.includes(currentUser))).toBe(false);
  });

  it('sends nothing without a signed-in user', async () => {
    render(h(ArrivalCountdownSection, { ...baseProps(), userId: null }));
    await flush();
    expect(screen.getByText('40 days until you land')).toBeTruthy();
    expect(shownCalls()).toHaveLength(0);
  });
});

describe('a section that is gone or hidden', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(res => {
      resolve = res;
    });
    return { promise, resolve };
  };

  it('sends nothing when the marker read finishes after the section unmounted', async () => {
    const gate = deferred();
    mockStorageGate = gate.promise;
    const view = render(h(ArrivalCountdownSection, baseProps()));
    view.unmount();
    await act(async () => {
      gate.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(shownCalls()).toHaveLength(0);
    // The day stays unclaimed, so a later mount still sends its event.
    mockStorageGate = null;
    render(h(ArrivalCountdownSection, { ...baseProps(), userId: currentUser }));
    await flush();
    expect(shownCalls()).toHaveLength(1);
  });

  it('after A to B to A, sends only the event for A', async () => {
    const gate = deferred();
    mockStorageGate = gate.promise;
    const accountA = currentUser;
    const accountB = `${currentUser}-b`;
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    rerender(h(ArrivalCountdownSection, { ...baseProps(), userId: accountB }));
    rerender(h(ArrivalCountdownSection, { ...baseProps(), userId: accountA }));
    await act(async () => {
      gate.resolve();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    const sent = shownCalls();
    // Account A is current again, so one event for A is right. B left.
    expect(sent).toHaveLength(1);
    expect([...mockStore.keys()].filter(k => k.includes(accountB))).toEqual([]);
    expect(
      [...mockStore.keys()].filter(k => k.includes(accountA))
    ).toHaveLength(1);
  });

  it('does not claim the day while the tab is hidden, and claims it when focused', async () => {
    const { rerender } = render(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(shownCalls()).toHaveLength(1);

    // Next day: the tab is retained but not in front when the app returns.
    mockFocused = false;
    setToday(new Date(2026, 9, 24, 0, 5, 0));
    rerender(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(shownCalls()).toHaveLength(1);
    expect(screen.getByText('39 days until you land')).toBeTruthy();

    mockFocused = true;
    rerender(h(ArrivalCountdownSection, baseProps()));
    await flush();
    expect(shownCalls().map(([, props]) => props.days_until_arrival)).toEqual([
      40, 39,
    ]);
  });
});

describe('changing the date', () => {
  const openSheet = async (props = baseProps()) => {
    render(h(ArrivalCountdownSection, props));
    await flush();
    fireEvent.press(
      screen.getByRole('button', { name: '40 days until you land' })
    );
    return props;
  };

  it('opens the sheet preset to the current date', async () => {
    await openSheet();
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(
      screen.getByLabelText('December').props.accessibilityState.selected
    ).toBe(true);
    expect(screen.getByLabelText('2').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('saves a changed date, refreshes everything, and tracks the change', async () => {
    const props = await openSheet();
    fireEvent.press(screen.getByLabelText('15'));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    await flush();
    expect(mockUpdateArrivalDate).toHaveBeenCalledWith(
      currentUser,
      '2026-12-15'
    );
    expect(props.refreshStage).toHaveBeenCalled();
    expect(props.refreshUser).toHaveBeenCalled();
    expect(props.refetchChecklist).toHaveBeenCalled();
    expect(screen.queryByTestId('sheet')).toBeNull();
    expect(mockCapture).toHaveBeenCalledWith('arrival_date_changed', {
      days_until_arrival: 53,
    });
  });

  it('keeps the sheet and the old date when the save fails', async () => {
    mockUpdateArrivalDate.mockRejectedValue(new Error('rls'));
    const props = await openSheet();
    fireEvent.press(screen.getByLabelText('15'));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    await flush();
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalled();
    expect(props.refreshStage).not.toHaveBeenCalled();
    expect(
      mockCapture.mock.calls.filter(([n]) => n === 'arrival_date_changed')
    ).toHaveLength(0);
    expect(screen.getByLabelText('15').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('dismissing the sheet saves nothing and keeps the old date', async () => {
    const props = await openSheet();
    fireEvent.press(screen.getByLabelText('15'));
    fireEvent.press(screen.getByTestId('sheet-backdrop'));
    expect(screen.queryByTestId('sheet')).toBeNull();
    expect(mockUpdateArrivalDate).not.toHaveBeenCalled();
    expect(props.refreshStage).not.toHaveBeenCalled();
    expect(screen.getByText('40 days until you land')).toBeTruthy();
    // Reopening starts from the saved date again.
    fireEvent.press(
      screen.getByRole('button', { name: '40 days until you land' })
    );
    expect(screen.getByLabelText('2').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('still shows the saved date as saved when analytics throws', async () => {
    mockCapture.mockImplementation((name: string) => {
      if (name === 'arrival_date_changed') throw new Error('posthog');
    });
    await openSheet();
    fireEvent.press(screen.getByLabelText('15'));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sheet')).toBeNull();
    mockCapture.mockReset();
  });
});
