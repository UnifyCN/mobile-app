import i18next from 'i18next';
import { tPlural } from '@/helpers/pluralKey';

const LOCALES = ['en', 'vi', 'es', 'hi', 'ar', 'fr-CA', 'pa'] as const;

// CLDR plural categories each shipped language needs a form for.
const REQUIRED_CATEGORIES: Record<(typeof LOCALES)[number], string[]> = {
  en: ['one', 'other'],
  vi: ['other'],
  es: ['one', 'many', 'other'],
  hi: ['one', 'other'],
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  'fr-CA': ['one', 'many', 'other'],
  pa: ['one', 'other'],
};

const load = (lang: string) =>
  require(`@/i18n/locales/${lang}/translation.json`) as {
    checklist: Record<string, Record<string, string>>;
  };

// Same options as i18n/index.ts, including compatibilityJSON 'v3'.
const makeT = async (lang: (typeof LOCALES)[number]) => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: lang,
    fallbackLng: 'en',
    resources: Object.fromEntries(
      LOCALES.map(l => [l, { translation: load(l) }])
    ),
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
  });
  return instance.t.bind(instance) as never;
};

describe.each(LOCALES)('arrival countdown copy (%s)', lang => {
  const copy = load(lang).checklist;

  it('defines every plural form the language needs', () => {
    for (const category of REQUIRED_CATEGORIES[lang]) {
      expect(copy.arrivalCountdown[`preArrival_${category}`]).toEqual(
        expect.any(String)
      );
    }
  });

  it('has a real translation for every non-plural string', () => {
    const en = load('en').checklist;
    const plain = [
      ['arrivalCountdown', 'first30Days'],
      ['arrivalCountdown', 'changeHint'],
      ['arrivalDate', 'sheetTitle'],
      ['arrivalDate', 'save'],
      ['arrivalDate', 'saveError'],
    ];
    for (const [group, key] of plain) {
      expect(copy[group][key]).toEqual(expect.any(String));
      if (lang !== 'en') expect(copy[group][key]).not.toBe(en[group][key]);
    }
  });

  it('renders a count in the pre-arrival form for 1 to 1000 days', async () => {
    const t = await makeT(lang);
    for (const days of [1, 2, 3, 5, 11, 21, 40, 100, 365, 1000]) {
      const text = tPlural(
        t,
        'checklist.arrivalCountdown.preArrival',
        days,
        lang
      );
      expect(text).not.toContain('preArrival');
      if (lang !== 'ar') expect(text).toContain(String(days));
    }
  });
});

describe('plural selection', () => {
  it('uses the singular in English only for 1', async () => {
    const t = await makeT('en');
    const key = 'checklist.arrivalCountdown.preArrival';
    expect(tPlural(t, key, 1, 'en')).toBe('1 day until you land');
    expect(tPlural(t, key, 40, 'en')).toBe('40 days until you land');
  });

  it('uses distinct Arabic forms for 1, 2, 5, 11, and 100', async () => {
    const t = await makeT('ar');
    const key = 'checklist.arrivalCountdown.preArrival';
    const forms = [1, 2, 5, 11, 100].map(n => tPlural(t, key, n, 'ar'));
    expect(new Set(forms).size).toBe(5);
  });

  it('falls back to the other form when a language lacks the category', async () => {
    const t = await makeT('vi');
    expect(
      tPlural(t, 'checklist.arrivalCountdown.preArrival', 1, 'vi')
    ).toContain('1');
  });
});
