/**
 * Centralized legal document URLs.
 * Used by LegalWebView, SignUp, and Settings.
 */
export const LEGAL_URLS = {
  privacyPolicy:
    'https://www.notion.so/Unify-s-Privacy-Policy-2e15af89dddb80b0b37ee497e6d4e38c',
  communityGuidelines:
    'https://www.notion.so/Unify-s-Community-Guidelines-2e55af89dddb8098aff0d1460b3fb694',
  termsOfService:
    'https://www.notion.so/Unify-s-End-User-License-Agreement-Terms-of-Service-3185af89dddb80a68410fa8d65d615c7',
} as const;

export type LegalDocumentType = keyof typeof LEGAL_URLS;

/**
 * i18n keys for each document's screen title. Callers translate with `t()` so
 * the WebView header matches the user's language.
 */
export const LEGAL_TITLE_KEYS: Record<LegalDocumentType, string> = {
  privacyPolicy: 'settings.privacyPolicy',
  communityGuidelines: 'settings.communityGuidelines',
  termsOfService: 'settings.termsOfService',
};
