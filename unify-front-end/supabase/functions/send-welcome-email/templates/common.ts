// Shared pieces for every localized welcome-email template. Keeping the logo
// URL and the escaper in one place means a locale file only holds copy.

export const LOGO_URL =
  'https://wrbauxutkysljmsqojts.supabase.co/storage/v1/object/public/email-assets/unify-email-logo.png';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Container styles shared by every template. */
const BASE_STYLE =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
  'font-size:16px;line-height:1.6;color:#1a1a1a;max-width:560px;' +
  'margin:0 auto;padding:32px 24px;';

/**
 * Opening `<div>` for the email body. `lang` labels the content for screen
 * readers and for clients that pick a font per language; `dir` is 'rtl' only
 * for Arabic, which also right-aligns the text.
 */
export function containerOpen(lang: string, dir: 'ltr' | 'rtl' = 'ltr'): string {
  const align = dir === 'rtl' ? 'text-align:right;' : '';
  return `<div lang="${lang}" dir="${dir}" style="${BASE_STYLE}${align}">`;
}

/** Logo `<img>`; mirrored to the right edge in RTL layouts. */
export function logoImg(dir: 'ltr' | 'rtl' = 'ltr'): string {
  const margin = dir === 'rtl' ? 'margin:0 0 24px auto;' : 'margin-bottom:24px;';
  return `<img src="${LOGO_URL}" alt="Unify" width="64" height="64" style="display:block;border:0;${margin}">`;
}

export interface WelcomeTemplateOptions {
  firstName: string | null;
}

export interface WelcomeTemplate {
  subject: string;
  html: string;
  text: string;
}
