import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const locales = readdirSync(localesDir);

function load(locale: string): any {
  return JSON.parse(
    readFileSync(join(localesDir, locale, 'translation.json'), 'utf8')
  );
}

describe('resources.morePartnersComingSoon', () => {
  it('covers every shipped locale', () => {
    expect(locales.sort()).toEqual(
      ['ar', 'en', 'es', 'fr-CA', 'hi', 'pa', 'vi'].sort()
    );
  });

  it.each(locales)(
    '%s has the specified key with a {{province}} placeholder',
    locale => {
      const value = load(locale).resources?.morePartnersComingSoon;
      expect(typeof value).toBe('string');
      expect(value).toContain('{{province}}');
    }
  );

  it.each(locales)('%s has no leftover learn.resources copy', locale => {
    expect(load(locale).learn.resources).not.toHaveProperty(
      'morePartnersComingSoon'
    );
  });

  it('translates every non-English locale rather than copying English', () => {
    const english = load('en').resources.morePartnersComingSoon;
    for (const locale of locales.filter(l => l !== 'en')) {
      expect(load(locale).resources.morePartnersComingSoon).not.toBe(english);
    }
  });
});
