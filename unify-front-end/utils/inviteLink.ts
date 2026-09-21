import { APP_STORE_URL } from '@/constants/appStore';

export const INVITE_CLIPBOARD_PREFIX = 'unify-invite:';

// Alphabet matches the server generator: A-Z minus I and O, digits 2-9 (no 0 or 1).
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const PREFIXED_RE = /unify-invite:([A-HJ-NP-Z2-9]{6})/;

export function isInviteCode(value: string): boolean {
  return CODE_RE.test(value);
}

export function parseInviteCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (CODE_RE.test(trimmed)) return trimmed;
  const m = trimmed.match(PREFIXED_RE);
  return m ? m[1] : null;
}

export function clipboardPayload(code: string): string {
  return `${INVITE_CLIPBOARD_PREFIX}${code}`;
}

interface InviterContext {
  username: string;
  city?: string | null;
  code: string;
}

/**
 * Minimal shape of i18next's `t`. Declared locally so this module keeps no
 * react-i18next import and stays usable from plain unit tests.
 */
export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

export function formatInviteMessage(
  t: TranslateFn,
  inviter: InviterContext
): string {
  const name = inviter.username?.trim();
  const sender = !name
    ? t('referrals.inviteSenderFallback')
    : inviter.city
      ? t('referrals.inviteSenderWithCity', { name, city: inviter.city })
      : name;
  // The canonical `unify-invite:CODE` form is also embedded so that if the
  // recipient copies the message (or any chunk containing the canonical form)
  // and the app reads their clipboard on first launch, parseInviteCode finds
  // it via PREFIXED_RE. The bare-code line is the human-readable fallback for
  // manual entry in onboarding step 3.
  return (
    `${t('referrals.inviteMessageIntro', { sender, url: APP_STORE_URL })}\n\n` +
    `${t('referrals.inviteMessageCode', { code: inviter.code })}\n` +
    `${INVITE_CLIPBOARD_PREFIX}${inviter.code}`
  );
}

export function buildShareUrl(): string {
  return APP_STORE_URL;
}
