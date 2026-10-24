import {
  PARTNERS,
  selectActivePartners,
  getActivePartners,
  getPartnersByCategory,
  getCategoriesWithPartners,
  getPartnerBySlug,
  getSpotlightPartner,
  selectActivePartnerBySlug,
} from '@/constants/Partners';
import {
  CATEGORY_ORDER,
  type Partner,
  type PartnerCategory,
} from '@/types/partner';
import { PROVINCES } from '@/supabase/functions/_shared/province';
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
  //
  // Money is not listed: its one partner, Desjardins, serves Quebec and
  // Ontario only, so a BC reader (whose directory this audits) has no Money
  // category at all.
  const SINGLE_ORG_EXCEPTIONS: PartnerCategory[] = [
    'immigrationHelp',
    'insurance',
  ];

  it('no category ships with fewer than 2 partners, except the known singles', () => {
    const thin = getCategoriesWithPartners('British Columbia')
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
    // A BC reader: Desjardins serves Quebec and Ontario only, so Money &
    // Banking has no BC listing and drops out of the grid.
    const cats = getCategoriesWithPartners('British Columbia');
    expect(cats.map(c => c.category)).toEqual([
      'gettingSettled',
      'findWork',
      'immigrationHelp',
      'librariesLearning',
      'communityBelonging',
      'networksPlanning',
      'internationalStudents',
      'insurance',
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
    });
  });

  it('getPartnersByCategory returns only that category, sorted by displayOrder', () => {
    const libs = getPartnersByCategory(
      'librariesLearning' as PartnerCategory,
      'British Columbia'
    );
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

  it('getActivePartners returns every active partner a BC reader may see, sorted by displayOrder', () => {
    const active = getActivePartners('British Columbia');
    // 19 of 20 are active (global-connect-immigration is held), and Desjardins
    // is Quebec and Ontario only, so 18 reach a BC reader.
    expect(active).toHaveLength(18);
    expect(active.every(p => p.active)).toBe(true);
    const orders = active.map(p => p.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('selectActivePartners drops inactive partners and sorts the rest', () => {
    // Every shipped partner is active, so feed the real filter a list that
    // isn't — this exercises the helper instead of re-implementing it.
    const inactive = { ...PARTNERS[0], slug: 'test-inactive', active: false };
    const result = selectActivePartners(
      [
        inactive,
        { ...PARTNERS[0], slug: 'b', active: true, displayOrder: 2 },
        { ...PARTNERS[0], slug: 'a', active: true, displayOrder: 1 },
      ],
      'British Columbia'
    );
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

describe('partner province eligibility', () => {
  const base = PARTNERS[0];
  const fixture = (
    slug: string,
    provinces?: Partner['provinces']
  ): Partner => ({
    ...base,
    slug,
    provinces,
    active: true,
  });
  const DIRECTORY: Partner[] = [
    fixture('bc-only', ['British Columbia']),
    fixture('bc-and-ab', ['British Columbia', 'Alberta']),
    fixture('national'),
    fixture('national-empty-list', []),
  ];
  const slugs = (list: Partner[]) => list.map(p => p.slug).sort();

  it('shows a user in Ontario national partners only', () => {
    expect(slugs(selectActivePartners(DIRECTORY, 'Ontario'))).toEqual([
      'national',
      'national-empty-list',
    ]);
  });

  it('shows a BC user every partner that lists BC, plus national ones', () => {
    expect(slugs(selectActivePartners(DIRECTORY, 'British Columbia'))).toEqual([
      'bc-and-ab',
      'bc-only',
      'national',
      'national-empty-list',
    ]);
  });

  it('shows a multi-province partner only in its listed provinces', () => {
    expect(slugs(selectActivePartners(DIRECTORY, 'Alberta'))).toEqual([
      'bc-and-ab',
      'national',
      'national-empty-list',
    ]);
  });

  it('shows a user with no province, or an unrecognized one, national partners only', () => {
    const national = ['national', 'national-empty-list'];
    expect(slugs(selectActivePartners(DIRECTORY, null))).toEqual(national);
    expect(slugs(selectActivePartners(DIRECTORY, undefined))).toEqual(national);
    expect(slugs(selectActivePartners(DIRECTORY, 'Somewhere Else'))).toEqual(
      national
    );
  });

  it('still drops inactive partners and sorts by displayOrder', () => {
    const result = selectActivePartners(
      [
        { ...fixture('later', ['Ontario']), displayOrder: 2 },
        { ...fixture('hidden', ['Ontario']), active: false },
        { ...fixture('first', ['Ontario']), displayOrder: 1 },
      ],
      'Ontario'
    );
    expect(result.map(p => p.slug)).toEqual(['first', 'later']);
  });

  // The shipped classification. Eligibility wins over delivery channel: an
  // online service only for BC residents is a BC partner. Evidence for the
  // uncertain calls is in the #336 hand-off report.
  const NATIONAL = [
    'canada-shaw-immigration', // RCIC consultancy, clients worldwide
    'newcomer-jobs-canada', // national job board
    'tugo', // licensed in every province and territory
  ];
  const ACTIVE_SLUGS = PARTNERS.filter(p => p.active).map(p => p.slug);

  it('shows a user in Ontario the national partners and Desjardins, and no BC-only partner', () => {
    expect(slugs(getActivePartners('Ontario'))).toEqual(
      [...NATIONAL, 'desjardins'].sort()
    );
  });

  it('shows a user in Quebec the same set as Ontario', () => {
    expect(slugs(getActivePartners('Quebec'))).toEqual(
      slugs(getActivePartners('Ontario'))
    );
  });

  it('shows a user in Alberta, with no province, or with an unknown one only the national partners', () => {
    expect(slugs(getActivePartners('Alberta'))).toEqual([...NATIONAL].sort());
    expect(slugs(getActivePartners(null))).toEqual([...NATIONAL].sort());
    expect(slugs(getActivePartners('Somewhere Else'))).toEqual(
      [...NATIONAL].sort()
    );
  });

  it('keeps every other currently active partner for a BC user', () => {
    // Desjardins publishes "You are a resident of Quebec or Ontario" as an
    // eligibility rule, so it is the one active partner a BC user no longer
    // sees. A second name appearing here is a regression.
    expect(slugs(getActivePartners('British Columbia'))).toEqual(
      ACTIVE_SLUGS.filter(slug => slug !== 'desjardins').sort()
    );
  });

  it('lists the categories that have a partner for the reader', () => {
    expect(getCategoriesWithPartners('Ontario')).toEqual([
      { category: 'findWork', partnerCount: 1 },
      { category: 'immigrationHelp', partnerCount: 1 },
      { category: 'insurance', partnerCount: 1 },
      { category: 'money', partnerCount: 1 },
    ]);
    expect(getCategoriesWithPartners(null).map(c => c.category)).toEqual([
      'findWork',
      'immigrationHelp',
      'insurance',
    ]);
  });

  it('types every province tag to the 13 names, with no empty or repeated list', () => {
    for (const p of PARTNERS) {
      if (p.provinces === undefined) continue;
      expect(p.provinces.length).toBeGreaterThan(0);
      expect(new Set(p.provinces).size).toBe(p.provinces.length);
      for (const province of p.provinces) expect(PROVINCES).toContain(province);
    }
  });

  it('keeps the promoted spotlight partner national', () => {
    // The Companion banner and the Checklist help rows show it to everyone.
    expect(getSpotlightPartner()?.provinces).toBeUndefined();
  });
});

describe('partner province aliases (selector boundary)', () => {
  const ids = (list: Partner[]) => list.map(p => p.slug);
  const canonical = (province: string) => ids(getActivePartners(province));

  it('treats stored BC spellings exactly like British Columbia', () => {
    const expected = canonical('British Columbia');
    expect(expected.length).toBeGreaterThan(1);
    for (const alias of ['BC', 'bc', 'B.C.', ' b.c ']) {
      expect(ids(getActivePartners(alias))).toEqual(expected);
    }
  });

  it('treats stored ON and QC spellings exactly like the full names', () => {
    expect(ids(getActivePartners('ON'))).toEqual(canonical('Ontario'));
    expect(ids(getActivePartners('ON'))).toContain('desjardins');
    expect(ids(getActivePartners('QC'))).toEqual(canonical('Quebec'));
    expect(ids(getActivePartners('Québec'))).toEqual(canonical('Quebec'));
  });

  it('feeds the same result to the category and search consumers', () => {
    expect(getPartnersByCategory('money', 'ON').map(p => p.slug)).toEqual([
      'desjardins',
    ]);
    expect(getCategoriesWithPartners('BC')).toEqual(
      getCategoriesWithPartners('British Columbia')
    );
    expect(getCategoriesWithPartners('ON')).toEqual(
      getCategoriesWithPartners('Ontario')
    );
  });

  it('still gives free text and blanks national partners only', () => {
    const national = ids(getActivePartners(null));
    expect(ids(getActivePartners('Somewhere Else'))).toEqual(national);
    expect(ids(getActivePartners('   '))).toEqual(national);
  });

  it('keeps content province tags strict: an alias tag never matches', () => {
    const tagged = {
      active: true,
      displayOrder: 0,
      provinces: ['BC'] as unknown as Partner['provinces'],
    };
    expect(selectActivePartners([tagged], 'British Columbia')).toEqual([]);
    expect(selectActivePartners([tagged], 'BC')).toEqual([]);
  });
});
