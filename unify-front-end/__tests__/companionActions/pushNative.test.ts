import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { companionPushDevice } from '@/services/companionActions/pushNative';
import { subscribeAccount } from '@/services/account/accountSession';
const mockListeners = new Set<(e: string, s: unknown) => void>();
const mockSession = {
  user: { id: 'native-adapter-owner' },
  access_token:
    'x.' +
    btoa(
      JSON.stringify({ session_id: '11111111-1111-4111-8111-111111111111' })
    ) +
    '.x',
};
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
        eas: { projectId: 'fixture-project' },
      },
    },
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
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
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({
    data: 'ExpoPushToken[synthetic369-native-adapter]',
  })),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
const random = jest.fn((bytes: Uint8Array) => {
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = (i + 13 + random.mock.calls.length) % 256;
  return bytes;
});
let stop: () => void;
const original = global.fetch;
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: random },
  });
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  stop = subscribeAccount(() => {});
  await Promise.resolve();
  await Promise.resolve();
  global.fetch = jest.fn(async () => ({
    status: 503,
    json: async () => ({ error: 'push_disabled' }),
  })) as unknown as typeof fetch;
});
afterEach(() => {
  stop();
  global.fetch = original;
});
it('generates independent UUID and 32-byte proof and saves the exact intent with device-only options before dispatch', async () => {
  await companionPushDevice.enable('en');
  expect(random.mock.calls.map(c => c[0].length)).toEqual([16, 32, 16]);
  const [key, raw, options] = (SecureStore.setItemAsync as jest.Mock).mock
    .calls[0];
  const value = JSON.parse(raw);
  expect(key).toBe('companion.push.installation.v1');
  expect(value.installation_secret).toMatch(/^[0-9a-f]{64}$/);
  expect(
    value.pending.operation.installation_secret === value.installation_secret
  ).toBe(true);
  expect(options).toEqual({
    keychainAccessible: 6,
    requireAuthentication: false,
  });
  expect(
    (SecureStore.setItemAsync as jest.Mock).mock.invocationCallOrder[0]
  ).toBeLessThan((global.fetch as jest.Mock).mock.invocationCallOrder[0]);
  const marker = await AsyncStorage.getItem('companion.push.created.v1');
  expect(marker).toBe('1');
  expect(
    JSON.stringify(await AsyncStorage.getAllKeys()).includes(
      value.installation_secret
    )
  ).toBe(false);
});
it.each(['missing', 'partial', 'corrupt', 'locked'])(
  'fails closed on %s SecureStore data without using an ID or token to recover',
  async kind => {
    await AsyncStorage.setItem('companion.push.created.v1', '1');
    if (kind === 'partial')
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        '{"version":1,"installation_id":"11111111-1111-4111-8111-111111111111"}'
      );
    if (kind === 'corrupt')
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{');
    if (kind === 'locked')
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('locked')
      );
    await companionPushDevice.enable('en');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(companionPushDevice.snapshot().phase).toBe('unavailable');
  }
);
it('stops after a held SecureStore read when ownership becomes unknown', async () => {
  let release: any;
  (SecureStore.getItemAsync as jest.Mock).mockImplementationOnce(
    () => new Promise(r => (release = r))
  );
  const job = companionPushDevice.enable('en');
  await Promise.resolve();
  for (const cb of mockListeners) cb('SIGNED_OUT', null);
  release(null);
  await job;
  expect(global.fetch).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
it('keeps tokens and proof out of runtime logs', async () => {
  const logs = [
    jest.spyOn(console, 'log'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'error'),
  ];
  await companionPushDevice.enable('en');
  const text = JSON.stringify(logs.flatMap(x => x.mock.calls));
  expect(text.includes('ExpoPushToken[')).toBe(false);
  expect(text.includes('installation_secret')).toBe(false);
  logs.forEach(x => x.mockRestore());
  expect(Notifications.getDevicePushTokenAsync).toBeUndefined();
});
