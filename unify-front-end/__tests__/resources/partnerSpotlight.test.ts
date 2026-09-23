import {
  PARTNERS,
  isVerifiedPartner,
  selectSpotlightPartner,
} from '@/constants/Partners';
import {
  COMPANION_SPOTLIGHT_THRESHOLD,
  IMMIGRATION_CHECKLIST_IDS,
  IMMIGRATION_MODULE_IDS,
  baseSanityId,
  firstPartnerHelpKey,
  isImmigrationChecklistItem,
  isImmigrationModule,
  shouldShowCompanionSpotlight,
} from '@/constants/PartnerSpotlight';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';
import { PARTNER_CATEGORY_TINTS, type Partner } from '@/types/partner';
import {
  buildPartnerUrl,
  parsePartnerCtaSource,
  partnerDetailHref,
} from '@/utils/partners';

const base: Partner = {
  slug: 'acme',
  name: 'Acme',
  category: 'immigrationHelp',
  partnershipType: 'referral',
  website: 'https://example.com/unify/',
  displayOrder: 0,
  active: true,
};

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = hex
      .slice(1)
      .match(/.{2}/g)!
      .map(v => parseInt(v, 16) / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a
  );
  return (hi + 0.05) / (lo + 0.05);
}

describe('spotlight partner selection', () => {
  it('ships exactly one active spotlight partner', () => {
    expect(PARTNERS.filter(p => p.active && p.spotlight)).toHaveLength(1);
  });

  it('skips inactive spotlight partners', () => {
    expect(
      selectSpotlightPartner([{ ...base, spotlight: true, active: false }])
    ).toBeUndefined();
  });

  it('returns undefined when no partner is in the spotlight', () => {
    expect(selectSpotlightPartner([base])).toBeUndefined();
  });

  it('the spotlight partner has a website to book through', () => {
    expect(selectSpotlightPartner(PARTNERS)?.website).toBeTruthy();
  });
});

describe('isVerifiedPartner', () => {
  it('needs both a referral relationship and a human verification date', () => {
    expect(isVerifiedPartner({ ...base, lastVerified: '2026-09-18' })).toBe(
      true
    );
    expect(isVerifiedPartner(base)).toBe(false);
    expect(
      isVerifiedPartner({
        ...base,
        partnershipType: 'resource',
        lastVerified: '2026-09-18',
      })
    ).toBe(false);
  });

  it('the spotlight partner carries the chip', () => {
    expect(isVerifiedPartner(selectSpotlightPartner(PARTNERS)!)).toBe(true);
  });
});

describe('immigration content matching', () => {
  const pr = '9717e260-bdeb-4ee4-8d39-4159a48eb627';

  it('strips every locale suffix from a Sanity id', () => {
    expect(baseSanityId(`${pr}-es`)).toBe(pr);
    expect(baseSanityId(`${pr}-fr-CA`)).toBe(pr);
    expect(baseSanityId(pr)).toBe(pr);
  });

  it('matches translated modules and checklist items by base id', () => {
    expect(isImmigrationModule(`${pr}-vi`)).toBe(true);
    const item = [...IMMIGRATION_CHECKLIST_IDS][0];
    expect(isImmigrationChecklistItem(`${item}-ar`)).toBe(true);
  });

  it('rejects other ids and empty values', () => {
    expect(isImmigrationModule('4044e0bc-d26b-4a1e-9b7d-6a5e95c7f8ce')).toBe(
      false
    );
    expect(isImmigrationChecklistItem(null)).toBe(false);
    expect(isImmigrationChecklistItem(undefined)).toBe(false);
    expect(isImmigrationModule('')).toBe(false);
  });

  it('allowlists hold only base-language UUIDs', () => {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const id of [
      ...IMMIGRATION_CHECKLIST_IDS,
      ...IMMIGRATION_MODULE_IDS,
    ]) {
      expect(id).toMatch(uuid);
    }
  });
});

describe('firstPartnerHelpKey', () => {
  const [a, b] = [...IMMIGRATION_CHECKLIST_IDS];

  it('picks the first open immigration item in display order', () => {
    expect(
      firstPartnerHelpKey([
        { key: 'tax', sanityId: 'not-immigration', completed: false },
        { key: 'done', sanityId: a, completed: true },
        { key: 'first', sanityId: `${b}-es`, completed: false },
        { key: 'second', sanityId: a, completed: false },
      ])
    ).toBe('first');
  });

  it('returns undefined when no open immigration item exists', () => {
    expect(
      firstPartnerHelpKey([{ key: 'done', sanityId: a, completed: true }])
    ).toBeUndefined();
  });
});

describe('shouldShowCompanionSpotlight', () => {
  it('waits for the threshold of immigration answers', () => {
    expect(
      shouldShowCompanionSpotlight(COMPANION_SPOTLIGHT_THRESHOLD - 1, false)
    ).toBe(false);
    expect(
      shouldShowCompanionSpotlight(COMPANION_SPOTLIGHT_THRESHOLD, false)
    ).toBe(true);
  });

  it('never returns once closed', () => {
    expect(shouldShowCompanionSpotlight(10, true)).toBe(false);
  });
});

describe('spotlight attribution', () => {
  it('parses only known sources', () => {
    expect(parsePartnerCtaSource('companion_ai')).toBe('companion_ai');
    expect(parsePartnerCtaSource('checklist_link')).toBe('checklist_link');
    expect(parsePartnerCtaSource('learn_module')).toBe('learn_module');
    expect(parsePartnerCtaSource('resources_spotlight')).toBe(
      'resources_spotlight'
    );
    expect(parsePartnerCtaSource('evil')).toBeUndefined();
    expect(parsePartnerCtaSource(['companion_ai'])).toBeUndefined();
    expect(parsePartnerCtaSource(undefined)).toBeUndefined();
  });

  it('carries the surface to the detail route and the CTA', () => {
    expect(partnerDetailHref('acme', 'checklist_link')).toBe(
      '/(tabs)/Learn/resources/acme?via=checklist_link'
    );
    expect(buildPartnerUrl(base, 'companion_ai')).toContain(
      'utm_medium=companion_ai'
    );
  });
});

describe('spotlight row contrast', () => {
  it('title and secondary text meet WCAG AA on the category tint', () => {
    const tint = PARTNER_CATEGORY_TINTS.immigrationHelp;
    expect(contrastRatio(RESOURCE_THEME.textCard, tint)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(
      contrastRatio(RESOURCE_THEME.textSecondary, tint)
    ).toBeGreaterThanOrEqual(4.5);
  });
});
