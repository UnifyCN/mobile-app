/**
 * Error types and classification for non-OK responses from the rag-query edge
 * function. Kept free of Expo / Supabase imports so the classifier is
 * unit-testable in plain jest and reusable from any caller.
 */

/**
 * i18n keys for the user-facing copy. This module stays free of i18next so it
 * remains unit-testable in plain jest, so it carries keys and the rendering
 * caller translates them.
 */
export const BUSY_FALLBACK_MESSAGE_KEY = 'companion.busyToast';

export const DAILY_LIMIT_FALLBACK_MESSAGE_KEY =
  'companion.dailyLimitReachedToast';

/**
 * Thrown when rag-query signals upstream rate-limit / capacity issues (503).
 * Callers can match on `instanceof` (or `error.code === 'ai_companion_busy'`)
 * to surface a friendly "busy, try again" toast instead of a generic failure.
 */
export class AICompanionBusyError extends Error {
  readonly code = 'ai_companion_busy' as const;
  /** i18n key callers render — `message` is server text kept for logs. */
  readonly messageKey = BUSY_FALLBACK_MESSAGE_KEY;
  constructor(message: string) {
    super(message);
    this.name = 'AICompanionBusyError';
  }
}

/**
 * Thrown when rag-query rejects the request because the user hit their daily
 * message cap (429). The client normally blocks sending before this fires, so
 * this is the backstop for a stale/out-of-sync local count. Callers surface a
 * "daily limit reached" toast.
 */
export class AICompanionLimitError extends Error {
  readonly code = 'daily_limit_reached' as const;
  /** i18n key callers render — `message` is server text kept for logs. */
  readonly messageKey = DAILY_LIMIT_FALLBACK_MESSAGE_KEY;
  constructor(message: string) {
    super(message);
    this.name = 'AICompanionLimitError';
  }
}

/**
 * Map a non-OK rag-query HTTP response to a typed Error. Detects both the
 * machine-readable `code` field and the raw status so it stays correct even if
 * the body is missing or not JSON.
 *
 * - 429 / `daily_limit_reached` -> AICompanionLimitError
 * - 503 / `ai_companion_busy`   -> AICompanionBusyError
 * - anything else               -> generic Error with status + body
 */
export function classifyRagQueryError(status: number, bodyText: string): Error {
  let parsed: { error?: string; code?: string } | null = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // not JSON — fall back to status-based classification
    }
  }

  if (parsed?.code === 'daily_limit_reached' || status === 429) {
    return new AICompanionLimitError(
      parsed?.error ?? `rag-query ${status}: daily_limit_reached`
    );
  }

  if (parsed?.code === 'ai_companion_busy' || status === 503) {
    return new AICompanionBusyError(
      parsed?.error ?? `rag-query ${status}: ai_companion_busy`
    );
  }

  return new Error(
    bodyText ? `rag-query ${status}: ${bodyText}` : `rag-query ${status}`
  );
}
