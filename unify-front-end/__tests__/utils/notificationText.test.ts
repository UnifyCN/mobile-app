import {
  buildNotificationI18n,
  getNotificationText,
  readNotificationI18n,
} from '@/utils/notificationText';
import {
  NOTIFICATION_LANGUAGES,
  NOTIFICATION_TEMPLATES,
  FALLBACK_ACTOR_NAME,
} from '@/supabase/functions/_shared/notificationTemplates';
import en from '@/i18n/locales/en/translation.json';
import vi from '@/i18n/locales/vi/translation.json';
import es from '@/i18n/locales/es/translation.json';
import hi from '@/i18n/locales/hi/translation.json';
import ar from '@/i18n/locales/ar/translation.json';
import frCA from '@/i18n/locales/fr-CA/translation.json';

const LOCALES: Record<
  string,
  { notifications: { templates: Record<string, any> } }
> = {
  en,
  vi,
  es,
  hi,
  ar,
  'fr-CA': frCA,
};

/**
 * Minimal stand-in for i18next's `t`: resolves a dotted key against the EN
 * locale and interpolates `{{token}}`, echoing the key back when it is missing
 * (the behavior `getNotificationText` relies on to detect unknown templates).
 */
const makeT =
  (lang = 'en') =>
  (key: string, params?: Record<string, unknown>) => {
    const value = key
      .split('.')
      .reduce<any>(
        (acc, part) => (acc == null ? acc : acc[part]),
        LOCALES[lang]
      );
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, token) =>
      params?.[token] === undefined ? '' : String(params[token])
    );
  };

const t = makeT() as any;

describe('locale files mirror the shared edge-function templates', () => {
  it.each(NOTIFICATION_LANGUAGES)('%s has every template key', lang => {
    const templates = LOCALES[lang].notifications.templates;
    expect(typeof templates.fallbackName).toBe('string');
    expect(templates.fallbackName).toBe(FALLBACK_ACTOR_NAME[lang]);
    for (const [key, byLang] of Object.entries(NOTIFICATION_TEMPLATES)) {
      expect(templates[key]).toEqual({
        title: (byLang as any)[lang].title,
        body: (byLang as any)[lang].body,
      });
    }
  });
});

describe('readNotificationI18n', () => {
  it('returns null for rows without a payload', () => {
    expect(readNotificationI18n(null)).toBeNull();
    expect(readNotificationI18n({ post_id: 3 })).toBeNull();
    expect(readNotificationI18n({ i18n: { params: {} } })).toBeNull();
  });

  it('ignores a malformed params object', () => {
    expect(readNotificationI18n({ i18n: { key: 'liked', params: 7 } })).toEqual(
      {
        key: 'liked',
      }
    );
  });
});

describe('getNotificationText', () => {
  const row = { title: 'New follower', body: 'ana started following you.' };

  it('renders the template when data.i18n is present', () => {
    expect(
      getNotificationText(
        {
          ...row,
          data: { i18n: { key: 'followed', params: { name: 'Ana' } } },
        },
        t
      )
    ).toEqual({ title: 'New follower', body: 'Ana started following you.' });
  });

  it('falls back to the localized "Someone" when no name was stored', () => {
    const { body } = getNotificationText(
      { ...row, data: { i18n: { key: 'followed' } } },
      t
    );
    expect(body).toBe('Someone started following you.');
  });

  it('keeps the stored English when the row predates data.i18n', () => {
    expect(getNotificationText({ ...row, data: { post_id: 1 } }, t)).toEqual(
      row
    );
    expect(getNotificationText({ ...row, data: null }, t)).toEqual(row);
  });

  it('keeps the stored English for a template key this build does not know', () => {
    expect(
      getNotificationText({ ...row, data: { i18n: { key: 'futureKey' } } }, t)
    ).toEqual(row);
  });

  it('renders in the reader current language', () => {
    const { title, body } = getNotificationText(
      { ...row, data: { i18n: { key: 'liked', params: { name: 'Ana' } } } },
      makeT('fr-CA') as any
    );
    expect(title).toBe('Nouvelle mention J’aime sur votre publication');
    expect(body).toBe('Ana a aimé votre publication.');
  });
});

describe('buildNotificationI18n', () => {
  it('drops empty params so the reader resolves its own default', () => {
    expect(buildNotificationI18n('followed', { name: null })).toEqual({
      key: 'followed',
    });
    expect(buildNotificationI18n('followed', { name: '' })).toEqual({
      key: 'followed',
    });
    expect(buildNotificationI18n('followed', { name: 'Ana' })).toEqual({
      key: 'followed',
      params: { name: 'Ana' },
    });
  });
});
