import { normalizePersonaSlug } from '@/helpers/dateHelpers';

describe('normalizePersonaSlug', () => {
  it('supports the Other/Newcomer onboarding persona', () => {
    expect(normalizePersonaSlug('other')).toBe('other');
    expect(normalizePersonaSlug(' Other ')).toBe('other');
  });

  it('rejects unknown persona values at the Sanity boundary', () => {
    expect(normalizePersonaSlug('unknown')).toBeNull();
  });
});
