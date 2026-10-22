import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = Constants.expoConfig?.extra as Extra | undefined;

// Prefer app.config.js `extra` (reliable in dev); fall back to EXPO_PUBLIC_* from Metro env inlining.
const supabaseUrl =
  extra?.supabaseUrl?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey =
  extra?.supabaseAnonKey?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (__DEV__) {
  console.log('hasSupabaseUrl:', !!process.env.EXPO_PUBLIC_SUPABASE_URL);
  console.log(
    'hasSupabaseAnonKey:',
    !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
  console.log('expoConfigExtraPresent:', !!Constants.expoConfig?.extra);
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (saved to disk), then restart Metro: npx expo start -c'
  );
}

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// auth-js 2.104 (Expo SDK 55 upgrade) waits only 5s for the auth lock, then
// throws "Acquiring process lock ... timed out". processLock serializes every
// getUser/getSession call, and getUser holds the lock for a network round
// trip, so a cold start that queues many auth calls can exceed 5s on a slow
// network. Older auth-js waited indefinitely; keep a bound so a hung request
// still surfaces as an error instead of a permanent deadlock.
export const AUTH_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

// createClient does not forward auth.lockAcquireTimeout, so raise the timeout
// inside the lock itself. Keep 0 ("skip if busy", used by the auto-refresh
// tick) and negative ("wait forever") as auth-js passes them.
export const authLock: typeof processLock = (name, acquireTimeout, fn) =>
  processLock(
    name,
    acquireTimeout > 0
      ? Math.max(acquireTimeout, AUTH_LOCK_ACQUIRE_TIMEOUT_MS)
      : acquireTimeout,
    fn
  );

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: authLock,
  },
});

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
AppState.addEventListener('change', state => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
