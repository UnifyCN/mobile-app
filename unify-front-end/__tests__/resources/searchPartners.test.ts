import { normalizeQuery, selectPartnersMatching } from '@/utils/searchPartners';
import type { LocalizedPartner, PartnerCategory } from '@/types/partner';

const labelFor = (category: PartnerCategory) =>
  ({
    gettingSettled: 'Getting Settled',
    findWork: 'Find Work',
    immigrationHelp: 'Immigration Help',
    librariesLearning: 'Libraries & Learning',
    communityBelonging: 'Community & Belonging',
    networksPlanning: 'Network & Planning',
    internationalStudents: 'International Students',
    insurance: 'Insurance',
    money: 'Money & Banking',
  })[category];

function partner(
  overrides: Partial<LocalizedPartner> & Pick<LocalizedPartner, 'slug'>
): LocalizedPartner {
  return {
    name: 'Example Society',
    category: 'gettingSettled',
    partnershipType: 'resource',
    tagline: 'Settlement support',
    description: 'Long form copy.',
    highlights: [],
    serviceArea: 'Greater Vancouver',
    displayOrder: 1,
    active: true,
    ...overrides,
  };
}

const DIRECTORY: LocalizedPartner[] = [
  partner({
    slug: 'issofbc',
    name: 'ISSofBC',
    tagline: 'Settlement services for newcomers',
    serviceArea: 'Greater Vancouver',
  }),
  partner({
    slug: 'surrey-libraries',
    name: 'Surrey Libraries',
    category: 'librariesLearning',
    tagline: 'Free programs and study space',
    serviceArea: 'Surrey',
    programs: [
      {
        id: 'esl-conversation',
        name: 'ESL Conversation Circle',
        description: 'Weekly English practice.',
      },
    ],
  }),
  partner({
    slug: 'back-in-motion',
    name: 'Back in Motion',
    category: 'findWork',
    tagline: 'Employment programs',
    serviceArea: 'Surrey',
    highlights: ['Resume and interview coaching'],
  }),
];

describe('normalizeQuery', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeQuery('  Québec  ')).toBe('quebec');
    expect(normalizeQuery('Montréal')).toBe('montreal');
  });

  it('folds Arabic hamza, alef maqsura and ta marbuta', () => {
    // Writers vary on every one of these, so a query typed the plain way has
    // to find a listing that carries the marks.
    expect(normalizeQuery('مؤسسة')).toBe(normalizeQuery('موسسه'));
    expect(normalizeQuery('إعادة')).toBe(normalizeQuery('اعاده'));
    expect(normalizeQuery('اللغة الإنجليزية')).toBe(
      normalizeQuery('اللغه الانجليزيه')
    );
    // Harakat and the tatweel elongation are dropped.
    expect(normalizeQuery('مُســاعَدة')).toBe(normalizeQuery('مساعده'));
  });

  it('folds Vietnamese đ, which NFD leaves whole', () => {
    // đ is its own letter, not d plus a combining mark, so stripping combining
    // marks alone leaves "đinh" and a Vietnamese speaker matches nothing.
    expect(normalizeQuery('Định')).toBe('dinh');
    expect(normalizeQuery('Đà Nẵng')).toBe('da nang');
    expect(normalizeQuery('đường')).toBe('duong');
  });
});

describe('selectPartnersMatching', () => {
  it('returns the list unchanged for a blank query', () => {
    expect(selectPartnersMatching(DIRECTORY, '   ', labelFor)).toEqual(
      DIRECTORY
    );
  });

  it('matches on organization name, case-insensitively', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'issofbc', labelFor);
    expect(hits.map(p => p.slug)).toEqual(['issofbc']);
  });

  it('matches on tagline', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'employment', labelFor);
    expect(hits.map(p => p.slug)).toEqual(['back-in-motion']);
  });

  it('matches on service area', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'surrey', labelFor);
    expect(hits.map(p => p.slug)).toEqual([
      'surrey-libraries',
      'back-in-motion',
    ]);
  });

  it('matches on the translated category label', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'find work', labelFor);
    expect(hits.map(p => p.slug)).toEqual(['back-in-motion']);
  });

  it('matches on a program name', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'esl', labelFor);
    expect(hits.map(p => p.slug)).toEqual(['surrey-libraries']);
  });

  it('matches on a highlight', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'resume', labelFor);
    expect(hits.map(p => p.slug)).toEqual(['back-in-motion']);
  });

  it('requires every token, so extra words narrow the result', () => {
    expect(
      selectPartnersMatching(DIRECTORY, 'surrey libraries', labelFor).map(
        p => p.slug
      )
    ).toEqual(['surrey-libraries']);
    expect(selectPartnersMatching(DIRECTORY, 'surrey mars', labelFor)).toEqual(
      []
    );
  });

  it('preserves the incoming order', () => {
    const hits = selectPartnersMatching(DIRECTORY, 'e', labelFor);
    expect(hits.map(p => p.slug)).toEqual(
      DIRECTORY.filter(p => hits.includes(p)).map(p => p.slug)
    );
  });
});
