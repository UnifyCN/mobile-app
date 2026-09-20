import Constants from 'expo-constants';
// IMPORTANT: use expo/fetch (not the global fetch) for streaming. React
// Native's standard fetch buffers the full response before resolving, so
// `response.body` is always null. expo/fetch exposes `body` as a real
// ReadableStream<Uint8Array> on Hermes — required for SSE consumption.
import { fetch } from 'expo/fetch';
import { supabase } from '@/lib/supabase';
import { parseSSEStream } from '@/utils/sseParser';
import { Source } from '@/helpers/companion/messageHelpers';
import { QueryType, TokenUsage } from '@/types/chatbot';
import { classifyRagQueryError } from '@/helpers/companion/ragQueryErrors';
import i18n from '@/i18n';
import { resolveAiResponseLanguage } from '@/utils/aiLanguage';

// Re-export the typed errors so existing `from '@/utils/gemini'` imports keep
// working. The definitions live in a dependency-free module so the classifier
// stays unit-testable.
export {
  AICompanionBusyError,
  AICompanionLimitError,
} from '@/helpers/companion/ragQueryErrors';

interface ConversationMessage {
  message: string;
  role: 'user' | 'assistant';
}

export interface StreamMetadata {
  sources?: Source[];
  queryType?: QueryType;
  disclaimer?: string;
  lastVerified?: string;
}

export interface StreamComplete {
  cleanAnswer: string;
  suggestedNextSteps?: string[];
  tokenUsage?: TokenUsage;
  estimatedCostUsd?: number;
  model?: string;
  provider?: string;
}

export interface StreamCallbacks {
  onMetadata: (m: StreamMetadata) => void;
  onToken: (delta: string) => void;
  onComplete: (c: StreamComplete) => void;
  onError: (e: Error) => void;
}

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = Constants.expoConfig?.extra as Extra | undefined;
const SUPABASE_URL =
  extra?.supabaseUrl?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY =
  extra?.supabaseAnonKey?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

/**
 * Calls the rag-query edge function with `stream: true`, parses the returned
 * SSE stream, and dispatches incremental updates via the supplied callbacks.
 *
 * Uses raw `fetch()` rather than `supabase.functions.invoke()` because the
 * Supabase JS client buffers the full response body — we need access to
 * `response.body` as a `ReadableStream<Uint8Array>` so we can read tokens as
 * they arrive.
 *
 * Hermes / Expo dev-mode caveat: Expo's `CdpInterceptor` (Chrome DevTools
 * inspector hook) can buffer streaming `fetch` responses in dev, making the
 * stream look frozen. See Expo issue #27526. Production builds and Hermes
 * without the JS inspector connected work fine.
 */
export const streamGeminiAPI = async (
  prompt: string,
  conversationIdentifier: string | undefined,
  messages: ConversationMessage[] | undefined,
  callbacks: StreamCallbacks
): Promise<void> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    callbacks.onError(
      new Error(
        'Supabase URL or anon key missing — cannot stream from rag-query'
      )
    );
    return;
  }

  // Resolved once per call, before the request is built, so a language change
  // mid-stream cannot swap the code underneath an in-flight answer.
  const responseLanguage = resolveAiResponseLanguage(i18n.language);

  let response: Response;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      callbacks.onError(new Error('Not authenticated — no Supabase session'));
      return;
    }

    response = await fetch(`${SUPABASE_URL}/functions/v1/rag-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        prompt,
        conversationIdentifier,
        messages: messages || [],
        stream: true,
        // Ask the Companion to answer in the UI language. Omitted entirely for
        // English so the default prompt path is unchanged.
        ...(responseLanguage ? { responseLanguage } : {}),
      }),
    });
  } catch (err) {
    callbacks.onError(
      err instanceof Error ? err : new Error('Network error calling rag-query')
    );
    return;
  }

  // Map non-OK responses to typed errors (busy 503, daily-limit 429) so callers
  // can show the right friendly toast instead of a generic failure.
  if (!response.ok) {
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      // ignore
    }
    callbacks.onError(classifyRagQueryError(response.status, bodyText));
    return;
  }

  if (!response.body) {
    callbacks.onError(
      new Error('rag-query streaming response has no body')
    );
    return;
  }

  let completeReceived = false;
  try {
    for await (const evt of parseSSEStream(response.body)) {
      switch (evt.event) {
        case 'metadata': {
          try {
            const meta = JSON.parse(evt.data) as StreamMetadata;
            callbacks.onMetadata(meta);
          } catch (parseErr) {
            console.warn('Failed to parse metadata SSE:', parseErr);
          }
          break;
        }
        case 'token': {
          try {
            const { delta } = JSON.parse(evt.data) as { delta?: string };
            if (typeof delta === 'string' && delta.length > 0) {
              callbacks.onToken(delta);
            }
          } catch (parseErr) {
            console.warn('Failed to parse token SSE:', parseErr);
          }
          break;
        }
        case 'complete': {
          try {
            const payload = JSON.parse(evt.data) as StreamComplete;
            completeReceived = true;
            callbacks.onComplete(payload);
          } catch (parseErr) {
            callbacks.onError(
              parseErr instanceof Error
                ? parseErr
                : new Error('Failed to parse complete event')
            );
            return;
          }
          break;
        }
        case 'error': {
          try {
            const { error } = JSON.parse(evt.data) as { error?: string };
            callbacks.onError(
              new Error(error || 'Streaming error from rag-query')
            );
          } catch {
            callbacks.onError(new Error('Streaming error from rag-query'));
          }
          return;
        }
        default:
          // Unknown event — ignore for forward compatibility.
          break;
      }
    }
    if (!completeReceived) {
      callbacks.onError(
        new Error('Stream ended before completion event arrived')
      );
    }
  } catch (err) {
    callbacks.onError(
      err instanceof Error ? err : new Error('Stream parse failed')
    );
  }
};
