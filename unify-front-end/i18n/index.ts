import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import en from './locales/en/translation.json';
import vi from './locales/vi/translation.json';
import es from './locales/es/translation.json';
import hi from './locales/hi/translation.json';
import ar from './locales/ar/translation.json';
import frCA from './locales/fr-CA/translation.json';
import pa from './locales/pa/translation.json';
import { syncLayoutDirection } from './direction';

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  vi: 'Tiếng Việt',
  es: 'Español',
  hi: 'हिन्दी',
  ar: 'العربية',
  'fr-CA': 'Français (canadien)',
  pa: 'ਪੰਜਾਬੀ',
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so "toString"
  // or "constructor" would wrongly pass as supported codes.
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, value)
  );
}

/**
 * Map a device locale to a supported language. French ships only as
 * Canadian French, so any fr* device locale resolves to `fr-CA` — the same
 * rule as the web app's Accept-Language negotiation. Punjabi ships only in
 * Gurmukhi script (`pa`).
 */
export function languageFromDeviceLocale(
  locale: { languageCode?: string | null; languageTag?: string | null } | undefined
): SupportedLanguage {
  const tag = locale?.languageTag;
  if (isSupportedLanguage(tag)) return tag;
  const code = locale?.languageCode ?? '';
  if (code === 'fr') return 'fr-CA';
  // Punjabi ships in Gurmukhi only. A Shahmukhi device (pa-Arab-PK) reads
  // Perso-Arabic script, so Gurmukhi would be unreadable — stay on English.
  if (code === 'pa' && /-arab\b/i.test(tag ?? '')) return DEFAULT_LANGUAGE;
  if (isSupportedLanguage(code)) return code;
  return DEFAULT_LANGUAGE;
}

const LANGUAGE_STORAGE_KEY = 'user_preferred_language';

// In-memory flag — set when the *user* actively picks a language during this
// app session (pre-login picker, account-settings). Lets the post-login sync
// hook tell apart "user just chose this" from "AsyncStorage value left over
// from a previous run." Resets on cold start so cross-device server-wins
// behavior is preserved when nobody has explicitly picked yet this session.
let userPickedLanguageThisSession = false;

export function hasUserPickedLanguageThisSession(): boolean {
  return userPickedLanguageThisSession;
}

async function getStoredLanguage(): Promise<SupportedLanguage> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch (e) {
    console.error(
      `AsyncStorage.getItem(${LANGUAGE_STORAGE_KEY}) failed during i18n init:`,
      e
    );
  }

  return languageFromDeviceLocale(Localization.getLocales()[0]);
}

/**
 * Persist + apply a language. Resolves to `true` when the native layout
 * direction changed (LTR ⇄ RTL) and the app must restart for the layout to
 * match — see `promptRestartForLayoutDirection` in `i18n/restart.ts`.
 */
export async function setStoredLanguage(
  lang: SupportedLanguage,
  opts: { source: 'user' | 'server' } = { source: 'user' }
): Promise<boolean> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  if (opts.source === 'user') {
    userPickedLanguageThisSession = true;
  }
  await i18n.changeLanguage(lang);
  return syncLayoutDirection(lang);
}

const initI18n = async () => {
  const lng = await getStoredLanguage();
  // Cold start: make sure the native direction flag matches the language we
  // are about to render (covers a server-synced switch that never restarted).
  // Takes effect on the next launch; nothing to prompt for here.
  syncLayoutDirection(lng);

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
      es: { translation: es },
      hi: { translation: hi },
      ar: { translation: ar },
      'fr-CA': { translation: frCA },
      pa: { translation: pa },
    },
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v3',
    react: {
      useSuspense: false,
    },
  });
};

// Promise resolved once i18n is initialized with the user's stored/device language.
// Awaited in app/_layout.tsx so the first render uses the correct language and
// non-English users don't see an English flash on cold start.
export const i18nReady = initI18n();

export default i18n;
