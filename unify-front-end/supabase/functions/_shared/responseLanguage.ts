// supabase/functions/_shared/responseLanguage.ts
//
// Shared answer-language whitelist for the AI edge functions. Mirrors the
// client map in `utils/aiLanguage.ts` and the map rag-query uses, so all three
// AI surfaces accept exactly the same codes.
//
// The whitelist is the security boundary: the request body value is never
// interpolated into a prompt, only used to look up a fixed English language
// name here. An unknown code yields no directive at all.

export const RESPONSE_LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  es: 'Spanish',
  hi: 'Hindi',
  ar: 'Arabic',
  'fr-CA': 'Canadian French',
};

/** Resolve regional locales to a whitelisted code, or null for English. */
export function normalizeResponseLanguage(
  language: unknown
): string | null {
  if (typeof language !== 'string') return null;
  const normalized = language.trim().toLowerCase();
  if (!normalized || normalized === 'en' || normalized.startsWith('en-')) {
    return null;
  }
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr-CA';
  if (normalized === 'vi' || normalized.startsWith('vi-')) return 'vi';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es';
  if (normalized === 'hi' || normalized.startsWith('hi-')) return 'hi';
  if (normalized === 'ar' || normalized.startsWith('ar-')) return 'ar';
  return null;
}

/**
 * The prompt suffix that pins the answer to the user's UI language. Returns
 * an empty string for English and for any code outside the whitelist, so the
 * English prompt stays byte-for-byte what it is today.
 */
export function responseLanguageDirective(language: unknown): string {
  const code = normalizeResponseLanguage(language);
  if (!code) return '';
  const name = RESPONSE_LANGUAGE_NAMES[code];
  if (!name) return '';
  return `\n\nRespond in ${name} only. Write every sentence of your answer in ${name}, even when the source material is in English. Keep official Canadian program names, form codes and organisation names in their original language, and add a short ${name} gloss the first time each one appears.`;
}
