/**
 * Mobile transport for the companion-actions edge function (mobile-app#361).
 * Calls it directly with the signed-in user's JWT, like utils/gemini.ts does for
 * rag-query. The function derives the account from that JWT; no owner is sent.
 * Rejects only when no HTTP reply arrived, so the client can treat the outcome
 * as unknown and look it up before any retry.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { createTaskActionClient, type Transport } from './client';

const REQUEST_TIMEOUT_MS = 15_000;

type Extra = { supabaseUrl?: string; supabaseAnonKey?: string };

function endpoint(): { url: string; anonKey: string } | null {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  const base =
    extra?.supabaseUrl?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey =
    extra?.supabaseAnonKey?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!base || !anonKey) return null;
  return { url: `${base}/functions/v1/companion-actions`, anonKey };
}

export const mobileTransport: Transport = async body => {
  const target = endpoint();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // No session: the server would answer 401, so answer it here without a request.
  if (!session?.access_token) return { status: 401, body: { error: 'unauthorized' } };
  if (!target) throw new Error('companion-actions endpoint is not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
        apikey: target.anonKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
};

function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

export function createMobileTaskActionClient() {
  return createTaskActionClient({
    transport: mobileTransport,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    appVersion: appVersion(),
  });
}
