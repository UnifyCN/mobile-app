import { buildPartnerUrl } from '@/utils/partners';
import type { Partner } from '@/types/partner';

const base: Partner = {
  slug: 'anutio',
  name: 'Anutio',
  category: 'findWork',
  partnershipType: 'referral',
  website: 'https://www.anutio.com/',
  displayOrder: 0,
  active: true,
};

describe('buildPartnerUrl', () => {
  it('appends UTM params derived from website', () => {
    const url = buildPartnerUrl(base, 'learn_resources');
    expect(url).toContain('utm_source=unify');
    expect(url).toContain('utm_medium=learn_resources');
    expect(url).toContain('utm_campaign=anutio');
    expect(url).toContain('ref=unify');
    expect(url.startsWith('https://www.anutio.com/')).toBe(true);
  });

  it('returns empty string when website is missing', () => {
    expect(
      buildPartnerUrl({ ...base, website: undefined }, 'learn_resources')
    ).toBe('');
  });
});
