import { I18nManager } from 'react-native';
import {
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  languageFromDeviceLocale,
} from '@/i18n';
import {
  dirForLanguage,
  isRtlLanguage,
  syncLayoutDirection,
} from '@/i18n/direction';
import { SANITY_LANGUAGES, normalizeSanityLanguage } from '@/services/sanity/i18n';

/** The web app's `SUPPORTED_LANGUAGES` (lib/i18n/config.ts) — keep in sync. */
const WEB_LANGUAGES = ['en', 'vi', 'es', 'hi', 'ar', 'fr-CA', 'pa'] as const;

describe('supported languages', () => {
  it('matches the web app language set exactly', () => {
    expect(Object.keys(SUPPORTED_LANGUAGES).sort()).toEqual(
      [...WEB_LANGUAGES].sort()
    );
  });

  it('every UI language has a Sanity content language', () => {
    for (const lang of Object.keys(SUPPORTED_LANGUAGES)) {
      expect(SANITY_LANGUAGES).toContain(normalizeSanityLanguage(lang));
      expect(normalizeSanityLanguage(lang)).toBe(lang);
    }
  });

  it('isSupportedLanguage ignores prototype keys and unknown codes', () => {
    expect(isSupportedLanguage('fr-CA')).toBe(true);
    expect(isSupportedLanguage('ar')).toBe(true);
    expect(isSupportedLanguage('pa')).toBe(true);
    expect(isSupportedLanguage('toString')).toBe(false);
    expect(isSupportedLanguage('ur')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});

describe('languageFromDeviceLocale', () => {
  it('maps any French device locale to Canadian French', () => {
    expect(languageFromDeviceLocale({ languageCode: 'fr', languageTag: 'fr-FR' })).toBe('fr-CA');
    expect(languageFromDeviceLocale({ languageCode: 'fr', languageTag: 'fr-CA' })).toBe('fr-CA');
  });

  it('uses the bare language code for the other locales', () => {
    expect(languageFromDeviceLocale({ languageCode: 'ar', languageTag: 'ar-EG' })).toBe('ar');
    expect(languageFromDeviceLocale({ languageCode: 'es', languageTag: 'es-MX' })).toBe('es');
    expect(languageFromDeviceLocale({ languageCode: 'pa', languageTag: 'pa-IN' })).toBe('pa');
    expect(languageFromDeviceLocale({ languageCode: 'pa', languageTag: 'pa-Guru-IN' })).toBe('pa');
  });

  it('keeps Shahmukhi Punjabi devices on English (Gurmukhi-only catalog)', () => {
    expect(languageFromDeviceLocale({ languageCode: 'pa', languageTag: 'pa-Arab-PK' })).toBe('en');
  });

  it('falls back to English', () => {
    expect(languageFromDeviceLocale({ languageCode: 'ur', languageTag: 'ur-PK' })).toBe('en');
    expect(languageFromDeviceLocale(undefined)).toBe('en');
  });
});

describe('layout direction', () => {
  const originalIsRTL = I18nManager.isRTL;
  afterEach(() => {
    (I18nManager as { isRTL: boolean }).isRTL = originalIsRTL;
    jest.restoreAllMocks();
  });

  it('only Arabic is right-to-left', () => {
    expect(dirForLanguage('ar')).toBe('rtl');
    expect(isRtlLanguage('ar')).toBe(true);
    for (const lang of ['en', 'vi', 'es', 'hi', 'fr-CA', 'pa']) {
      expect(dirForLanguage(lang)).toBe('ltr');
    }
  });

  it('flips the native flag and reports a restart when direction changes', () => {
    (I18nManager as { isRTL: boolean }).isRTL = false;
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    const allow = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
    expect(syncLayoutDirection('ar')).toBe(true);
    expect(allow).toHaveBeenCalledWith(true);
    expect(force).toHaveBeenCalledWith(true);
  });

  it('is a no-op when the direction already matches', () => {
    (I18nManager as { isRTL: boolean }).isRTL = false;
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    expect(syncLayoutDirection('fr-CA')).toBe(false);
    expect(force).not.toHaveBeenCalled();
  });
});
