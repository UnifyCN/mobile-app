import i18next from 'i18next';

import { PARTNERS, selectActivePartners } from '@/constants/Partners';
import {
  PARTNER_CATEGORY_LABEL_KEYS,
  type PartnerCategory,
} from '@/types/partner';
import { selectPartnersMatching } from '@/utils/searchPartners';
import {
  PARTNER_COPY_ROOT,
  localizePartner,
  localizePartners,
  partnerCopyKey,
  programCopyKey,
  programKeySegment,
} from '@/utils/localizePartner';
import en from '@/i18n/locales/en/translation.json';
import vi from '@/i18n/locales/vi/translation.json';
import es from '@/i18n/locales/es/translation.json';
import hi from '@/i18n/locales/hi/translation.json';
import ar from '@/i18n/locales/ar/translation.json';
import frCA from '@/i18n/locales/fr-CA/translation.json';
import pa from '@/i18n/locales/pa/translation.json';

/**
 * `constants/Partners.ts` holds structure and the locale files hold the copy,
 * so the two can drift apart in a way neither side notices: a new partner with
 * no copy block renders blank rows, and a deleted partner leaves orphan keys
 * that `check-i18n` happily keeps in sync across six files forever.
 *
 * These assertions close both directions. `check-i18n` still owns locale-to-
 * locale parity; this suite owns data-to-copy parity.
 */

const LOCALES = { en, vi, es, hi, ar, 'fr-CA': frCA, pa } as const;

/** Copy fields a partner block may carry, beyond its nested `programs`. */
const PARTNER_FIELDS = [
  'tagline',
  'description',
  'highlights',
  'serviceArea',
  'eligibility',
  'howToStart',
  'hours',
  'languages',
];
const REQUIRED_PARTNER_FIELDS = [
  'tagline',
  'description',
  'highlights',
  'serviceArea',
];
const PROGRAM_FIELDS = ['name', 'description', 'eligibility'];
const REQUIRED_PROGRAM_FIELDS = ['name', 'description'];

/** Walks a dotted i18n key against one locale; undefined when absent. */
function resolve(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<any>(
      (node, part) => (node == null ? undefined : node[part]),
      locale
    );
}

/** A `t` that reads one locale file, standing in for a live i18next instance. */
function translatorFor(locale: object) {
  return ((key: string, options?: { defaultValue?: unknown }) => {
    const value = resolve(locale, key);
    return value === undefined ? (options?.defaultValue ?? key) : value;
  }) as any;
}

const copyTree = (locale: object) =>
  resolve(locale, PARTNER_COPY_ROOT) as Record<string, any>;

describe('partner copy lives in the locale files', () => {
  it('Partners.ts carries no display copy of its own', () => {
    // A record that still holds a string field is copy that never reaches a
    // non-English speaker, which is the whole point of the split.
    for (const partner of PARTNERS) {
      for (const field of PARTNER_FIELDS) {
        expect({
          slug: partner.slug,
          field,
          present: field in partner,
        }).toEqual({ slug: partner.slug, field, present: false });
      }
      for (const program of partner.programs ?? []) {
        for (const field of PROGRAM_FIELDS) {
          expect({
            id: program.id,
            field,
            present: field in program,
          }).toEqual({ id: program.id, field, present: false });
        }
      }
    }
  });

  it('every partner has its required copy in the en baseline', () => {
    for (const partner of PARTNERS) {
      for (const field of REQUIRED_PARTNER_FIELDS) {
        const value = resolve(en, partnerCopyKey(partner.slug, field));
        expect({ slug: partner.slug, field, ok: value != null }).toEqual({
          slug: partner.slug,
          field,
          ok: true,
        });
      }
      const description = resolve(
        en,
        partnerCopyKey(partner.slug, 'description')
      ) as string;
      expect(description.length).toBeGreaterThan(20);
      const highlights = resolve(
        en,
        partnerCopyKey(partner.slug, 'highlights')
      ) as string[];
      expect(Array.isArray(highlights)).toBe(true);
      expect(highlights.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every program has its required copy in the en baseline', () => {
    for (const partner of PARTNERS) {
      for (const program of partner.programs ?? []) {
        for (const field of REQUIRED_PROGRAM_FIELDS) {
          const value = resolve(
            en,
            programCopyKey(partner.slug, program.id, field)
          );
          expect({
            id: program.id,
            field,
            ok: typeof value === 'string',
          }).toEqual({ id: program.id, field, ok: true });
        }
        const description = resolve(
          en,
          programCopyKey(partner.slug, program.id, 'description')
        ) as string;
        expect(description.length).toBeGreaterThan(10);
      }
    }
  });

  it('the copy tree holds no orphans — every block maps to a live record', () => {
    const tree = copyTree(en);
    const bySlug = new Map(PARTNERS.map(p => [p.slug, p]));
    for (const [slug, block] of Object.entries(tree)) {
      const partner = bySlug.get(slug);
      expect({ slug, isAPartner: Boolean(partner) }).toEqual({
        slug,
        isAPartner: true,
      });
      const programKeys = new Set(
        (partner!.programs ?? []).map(p => programKeySegment(slug, p.id))
      );
      for (const field of Object.keys(block)) {
        if (field === 'programs') {
          for (const key of Object.keys(block.programs)) {
            expect({ slug, key, isAProgram: programKeys.has(key) }).toEqual({
              slug,
              key,
              isAProgram: true,
            });
            for (const pfield of Object.keys(block.programs[key])) {
              expect(PROGRAM_FIELDS).toContain(pfield);
            }
          }
          continue;
        }
        expect(PARTNER_FIELDS).toContain(field);
      }
    }
  });

  it.each(Object.keys(LOCALES))(
    '%s ships a copy block for every partner and program',
    name => {
      const locale = LOCALES[name as keyof typeof LOCALES];
      const tree = copyTree(locale);
      expect(Object.keys(tree).sort()).toEqual(
        PARTNERS.map(p => p.slug).sort()
      );
      for (const partner of PARTNERS) {
        const programKeys = (partner.programs ?? []).map(p =>
          programKeySegment(partner.slug, p.id)
        );
        const shipped = Object.keys(tree[partner.slug].programs ?? {});
        expect({ slug: partner.slug, programs: shipped.sort() }).toEqual({
          slug: partner.slug,
          programs: [...programKeys].sort(),
        });
      }
    }
  );

  it('the retired English-only notice key is gone from every locale', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      expect({
        locale: name,
        hasNotice:
          resolve(locale, 'learn.resources.contentLanguageNotice') !==
          undefined,
      }).toEqual({ locale: name, hasNotice: false });
    }
  });
});

describe('localizePartner', () => {
  const diversecity = PARTNERS.find(p => p.slug === 'diversecity')!;

  it('resolves copy for the active language without touching structure', () => {
    const localized = localizePartner(diversecity, translatorFor(en));
    expect(localized.slug).toBe('diversecity');
    expect(localized.name).toBe('DIVERSEcity');
    expect(localized.tagline).toBe(
      resolve(en, partnerCopyKey('diversecity', 'tagline'))
    );
    expect(localized.highlights.length).toBeGreaterThanOrEqual(2);
    expect(localized.languages).toContain('English');
    expect(localized.programs?.map(p => p.id)).toEqual(
      diversecity.programs?.map(p => p.id)
    );
    expect(localized.programs?.[1].name).toBe('English Classes (LINC)');
  });

  it('returns the same partner in a different language', () => {
    const english = localizePartner(diversecity, translatorFor(en));
    const spanish = localizePartner(diversecity, translatorFor(es));
    expect(spanish.name).toBe(english.name);
    expect(spanish.description).not.toBe(english.description);
    expect(spanish.description.length).toBeGreaterThan(20);
  });

  it('leaves an unpublished optional field absent rather than blank', () => {
    // The detail screen hides a whole contact row on `undefined` and would
    // render an empty labelled row on ''.
    const bare = localizePartner(
      { ...diversecity, slug: 'not-in-the-locale-files' },
      translatorFor(en)
    );
    expect(bare.eligibility).toBeUndefined();
    expect(bare.hours).toBeUndefined();
    expect(bare.languages).toBeUndefined();
    expect(bare.highlights).toEqual([]);
  });

  it('derives a program key by stripping its partner slug', () => {
    expect(programKeySegment('diversecity', 'diversecity-linc')).toBe('linc');
    // A malformed id degrades to a missing key, not a wrong one.
    expect(programKeySegment('diversecity', 'elsewhere-linc')).toBe(
      'elsewhere-linc'
    );
  });
});

describe('localizePartner against a real i18next instance', () => {
  // The stub above proves the key derivation. This proves the i18next calls
  // themselves — in particular that `returnObjects` gives back the highlights
  // array rather than i18next's "accessing an object" warning string, and that
  // a missing optional key falls through to the defaultValue.
  const instance = i18next.createInstance();
  const diversecity = PARTNERS.find(p => p.slug === 'diversecity')!;

  beforeAll(async () => {
    await instance.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en }, es: { translation: es } },
      interpolation: { escapeValue: false },
    });
  });

  it('resolves strings, arrays and absent optionals', () => {
    const localized = localizePartner(diversecity, instance.t);
    expect(localized.tagline).toBe(
      'Culturally safe programs across education, employment & wellbeing.'
    );
    expect(Array.isArray(localized.highlights)).toBe(true);
    expect(localized.highlights).toHaveLength(3);
    expect(localized.languages).toContain('English');
    // DIVERSEcity publishes no opening hours, so the row must not render.
    expect(localized.hours).toBeUndefined();
    expect(localized.programs?.[1].name).toBe('English Classes (LINC)');
    // Optional program copy stays absent rather than becoming ''.
    expect(localized.programs?.[1].eligibility).toBeUndefined();
    expect(localized.programs?.[0].eligibility).toBeTruthy();
  });

  it('follows a language change', async () => {
    await instance.changeLanguage('es');
    const localized = localizePartner(diversecity, instance.t);
    expect(localized.name).toBe('DIVERSEcity');
    expect(localized.tagline).toBe(
      (es as any).learn.resources.partners.diversecity.tagline
    );
    expect(localized.highlights).toHaveLength(3);
    await instance.changeLanguage('en');
  });
});

describe('search runs over the translated directory', () => {
  // The whole point of moving copy into the locale files: a Spanish speaker
  // types Spanish and finds the listing. Before this, the search index was the
  // English copy deck no matter what language the screen was in.
  const instance = i18next.createInstance();
  const labelFor = (category: PartnerCategory) =>
    instance.t(PARTNER_CATEGORY_LABEL_KEYS[category]);

  beforeAll(async () => {
    await instance.init({
      lng: 'es',
      fallbackLng: 'en',
      resources: { en: { translation: en }, es: { translation: es } },
      interpolation: { escapeValue: false },
    });
  });

  const directory = () =>
    localizePartners(selectActivePartners(PARTNERS), instance.t);

  it('matches a Spanish tagline that has no English counterpart', () => {
    const hits = selectPartnersMatching(directory(), 'espacios', labelFor);
    expect(hits.map(p => p.slug)).toContain('burnaby-public-library');
    // The English word is not in the Spanish index.
    expect(
      selectPartnersMatching(directory(), 'inclusive spaces', labelFor)
    ).toEqual([]);
  });

  it('matches a translated service area', () => {
    const hits = selectPartnersMatching(directory(), 'sucursales', labelFor);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('still matches an organization name, which never translates', () => {
    const hits = selectPartnersMatching(directory(), 'diversecity', labelFor);
    expect(hits.map(p => p.slug)).toEqual(['diversecity']);
  });
});
