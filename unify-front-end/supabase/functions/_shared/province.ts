// supabase/functions/_shared/province.ts
//
// The one province-visibility rule, shared by the app (Resources, Checklist)
// and the Learn ranking edge function. Dependency-free so Deno and Jest can
// both load it.
//
// Rule: an item with no province is national and shows to everyone. An item
// with a province, or a list of them, shows only to a user in one of them. A
// user with no recognized province sees national items only.

export const PROVINCES = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
] as const;

export type Province = (typeof PROVINCES)[number];

/** The value when it is exactly one of the 13 names, otherwise null. */
export function toKnownProvince(
  value: string | null | undefined
): Province | null {
  return PROVINCES.find(province => province === value) ?? null;
}

/**
 * Whether content tagged with `itemProvince` shows to a user in `userProvince`.
 *
 * `itemProvince` is a single name, a list of names, or empty (null, undefined,
 * "" or []) for national content. `userProvince` is checked against the 13
 * names: anything else counts as no province.
 */
export function isVisibleForProvince(
  itemProvince: string | readonly string[] | null | undefined,
  userProvince: string | null | undefined
): boolean {
  const provinces =
    itemProvince == null || itemProvince === ''
      ? []
      : typeof itemProvince === 'string'
        ? [itemProvince]
        : itemProvince;
  if (provinces.length === 0) return true;
  const user = toKnownProvince(userProvince);
  return user !== null && provinces.includes(user);
}

// Postal abbreviations and common spellings that other writers of the shared
// `user_onboarding_profiles` table (the web app, older builds) have stored.
// Analytics showed both "ON" and "Ontario" in production, which splits every
// province breakdown and defeats province-based personalization.
const PROVINCE_ALIASES: Record<string, string> = {
  ab: 'Alberta',
  bc: 'British Columbia',
  mb: 'Manitoba',
  nb: 'New Brunswick',
  nl: 'Newfoundland and Labrador',
  nfld: 'Newfoundland and Labrador',
  newfoundland: 'Newfoundland and Labrador',
  nt: 'Northwest Territories',
  nwt: 'Northwest Territories',
  ns: 'Nova Scotia',
  nu: 'Nunavut',
  on: 'Ontario',
  ont: 'Ontario',
  pe: 'Prince Edward Island',
  pei: 'Prince Edward Island',
  qc: 'Quebec',
  pq: 'Quebec',
  québec: 'Quebec',
  sk: 'Saskatchewan',
  sask: 'Saskatchewan',
  yt: 'Yukon',
  yukon: 'Yukon',
  'yukon territory': 'Yukon',
};

const PROVINCE_BY_LOWER: Record<string, string> = Object.fromEntries(
  PROVINCES.map(p => [p.toLowerCase(), p])
);

/**
 * Map any stored province value to its canonical full name.
 * Returns the trimmed input unchanged when it is not recognised, so a value
 * a user typed for "Other" is never silently dropped. Null/empty stays null.
 */
export function normalizeProvince(
  province: string | null | undefined
): string | null {
  if (province == null) return null;
  const trimmed = province.trim();
  if (trimmed === '') return null;
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  return PROVINCE_BY_LOWER[key] ?? PROVINCE_ALIASES[key] ?? trimmed;
}

/**
 * The province a stored profile value stands for, or null when it is not one of
 * the 13 (null, blank, or free text typed for "Other"). Use this, not
 * `normalizeProvince`, wherever the value decides which content shows.
 */
export function resolveUserProvince(
  province: string | null | undefined
): Province | null {
  return toKnownProvince(normalizeProvince(province));
}
