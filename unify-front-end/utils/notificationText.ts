import type { TFunction } from 'i18next';

/**
 * Structured notification copy carried in `community_notifications.data.i18n`.
 *
 * Rows keep an English `title`/`body` for builds shipped before this contract
 * existed. Newer writers add `data.i18n = { key, params }`, which lets every
 * reader re-render the notification in the recipient's current language.
 *
 * Template strings live under `notifications.templates.<key>` in each locale
 * file and are mirrored by `supabase/functions/_shared/notificationTemplates.ts`
 * for the push path.
 */
export interface NotificationI18nPayload {
  key: string;
  params?: Record<string, string | number>;
}

export interface NotificationTextSource {
  title: string;
  body: string;
  data?: unknown;
}

const TEMPLATE_PREFIX = 'notifications.templates.';

/** Defensive read of `data.i18n` — the column is untyped jsonb. */
export function readNotificationI18n(
  data: unknown
): NotificationI18nPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const i18n = (data as Record<string, unknown>).i18n;
  if (typeof i18n !== 'object' || i18n === null) return null;
  const { key, params } = i18n as Record<string, unknown>;
  if (typeof key !== 'string' || key === '') return null;
  if (typeof params !== 'object' || params === null) return { key };
  return { key, params: params as Record<string, string | number> };
}

/**
 * Localized title/body for a notification row.
 *
 * Falls back to the stored English whenever the row predates the contract or
 * names a template key this build does not know (an older app reading a newer
 * row). The actor name defaults to the localized "Someone" when the writer
 * could not resolve a username.
 */
export function getNotificationText(
  notification: NotificationTextSource,
  t: TFunction
): { title: string; body: string } {
  const payload = readNotificationI18n(notification.data);
  if (!payload) {
    return { title: notification.title, body: notification.body };
  }

  const params = { ...(payload.params ?? {}) };
  if (params.name === undefined || params.name === '') {
    params.name = t(`${TEMPLATE_PREFIX}fallbackName`);
  }

  const titleKey = `${TEMPLATE_PREFIX}${payload.key}.title`;
  const bodyKey = `${TEMPLATE_PREFIX}${payload.key}.body`;
  const title = t(titleKey, params);
  const body = t(bodyKey, params);

  // i18next echoes the key back when it is missing — that means this build
  // does not ship the template, so the stored English is the better answer.
  if (title === titleKey || body === bodyKey) {
    return { title: notification.title, body: notification.body };
  }

  return { title, body };
}

/**
 * Build the `data.i18n` payload a writer stores next to the English copy.
 * Empty params are dropped so the reader resolves its own localized default
 * (e.g. the "Someone" fallback name).
 */
export function buildNotificationI18n(
  key: string,
  params?: Record<string, string | number | null | undefined>
): NotificationI18nPayload {
  const cleaned: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    cleaned[name] = value;
  }
  return Object.keys(cleaned).length > 0 ? { key, params: cleaned } : { key };
}
