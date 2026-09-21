import {
  PARTNERS,
  selectActivePartners,
  getActivePartners,
  getPartnersByCategory,
  getCategoriesWithPartners,
  getPartnerBySlug,
  selectActivePartnerBySlug,
} from '@/constants/Partners';
import { CATEGORY_ORDER, type PartnerCategory } from '@/types/partner';
import { programKeySegment } from '@/utils/localizePartner';
import en from '@/i18n/locales/en/translation.json';

describe('partner data', () => {
  it('has 20 partners with unique slugs, and only the held one inactive', () => {
    expect(PARTNERS).toHaveLength(20);
    expect(new Set(PARTNERS.map(p => p.slug)).size).toBe(20);
    // Named rather than counted, so a second listing cannot go dark unnoticed.
    // global-connect-immigration is held because its published RCIC number is
    // the placeholder R123456 — see .design/state.json.
    expect(PARTNERS.filter(p => !p.active).map(p => p.slug)).toEqual([
      'global-connect-immigration',
    ]);
  });

  // A category with a single org reads as an oversight in a directory shown
  // to partner agencies, so this is a shipping rule, not a nicety.
  //
  // Insurance and Money are deliberate exceptions: each launched with one
  // named commercial partner (TuGo, Desjardins) rather than being held back.
  // They are listed here so a thin category fails the build instead of
  // slipping in unnoticed.
  //
  // Immigration Help is a TEMPORARY exception. It has two listings, but
  // global-connect-immigration is held inactive pending verification, leaving
  // one. Remove it from this list once that listing is verified or replaced —
  // the category should not ship thin for long, because a single paid
  // consultancy reads as an endorsement.
  const SINGLE_ORG_EXCEPTIONS: PartnerCategory[] = [
    'immigrationHelp',
    'insurance',
    'money',
  ];

  it('no category ships with fewer than 2 partners, except the known singles', () => {
    const thin = getCategoriesWithPartners()
      .filter(c => c.partnerCount < 2)
      .map(c => c.category);
    expect(thin.sort()).toEqual([...SINGLE_ORG_EXCEPTIONS].sort());
  });

  // Display copy is asserted in partnerCopy.test.ts, against the locale files
  // that now hold it.
  it('every partner has required fields + a valid category', () => {
    for (const p of PARTNERS) {
      expect(p.name).toBeTruthy();
      expect(p.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(CATEGORY_ORDER).toContain(p.category);
    }
  });

  it('every website is a valid http(s) URL', () => {
    for (const p of PARTNERS) {
      if (p.website) expect(p.website).toMatch(/^https?:\/\/.+/);
    }
  });

  it('getCategoriesWithPartners returns categories in CATEGORY_ORDER with correct counts', () => {
    const cats = getCategoriesWithPartners();
    expect(cats.map(c => c.category)).toEqual([
      'gettingSettled',
      'findWork',
      'immigrationHelp',
      'librariesLearning',
      'communityBelonging',
      'networksPlanning',
      'internationalStudents',
      'insurance',
      'money',
    ]);
    const counts = Object.fromEntries(
      cats.map(c => [c.category, c.partnerCount])
    );
    expect(counts).toEqual({
      gettingSettled: 3,
      findWork: 2,
      // 1, not 2, while global-connect-immigration is held inactive.
      immigrationHelp: 1,
      librariesLearning: 3,
      communityBelonging: 3,
      networksPlanning: 3,
      internationalStudents: 2,
      insurance: 1,
      money: 1,
    });
  });

  it('getPartnersByCategory returns only that category, sorted by displayOrder', () => {
    const libs = getPartnersByCategory('librariesLearning' as PartnerCategory);
    expect(libs).toHaveLength(3);
    expect(libs.every(p => p.category === 'librariesLearning')).toBe(true);
    const orders = libs.map(p => p.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('getPartnerBySlug resolves a known slug and returns undefined otherwise', () => {
    expect(getPartnerBySlug('diversecity')?.name).toBe('DIVERSEcity');
    expect(getPartnerBySlug('does-not-exist')).toBeUndefined();
  });

  it('does not resolve inactive partners by slug', () => {
    const inactive = { ...PARTNERS[0], active: false };
    expect(
      selectActivePartnerBySlug([inactive], inactive.slug)
    ).toBeUndefined();
  });

  it('getActivePartners returns every active partner, sorted by displayOrder', () => {
    const active = getActivePartners();
    // 19 of 20: global-connect-immigration is held inactive.
    expect(active).toHaveLength(19);
    expect(active.every(p => p.active)).toBe(true);
    const orders = active.map(p => p.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('selectActivePartners drops inactive partners and sorts the rest', () => {
    // Every shipped partner is active, so feed the real filter a list that
    // isn't — this exercises the helper instead of re-implementing it.
    const inactive = { ...PARTNERS[0], slug: 'test-inactive', active: false };
    const result = selectActivePartners([
      inactive,
      { ...PARTNERS[0], slug: 'b', active: true, displayOrder: 2 },
      { ...PARTNERS[0], slug: 'a', active: true, displayOrder: 1 },
    ]);
    expect(result.map(p => p.slug)).toEqual(['a', 'b']);
  });

  it('any partner programs have stable unique IDs and well-formed links', () => {
    const programIds = new Set<string>();
    for (const p of PARTNERS) {
      for (const program of p.programs ?? []) {
        expect(program.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(programIds.has(program.id)).toBe(false);
        programIds.add(program.id);
        // url is optional — not every partner publishes a page per program.
        if (program.url) expect(program.url).toMatch(/^https?:\/\/.+/);
      }
    }
  });

  it('program IDs are namespaced by their partner slug', () => {
    // The detail screen reports program.id to analytics. Namespacing keeps two
    // partners running a same-named program from colliding in the funnel.
    for (const p of PARTNERS) {
      for (const program of p.programs ?? []) {
        expect(program.id.startsWith(`${p.slug}-`)).toBe(true);
      }
    }
  });

  it('every partner lists programs, except the documented exceptions', () => {
    // The detail screen leads with Programs, so a partner without any renders
    // About straight into Contact. That is allowed but should stay deliberate.
    const NO_PROGRAMS = new Set(['newcomer-jobs-canada']);
    for (const p of PARTNERS.filter(x => x.active)) {
      const count = p.programs?.length ?? 0;
      expect({ slug: p.slug, hasPrograms: count > 0 }).toEqual({
        slug: p.slug,
        hasPrograms: !NO_PROGRAMS.has(p.slug),
      });
    }
  });

  it('IEC-BC leads with the two programs a newcomer can join', () => {
    // Asserted through the copy tree, because the name is no longer on the
    // record — the ordering rule is the point, not where the string lives.
    const iecbc = getPartnerBySlug('iec-bc');
    const leading = iecbc?.programs?.slice(0, 2) ?? [];
    expect(leading.map(pr => pr.id)).toEqual([
      'iec-bc-talentconnect',
      'iec-bc-mentorconnect',
    ]);
    expect(
      leading.map(
        pr =>
          (en as any).learn.resources.partners['iec-bc'].programs[
            programKeySegment('iec-bc', pr.id)
          ].name
      )
    ).toEqual(['TalentConnect', 'MentorConnect']);
  });
});
