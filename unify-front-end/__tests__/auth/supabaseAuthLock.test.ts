/**
 * REGRESSION TEST: Supabase auth lock timeout on cold start.
 *
 * PostHog error tracking caught an unhandled
 * `Acquiring process lock with name "lock:sb-...-auth-token" timed out`
 * on Android, ~6s after a cold start on the Learn screen. processLock runs
 * every getUser/getSession call one at a time, and auth-js 2.104 gives each
 * waiter only 5s. A timeout does not release the holder, and the
 * onAuthStateChange initial emission rejects where the app cannot catch it,
 * so the app client must wait for the lock with no timeout. createClient does
 * not forward `auth.lockAcquireTimeout`, so it does this in its lock function.
 *
 * These tests use the real supabase-js client and auth-js lock, with only
 * the storage slowed down, so a no-op config would fail them.
 */

import { createClient, processLock } from '@supabase/supabase-js';

const STORAGE_DELAY_MS = 800;
const QUEUED_CALLS = 10; // 10 x 800ms = 8s of queue, past the 5s default

const slowRead = () =>
  new Promise<null>(resolve =>
    setTimeout(() => resolve(null), STORAGE_DELAY_MS)
  );

jest.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });
// App-client storage delay; a test raises it to hold the lock for longer.
let mockStorageDelayMs = STORAGE_DELAY_MS;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(
    () =>
      new Promise(resolve =>
        setTimeout(() => resolve(null), mockStorageDelayMs)
      )
  ),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'test-anon-key',
      },
    },
  },
}));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
}));

type Outcome = 'resolved' | 'timed-out' | 'failed';

async function queueGetSessionCalls(auth: {
  getSession: () => Promise<unknown>;
}): Promise<Outcome[]> {
  const results = Array.from({ length: QUEUED_CALLS }, () =>
    auth.getSession().then(
      (): Outcome => 'resolved',
      (error: { isAcquireTimeout?: boolean }): Outcome =>
        error?.isAcquireTimeout ? 'timed-out' : 'failed'
    )
  );
  // Every queued storage read, plus initialization on a cold client.
  await jest.advanceTimersByTimeAsync((QUEUED_CALLS + 2) * STORAGE_DELAY_MS);
  return Promise.all(results);
}

type AppClientModule = typeof import('@/lib/supabase');

// Load a fresh app client (own auth-js module and lock map), then let
// initialization and its first auto-refresh tick finish so the lock is free.
async function loadSettledAppClient(): Promise<AppClientModule> {
  let mod!: AppClientModule;
  jest.isolateModules(() => {
    mod = require('@/lib/supabase');
  });
  await jest.advanceTimersByTimeAsync(STORAGE_DELAY_MS * 4);
  await mod.supabase.auth.stopAutoRefresh();
  await jest.advanceTimersByTimeAsync(STORAGE_DELAY_MS * 4);
  expect(jest.getTimerCount()).toBe(0);
  return mod;
}

describe('Supabase auth lock timeout', () => {
  let appClient: AppClientModule | null = null;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.useFakeTimers();
    mockStorageDelayMs = STORAGE_DELAY_MS;
  });

  afterEach(async () => {
    if (appClient) {
      await appClient.supabase.auth.stopAutoRefresh();
      appClient = null;
    }
    // Finish pending reads so nothing leaks into the next test.
    await jest.advanceTimersByTimeAsync(100_000);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('times out a queue with plain processLock (reproduces the report)', async () => {
    const client = createClient(
      'https://example.supabase.co',
      'test-anon-key',
      {
        auth: {
          storage: {
            getItem: slowRead,
            setItem: async () => undefined,
            removeItem: async () => undefined,
          },
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: false,
          lock: processLock,
        },
      }
    );

    const outcomes = await queueGetSessionCalls(client.auth);

    expect(outcomes).toContain('timed-out');
  });

  it('lets the same queue finish on the app client', async () => {
    appClient = await loadSettledAppClient();

    const outcomes = await queueGetSessionCalls(appClient.supabase.auth);

    expect(outcomes).toEqual(Array(QUEUED_CALLS).fill('resolved'));
  });

  it('delivers the onAuthStateChange initial session after a long lock hold', async () => {
    appClient = await loadSettledAppClient();
    const { supabase } = appClient;

    // Hold the lock for 40s (longer than any fixed bound tried so far), then
    // subscribe. auth-js runs the initial emission in a promise nobody
    // catches; with a lock timeout it rejects and the callback never runs.
    mockStorageDelayMs = 40_000;
    const holder = supabase.auth.getSession();
    const callback = jest.fn();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(callback);

    await jest.advanceTimersByTimeAsync(100_000);

    await expect(holder).resolves.toMatchObject({ error: null });
    expect(callback).toHaveBeenCalledWith('INITIAL_SESSION', null);
    subscription.unsubscribe();
  });

  it('keeps a zero timeout as "skip if busy" for the auto-refresh tick', async () => {
    appClient = await loadSettledAppClient();
    const { authLock } = appClient;
    const lockName = 'lock:test-zero';

    // Hold the lock, then ask with 0 as the auto-refresh tick does. It must
    // fail fast instead of waiting.
    const holder = authLock(lockName, -1, () => slowRead());
    const skipped = authLock(lockName, 0, async () => 'ran').catch(
      (error: { isAcquireTimeout?: boolean }) =>
        error?.isAcquireTimeout ? 'timed-out' : 'failed'
    );
    await jest.advanceTimersByTimeAsync(STORAGE_DELAY_MS * 2);

    await expect(skipped).resolves.toBe('timed-out');
    await expect(holder).resolves.toBeNull();
  });
});
