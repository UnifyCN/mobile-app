import { supabase } from '@/lib/supabase';
import type { SupportedLanguage } from '@/i18n';

/**
 * On-demand translation of user-generated content into the viewer's UI
 * language, through the shared `translate-content` edge function (also used
 * by the web app). The function fetches the source row itself by id, caches
 * the result server-side in `post_translations` / `comment_translations`
 * (keyed by row + language, invalidated when the source text changes) and
 * enforces a 20/day per-user quota — cache hits are free and flagged
 * `cached: true`.
 */
export type TranslatableType = 'post' | 'comment';

export interface TranslationResult {
  translatedContent: string;
  /** Posts only — null when the model returned no title translation. */
  translatedTitle: string | null;
  /** Detected ISO 639-1 source language, when the model reported one. */
  sourceLang?: string;
  /** True when served from the server-side cache (no quota consumed). */
  cached: boolean;
}

/** Thrown on the 429 daily-limit response so the UI can message it distinctly. */
export class TranslationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationLimitError';
  }
}

interface ErrorBody {
  error?: string;
  code?: string;
}

async function readErrorBody(error: unknown): Promise<{
  status?: number;
  body: ErrorBody | null;
}> {
  // FunctionsHttpError carries the upstream Response on `.context`.
  const ctx = (error as { context?: Response }).context;
  if (!ctx || typeof ctx.status !== 'number') return { body: null };
  let body: ErrorBody | null = null;
  try {
    body = (await ctx.json()) as ErrorBody;
  } catch {
    // non-JSON error body — keep the generic message
  }
  return { status: ctx.status, body };
}

export async function translateContent(
  type: TranslatableType,
  id: number,
  targetLanguage: SupportedLanguage
): Promise<TranslationResult> {
  const { data, error } = await supabase.functions.invoke<
    Partial<TranslationResult> & ErrorBody
  >('translate-content', {
    body: { type, id, targetLanguage },
  });

  if (error) {
    const { status, body } = await readErrorBody(error);
    const message = body?.error || error.message || 'Translation failed';
    if (status === 429 || body?.code === 'daily_limit_reached') {
      throw new TranslationLimitError(message);
    }
    throw new Error(message);
  }

  if (!data || typeof data.translatedContent !== 'string') {
    throw new Error(data?.error || 'No translation returned');
  }

  return {
    translatedContent: data.translatedContent,
    translatedTitle: data.translatedTitle ?? null,
    sourceLang: typeof data.sourceLang === 'string' ? data.sourceLang : undefined,
    cached: Boolean(data.cached),
  };
}
