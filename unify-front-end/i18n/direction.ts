import { I18nManager } from 'react-native';

/**
 * Right-to-left locales. Mirrors `RTL_LANGUAGES` in the web app's
 * `lib/i18n/config.ts`, where the same set drives `<html dir>`.
 */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar']);

export type Direction = 'ltr' | 'rtl';

export function dirForLanguage(language: string): Direction {
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

export function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.has(language);
}

/**
 * Point the native layout engine at the direction `language` needs.
 *
 * Unlike the web (`document.dir` flips instantly), React Native reads
 * `I18nManager.isRTL` once at startup, so a change only takes effect after
 * the JS bundle reloads. Returns `true` when the native flag was changed and
 * the app must restart before the layout matches the language.
 */
export function syncLayoutDirection(language: string): boolean {
  const wantRtl = isRtlLanguage(language);
  if (I18nManager.isRTL === wantRtl) return false;
  I18nManager.allowRTL(wantRtl);
  I18nManager.forceRTL(wantRtl);
  return true;
}
