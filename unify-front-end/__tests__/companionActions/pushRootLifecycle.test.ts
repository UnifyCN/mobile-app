import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useCompanionPushNotifications } from '@/hooks/companion/useCompanionPush';
import { companionPushDevice } from '@/services/companionActions/pushNative';
import { subscribeAccount } from '@/services/account/accountSession';
const mockListeners = new Set<(e: string, s: unknown) => void>();
const mockResponses = new Set<(v: any) => void>();
let mockId = 'root-a',
  mockToken = 'ExpoPushToken[synthetic369-root-one]',
  mockPermission = 'granted',
  mockValue: string | null = null;
const mockRotate = jest.fn();
const mockCold = jest.fn(async () => null as any);
const mockNavigate = jest.fn();
const jwt = () =>
  'x.' +
  btoa(JSON.stringify({ session_id: '11111111-1111-4111-8111-111111111111' })) +
  '.x';
const session = () => ({ user: { id: mockId }, access_token: jwt() });
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: (cb: any) => {
        mockListeners.add(cb);
        return {
          data: {
            subscription: { unsubscribe: () => mockListeners.delete(cb) },
          },
        };
      },
    },
  },
}));
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '9.9.9',
      extra: {
        supabaseUrl: 'http://127.0.0.1:63610',
        supabaseAnonKey: 'fixture',
      },
    },
  },
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: async () => mockValue,
  setItemAsync: async (_k: string, v: string) => {
    mockValue = v;
  },
}));
jest.mock('expo-router', () => ({
  router: { navigate: (...args: any[]) => mockNavigate(...args) },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: async () => ({
    status: mockPermission,
    canAskAgain: false,
  }),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: mockToken })),
  addNotificationResponseReceivedListener: (cb: any) => {
    mockResponses.add(cb);
    return { remove: () => mockResponses.delete(cb) };
  },
  getLastNotificationResponseAsync: () => mockCold(),
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: jest.fn(),
  addPushTokenListener: (cb: any) => {
    mockRotate.mockImplementation(cb);
    return { remove() {} };
  },
}));
const delivery = '44444444-4444-4444-8444-444444444444';
let stop: () => void;
let n = 0;
const original = global.fetch;
const requests: Record<string, any>[] = [];
function auth(id: string, event = 'SIGNED_IN') {
  mockId = id;
  for (const cb of mockListeners) cb(event, session());
}
beforeEach(async () => {
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove() {} }));
  mockId = 'root-a-' + ++n;
  mockValue = null;
  mockToken = 'ExpoPushToken[synthetic369-root-one]';
  mockPermission = 'granted';
  mockCold.mockReset().mockResolvedValue(null);
  mockNavigate.mockClear();
  requests.length = 0;
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: (bytes: Uint8Array) => {
        counter++;
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i + counter) % 256;
        return bytes;
      },
    },
  });
  stop = subscribeAccount(() => {});
  await act(async () => {});
  global.fetch = jest.fn(async (_url, init: any) => {
    const b = JSON.parse(init.body);
    requests.push(b);
    if (b.action === 'push_resolve')
      return { status: 200, json: async () => ({ target: 'unavailable' }) };
    if (b.action === 'push_read')
      return { status: 200, json: async () => ({ enrollment: state }) };
    const op = b.operation;
    state = {
      installation_id: op.installation_id,
      revision: (state?.revision ?? 0) + 1,
      generation: '22222222-2222-4222-8222-222222222222',
      enabled: true,
      revoked: false,
      locale: 'en',
    };
    return {
      status: 200,
      json: async () => ({
        status: 'applied',
        replayed: false,
        operation_id: b.operation_id,
        results: [
          {
            ...state,
            type: op.type,
            before_revision: op.expected_revision,
            after_revision: state.revision,
          },
        ],
        receipt: {
          operation_id: b.operation_id,
          operation_type: op.type,
          undoable: false,
          current: null,
        },
      }),
    };
  }) as unknown as typeof fetch;
  state = null;
});
let state: any = null;
afterEach(() => {
  stop();
  global.fetch = original;
  jest.restoreAllMocks();
});
it('fetches an Expo token after native-token rotation and uses the current revision; foreground permission changes stop local eligibility', async () => {
  let foreground: (s: string) => void = () => {};
  const spy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_e, cb: any) => {
      foreground = cb;
      return { remove() {} };
    });
  renderHook(() => useCompanionPushNotifications());
  await act(async () => {});
  await act(async () => {
    await companionPushDevice.enable('en');
  });
  expect(companionPushDevice.snapshot().phase).toBe('on');
  mockToken = 'ExponentPushToken[synthetic369-root-two]';
  await act(async () => {
    mockRotate({ type: 'ios', data: 'APNS-RAW-DEVICE-TOKEN' });
  });
  await waitFor(() =>
    expect(requests.filter(b => b.action === 'push_apply').length).toBe(2)
  );
  const op = requests.filter(b => b.action === 'push_apply')[1].operation;
  expect(op.token).toBe(mockToken);
  expect(op.expected_revision).toBe(1);
  expect(JSON.stringify(requests).includes('APNS-RAW-DEVICE-TOKEN')).toBe(
    false
  );
  mockPermission = 'denied';
  await act(async () => foreground('active'));
  await waitFor(() =>
    expect(companionPushDevice.snapshot().phase).toBe('denied')
  );
  expect(requests.filter(b => b.action === 'push_apply').length).toBe(2);
  spy.mockRestore();
});
it('drops an authenticated cold response that arrives after account replacement', async () => {
  let release: any;
  mockCold.mockImplementationOnce(() => new Promise(r => (release = r)));
  renderHook(() => useCompanionPushNotifications());
  await act(async () => auth('root-b'));
  await act(async () =>
    release({
      notification: {
        request: {
          content: {
            data: { type: 'companion_reminder', delivery_id: delivery },
          },
        },
      },
    })
  );
  expect(requests.filter(b => b.action === 'push_resolve').length).toBe(0);
  expect(mockNavigate).not.toHaveBeenCalled();
});
it('keeps same-session token refresh as the cold-response positive control', async () => {
  let release: any;
  mockCold.mockImplementationOnce(() => new Promise(r => (release = r)));
  renderHook(() => useCompanionPushNotifications());
  await act(async () => auth(mockId, 'TOKEN_REFRESHED'));
  await act(async () =>
    release({
      notification: {
        request: {
          content: {
            data: { type: 'companion_reminder', delivery_id: delivery },
          },
        },
      },
    })
  );
  expect(requests.filter(b => b.action === 'push_resolve').length).toBe(1);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
});
