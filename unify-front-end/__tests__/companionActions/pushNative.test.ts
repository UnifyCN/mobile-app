import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
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
const originalPlatform = Platform.OS;
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', originalPlatform);
  jest.replaceProperty(Device, 'isDevice', true);
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
  });
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
  jest.restoreAllMocks();
});
it.each(['ios', 'android'] as const)(
  'lets the native SDK determine push availability on a virtual %s installation',
  async platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    jest.replaceProperty(Device, 'isDevice', false);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'undetermined',
      canAskAgain: true,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
    });

    await companionPushDevice.enable('en');

    expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: '3772d4d9-79dd-4848-9691-bae1b19eefb8',
    });
    if (platform === 'android') {
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'companion',
        { name: 'Companion', importance: 3 }
      );
      expect(
        (Notifications.setNotificationChannelAsync as jest.Mock).mock
          .invocationCallOrder[0]
      ).toBeLessThan(
        (Notifications.getPermissionsAsync as jest.Mock).mock
          .invocationCallOrder[0]
      );
    } else {
      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:63610/functions/v1/companion-actions');
    expect(request.headers.authorization).toBe(
      `Bearer ${mockSession.access_token}`
    );
    expect(JSON.parse(request.body)).toMatchObject({
      action: 'push_apply',
      client: { platform },
      operation: { type: 'push.enroll', expected_revision: 0, enabled: true },
    });
    const record = JSON.parse(
      (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1]
    );
    expect(record.accountId).toBe(mockSession.user.id);
    expect(record.sessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(companionPushDevice.snapshot().phase).toBe('serviceDisabled');
  }
);
it('rejects a nonnative platform before any native permission or token request', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await companionPushDevice.enable('en');
  expect(companionPushDevice.snapshot().phase).toBe('unsupported');
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});
it.each(['ios', 'android'] as const)(
  'keeps denied native %s permission from enrolling',
  async platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    jest.replaceProperty(Device, 'isDevice', false);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
      canAskAgain: false,
    });
    await companionPushDevice.enable('en');
    expect(companionPushDevice.snapshot().phase).toBe('denied');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  }
);
it.each(['permission', 'token'] as const)(
  'stops after account loss during a native %s wait',
  async stage => {
    jest.replaceProperty(Device, 'isDevice', false);
    let release!: (value: any) => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => (entered = resolve));
    const api =
      stage === 'permission'
        ? Notifications.getPermissionsAsync
        : Notifications.getExpoPushTokenAsync;
    (api as jest.Mock).mockImplementationOnce(() => {
      entered();
      return new Promise(resolve => (release = resolve));
    });
    const job = companionPushDevice.enable('en');
    await waiting;
    for (const cb of mockListeners) cb('SIGNED_OUT', null);
    release(
      stage === 'permission'
        ? { status: 'granted', canAskAgain: true }
        : { data: 'ExpoPushToken[synthetic369-native-adapter]' }
    );
    await job;
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    if (stage === 'permission')
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  }
);
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
