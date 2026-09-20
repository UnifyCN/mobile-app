// Run with: deno test supabase/functions/_shared/notificationTemplates_test.ts
//
// The filename uses an underscore, not `.test.ts`, so jest-expo's default
// testMatch never picks it up (Deno APIs fail under jest).
import {
  assert,
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildI18n,
  DEFAULT_NOTIFICATION_LANGUAGE,
  FALLBACK_ACTOR_NAME,
  getPreferredLanguage,
  getPreferredLanguages,
  NOTIFICATION_LANGUAGES,
  NOTIFICATION_TEMPLATES,
  readI18nPayload,
  render,
  resolveNotificationLanguage,
  resolveNotificationText,
  type NotificationLanguageSource,
} from './notificationTemplates.ts';

const TEMPLATE_KEYS = Object.keys(NOTIFICATION_TEMPLATES) as Array<
  keyof typeof NOTIFICATION_TEMPLATES
>;

Deno.test('every template key has non-empty copy in every language', () => {
  for (const key of TEMPLATE_KEYS) {
    for (const lang of NOTIFICATION_LANGUAGES) {
      const entry = NOTIFICATION_TEMPLATES[key][lang];
      assert(entry, `${key}/${lang} missing`);
      assert(entry.title.trim().length > 0, `${key}/${lang} empty title`);
      assert(entry.body.trim().length > 0, `${key}/${lang} empty body`);
    }
  }
});

Deno.test('placeholders match English in every translation', () => {
  const tokens = (value: string) =>
    [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort();
  for (const key of TEMPLATE_KEYS) {
    const en = NOTIFICATION_TEMPLATES[key].en;
    for (const lang of NOTIFICATION_LANGUAGES) {
      const entry = NOTIFICATION_TEMPLATES[key][lang];
      assertEquals(
        tokens(entry.title),
        tokens(en.title),
        `${key}/${lang} title`
      );
      assertEquals(tokens(entry.body), tokens(en.body), `${key}/${lang} body`);
    }
  }
});

Deno.test('no template uses the i18next-reserved `count` param', () => {
  for (const key of TEMPLATE_KEYS) {
    for (const lang of NOTIFICATION_LANGUAGES) {
      const entry = NOTIFICATION_TEMPLATES[key][lang];
      assert(
        !/\{\{\s*count\s*\}\}/.test(`${entry.title} ${entry.body}`),
        `${key}/${lang} uses {{count}}`
      );
    }
  }
});

Deno.test('render interpolates the actor name per language', () => {
  assertEquals(render('followed', 'es', { name: 'Ana' }), {
    title: 'Nuevo seguidor',
    body: 'Ana empezó a seguirte.',
  });
  assertEquals(
    render('commentReply', 'vi', { name: 'Minh' })?.body,
    'Minh đã trả lời bình luận của bạn.'
  );
});

Deno.test(
  'render falls back to the localized "Someone" when name is missing',
  () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      const rendered = render('followed', lang);
      assert(rendered);
      assert(
        rendered.body.includes(FALLBACK_ACTOR_NAME[lang]),
        `${lang}: ${rendered.body}`
      );
      assert(!rendered.body.includes('{{'), `${lang} left a raw placeholder`);
    }
  }
);

Deno.test('render returns null for an unknown key', () => {
  assertStrictEquals(render('notATemplate', 'en'), null);
  assertStrictEquals(render('__proto__', 'en'), null);
});

Deno.test('unknown languages fall back, fr variants collapse to fr-CA', () => {
  assertEquals(resolveNotificationLanguage('fr'), 'fr-CA');
  assertEquals(resolveNotificationLanguage('fr-FR'), 'fr-CA');
  assertEquals(
    resolveNotificationLanguage('pt-BR'),
    DEFAULT_NOTIFICATION_LANGUAGE
  );
  assertEquals(
    resolveNotificationLanguage(null),
    DEFAULT_NOTIFICATION_LANGUAGE
  );
  assertEquals(resolveNotificationLanguage('hi'), 'hi');
  assertEquals(
    render('followed', 'pt-BR', { name: 'Ana' })?.title,
    'New follower'
  );
});

Deno.test('buildI18n drops empty params', () => {
  assertEquals(buildI18n('followed'), { key: 'followed' });
  assertEquals(buildI18n('followed', {}), { key: 'followed' });
  assertEquals(buildI18n('followed', { name: 'Ana' }), {
    key: 'followed',
    params: { name: 'Ana' },
  });
});

Deno.test('readI18nPayload tolerates malformed jsonb', () => {
  assertStrictEquals(readI18nPayload(null), null);
  assertStrictEquals(readI18nPayload('nope'), null);
  assertStrictEquals(readI18nPayload({}), null);
  assertStrictEquals(readI18nPayload({ i18n: { params: {} } }), null);
  assertEquals(readI18nPayload({ i18n: { key: 'followed', params: 'bad' } }), {
    key: 'followed',
  });
});

// --- send-social-push fallback path -----------------------------------------

const ROW = {
  title: 'New follower',
  body: 'ana liked your post.',
};

Deno.test('push text: localizes when data.i18n is present', () => {
  const text = resolveNotificationText(
    {
      ...ROW,
      data: {
        actor_user_id: 'x',
        i18n: { key: 'followed', params: { name: 'Ana' } },
      },
    },
    'fr-CA'
  );
  assertEquals(text, {
    title: 'Nouvel abonné',
    body: 'Ana vous suit maintenant.',
  });
});

Deno.test('push text: keeps stored English when data has no i18n', () => {
  assertEquals(
    resolveNotificationText({ ...ROW, data: { post_id: 7 } }, 'es'),
    ROW
  );
  assertEquals(resolveNotificationText({ ...ROW, data: null }, 'es'), ROW);
  assertEquals(resolveNotificationText(ROW, 'es'), ROW);
});

Deno.test('push text: keeps stored English for an unknown template key', () => {
  assertEquals(
    resolveNotificationText(
      { ...ROW, data: { i18n: { key: 'someFutureKey' } } },
      'ar'
    ),
    ROW
  );
});

// --- preferred language lookups ---------------------------------------------

function fakeClient(
  result: { data: unknown; error: unknown },
  seen: { table?: string; columns?: string; value?: unknown } = {}
): NotificationLanguageSource {
  return {
    from(table: string) {
      seen.table = table;
      return {
        select(columns: string) {
          seen.columns = columns;
          return {
            eq(_column: string, value: string) {
              seen.value = value;
              return {
                maybeSingle: () =>
                  Promise.resolve(
                    result as {
                      data: { preferred_language?: unknown } | null;
                      error: unknown;
                    }
                  ),
              };
            },
            in(_column: string, values: string[]) {
              seen.value = values;
              return Promise.resolve(
                result as {
                  data: Array<{
                    id: string;
                    preferred_language?: unknown;
                  }> | null;
                  error: unknown;
                }
              );
            },
          };
        },
      };
    },
  };
}

Deno.test('getPreferredLanguage reads user_onboarding_profiles', async () => {
  const seen: { table?: string; columns?: string; value?: unknown } = {};
  const lang = await getPreferredLanguage(
    fakeClient({ data: { preferred_language: 'ar' }, error: null }, seen),
    'user-1'
  );
  assertEquals(lang, 'ar');
  assertEquals(seen.table, 'user_onboarding_profiles');
  assertEquals(seen.value, 'user-1');
});

Deno.test(
  'getPreferredLanguage defaults to English on error or missing row',
  async () => {
    assertEquals(
      await getPreferredLanguage(
        fakeClient({ data: null, error: { message: 'boom' } }),
        'u'
      ),
      'en'
    );
    assertEquals(
      await getPreferredLanguage(fakeClient({ data: null, error: null }), 'u'),
      'en'
    );
    assertEquals(
      await getPreferredLanguage(
        fakeClient({ data: { preferred_language: null }, error: null }),
        'u'
      ),
      'en'
    );
  }
);

Deno.test(
  'getPreferredLanguages defaults every unknown user to English',
  async () => {
    const languages = await getPreferredLanguages(
      fakeClient({
        data: [
          { id: 'a', preferred_language: 'vi' },
          { id: 'b', preferred_language: 'klingon' },
        ],
        error: null,
      }),
      ['a', 'b', 'c', 'c']
    );
    assertEquals(languages.get('a'), 'vi');
    assertEquals(languages.get('b'), 'en');
    assertEquals(languages.get('c'), 'en');
    assertEquals(languages.size, 3);
  }
);
