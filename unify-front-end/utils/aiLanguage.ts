import { normalizeSanityLanguage } from '@/services/sanity/i18n';

/**
 * Languages the AI surfaces (rag-query, explain-term, practice-feedback) may
 * be asked to answer in. English is deliberately absent: the models already
 * answer in English, so an English request omits the field entirely and keeps
 * the deployed prompts untouched.
 *
 * Keep this whitelist in lockstep with the edge functions' own map in
 * `supabase/functions/_shared/responseLanguage.ts` — anything outside it is
 * dropped rather than forwarded, so a stray locale can never be injected into
 * a model prompt.
 */
export const AI_RESPONSE_LANGUAGES = {
  vi: 'Vietnamese',
  es: 'Spanish',
  hi: 'Hindi',
  ar: 'Arabic',
  'fr-CA': 'Canadian French',
  pa: 'Punjabi',
} as const;

export type AiResponseLanguage = keyof typeof AI_RESPONSE_LANGUAGES;

/**
 * Normalize a UI locale to a code the AI edge functions accept, or
 * `undefined` for English (and for anything that resolves to English).
 * Callers spread the result so the request body carries no field at all when
 * the answer should stay in English.
 */
export function resolveAiResponseLanguage(
  language: string | null | undefined
): AiResponseLanguage | undefined {
  const normalized = normalizeSanityLanguage(language);
  return normalized === 'en' ? undefined : normalized;
}
