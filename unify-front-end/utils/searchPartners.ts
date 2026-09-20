import type { LocalizedPartner, PartnerCategory } from '@/types/partner';

/**
 * Arabic marks that carry no distinction a search should honour: the
 * short-vowel harakat, the madda and the hamza forms NFD has just split off
 * their base letter (\u0653-\u0655), the dagger alef, and the tatweel used to
 * stretch a word for justification. They sit outside the \u0300-\u036f Latin
 * combining range, so the Latin pass below does not reach them.
 */
const ARABIC_MARKS = /[\u064b-\u0655\u0670\u0640]/g;

/**
 * Lowercase and strip combining accents so "Immigration Québec" matches
 * "quebec". The explicit \u0300-\u036f range is used instead of a
 * `\p{Diacritic}` property escape, which is not safe to assume on Hermes.
 *
 * đ is folded separately. It is its own letter rather than d plus a combining
 * mark, so NFD leaves it whole and a Vietnamese speaker typing "Định" would
 * otherwise match nothing.
 *
 * Arabic is folded the way Arabic search conventionally is: marks dropped,
 * alef wasla to bare alef, alef maqsura to ya, ta marbuta to ha. Writers vary
 * on all of them, so "مؤسسة" typed without its hamza still has to find the
 * listing that carries one. NFD has already separated the hamza forms of alef,
 * waw and ya into a base letter plus a mark, so dropping the mark is enough.
 */
export function normalizeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(ARABIC_MARKS, '')
    .replace(/\u0671/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629/g, '\u0647')
    .trim();
}

/** Resolves a category to its display label, so i18n stays out of this module. */
export type CategoryLabelResolver = (category: PartnerCategory) => string;

/**
 * Every field a query is matched against. Kept in one place so the searchable
 * surface is obvious: what a person types is a service ("job search"), an
 * organization ("ISSofBC"), a place ("Surrey"), or a category ("Find Work").
 *
 * Takes a LocalizedPartner, so a person searching in Spanish matches the
 * Spanish copy they are looking at. Only `name` stays language-independent,
 * which is what lets "ISSofBC" find the org in any language.
 */
function haystack(
  partner: LocalizedPartner,
  labelFor: CategoryLabelResolver
): string {
  return normalizeQuery(
    [
      partner.name,
      partner.tagline,
      partner.serviceArea,
      labelFor(partner.category),
      ...(partner.programs?.map(program => program.name) ?? []),
      ...(partner.highlights ?? []),
    ].join(' ')
  );
}

/**
 * Partners matching a free-text query, in the order they were given.
 *
 * Every whitespace-separated token must appear somewhere in the partner's
 * searchable text, so "surrey job" narrows rather than widens. A blank query
 * returns the list unchanged — the caller decides whether that means "show the
 * category grid instead".
 */
export function selectPartnersMatching(
  partners: LocalizedPartner[],
  query: string,
  labelFor: CategoryLabelResolver
): LocalizedPartner[] {
  const tokens = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return partners;
  return partners.filter(partner => {
    const text = haystack(partner, labelFor);
    return tokens.every(token => text.includes(token));
  });
}
