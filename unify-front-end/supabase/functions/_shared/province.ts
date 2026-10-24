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
