import { resolveAiResponseLanguage } from '@/utils/aiLanguage';

describe('resolveAiResponseLanguage', () => {
  it('returns undefined for English so the field is omitted', () => {
    expect(resolveAiResponseLanguage('en')).toBeUndefined();
    expect(resolveAiResponseLanguage('en-CA')).toBeUndefined();
    expect(resolveAiResponseLanguage(null)).toBeUndefined();
    expect(resolveAiResponseLanguage(undefined)).toBeUndefined();
  });

  it('returns the six supported non-English codes', () => {
    expect(resolveAiResponseLanguage('vi')).toBe('vi');
    expect(resolveAiResponseLanguage('es')).toBe('es');
    expect(resolveAiResponseLanguage('hi')).toBe('hi');
    expect(resolveAiResponseLanguage('ar')).toBe('ar');
    expect(resolveAiResponseLanguage('fr-CA')).toBe('fr-CA');
    expect(resolveAiResponseLanguage('pa')).toBe('pa');
  });

  it('folds regional variants onto a supported code', () => {
    expect(resolveAiResponseLanguage('fr')).toBe('fr-CA');
    expect(resolveAiResponseLanguage('es-MX')).toBe('es');
    expect(resolveAiResponseLanguage('ar-EG')).toBe('ar');
    expect(resolveAiResponseLanguage('pa-IN')).toBe('pa');
  });

  it('falls back to English for unsupported locales', () => {
    expect(resolveAiResponseLanguage('de')).toBeUndefined();
    expect(resolveAiResponseLanguage('zh-Hans')).toBeUndefined();
  });
});
