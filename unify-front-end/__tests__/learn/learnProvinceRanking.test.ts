import type { OnboardingProfile } from '@/supabase/functions/_shared/companionTemplates';
import { normalizeProvince as appNormalizeProvince } from '@/constants/LocationData';
import { normalizeProvince } from '@/supabase/functions/_shared/province';
import {
  rankLearnModules,
  type LearnModuleRow,
  type LearnProgressRow,
} from '@/supabase/functions/_shared/learnRanking';

const baseProfile: OnboardingProfile = {
  persona: 'international_student',
  city: null,
  province: null,
  arrival_date: null,
  stage: null,
  goals: [],
  learning_interests: ['housing'],
  hobbies: [],
};

const profileIn = (province: string | null): OnboardingProfile => ({
  ...baseProfile,
  province,
});

// Fixture content. Two modules are province-only and match the profile's
// persona and interest strongly, so a rank-based leak would put them first.
const modules: LearnModuleRow[] = [
  {
    sanity_id: 'banking',
    title: 'Open a bank account',
    personas: [],
    interests: [],
    province: null,
  },
  {
    sanity_id: 'sfu-housing',
    title: 'SFU student housing',
    personas: ['international_student'],
    interests: ['housing'],
    province: 'British Columbia',
  },
  {
    sanity_id: 'ohip',
    title: 'Apply for OHIP',
    personas: ['international_student'],
    interests: ['housing'],
    province: 'Ontario',
  },
  {
    sanity_id: 'transit',
    title: 'Ride transit',
    personas: [],
    interests: [],
    province: '',
  },
];

const idsFor = (
  profile: OnboardingProfile,
  progress: LearnProgressRow[] = []
) => rankLearnModules(modules, progress, profile).map(m => m.sanity_id);

describe('Learn modules by province', () => {
  it('shows a user in Ontario national modules and Ontario modules only', () => {
    const ids = idsFor(profileIn('Ontario'));
    expect([...ids].sort()).toEqual(['banking', 'ohip', 'transit']);
  });

  it('shows a user in BC national modules and BC modules only', () => {
    const ids = idsFor(profileIn('British Columbia'));
    expect([...ids].sort()).toEqual(['banking', 'sfu-housing', 'transit']);
  });

  it('shows a user with no province national modules only', () => {
    expect([...idsFor(profileIn(null))].sort()).toEqual(['banking', 'transit']);
  });

  it('shows a user with an unmatched province value national modules only', () => {
    expect([...idsFor(profileIn('Somewhere Else'))].sort()).toEqual([
      'banking',
      'transit',
    ]);
  });

  it('returns an empty list when no module applies to the user', () => {
    const provinceOnly = modules.filter(m => m.province);
    expect(rankLearnModules(provinceOnly, [], profileIn('Alberta'))).toEqual([]);
    expect(rankLearnModules(provinceOnly, [], profileIn(null))).toEqual([]);
  });

  it('does not bring a filtered module back through saved progress', () => {
    const progress: LearnProgressRow[] = [
      { module_id: 'sfu-housing', status: 'in_progress', completed_at: null },
      {
        module_id: 'ohip',
        status: 'completed',
        completed_at: '2026-10-01T00:00:00Z',
      },
    ];
    const ids = idsFor(profileIn('Alberta'), progress);
    expect(ids).not.toContain('sfu-housing');
    expect(ids).not.toContain('ohip');
  });

  it('does not bring a filtered module back through a strong profile match', () => {
    // sfu-housing matches persona and interest (score 1.0) but is BC only.
    const ids = idsFor(profileIn('Nova Scotia'));
    expect(ids).not.toContain('sfu-housing');
  });

  it('ranks the modules a user may see by score, as before', () => {
    const ranked = rankLearnModules(modules, [], profileIn('Ontario'));
    expect(ranked[0]).toMatchObject({ sanity_id: 'ohip', score: 1 });
    expect(ranked.map(m => m.title.slice(0, 4))).toEqual(['Appl', 'Open', 'Ride']);
  });
});

describe('Learn modules for stored province spellings', () => {
  it('treats the postal abbreviation ON as Ontario', () => {
    expect([...idsFor(profileIn('ON'))].sort()).toEqual([
      'banking',
      'ohip',
      'transit',
    ]);
  });

  it('treats a padded, lower-case BC as British Columbia', () => {
    expect([...idsFor(profileIn('  bc '))].sort()).toEqual([
      'banking',
      'sfu-housing',
      'transit',
    ]);
  });

  it('still shows only national modules for text that is not a province', () => {
    expect([...idsFor(profileIn('Toronto'))].sort()).toEqual([
      'banking',
      'transit',
    ]);
  });

  it('uses the one normalizer the app uses', () => {
    for (const value of ['ON', 'bc', ' PEI ', 'Québec', 'Nowhere', '', null]) {
      expect(normalizeProvince(value)).toBe(appNormalizeProvince(value));
    }
  });
});
