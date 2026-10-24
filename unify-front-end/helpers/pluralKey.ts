import type { TFunction } from 'i18next';

/**
 * Translate a CLDR plural key (`base_one`, `base_few`, `base_other`, ...).
 * The app runs i18next in compatibilityJSON 'v3', which does not resolve
 * those suffixes, so the category comes from Intl.PluralRules. Falls back to
 * `base_other` when a language lacks the category.
 */
export const tPlural = (
  t: TFunction,
  baseKey: string,
  count: number,
  language: string
): string => {
  let category = 'other';
  try {
    category = new Intl.PluralRules(language).select(count);
  } catch {
    // Unknown locale tag: `other` is always defined.
  }
  return t([`${baseKey}_${category}`, `${baseKey}_other`], { count });
};
