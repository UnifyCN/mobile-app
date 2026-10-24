import {
  CANADIAN_PROVINCES,
  normalizeProvince,
} from '@/constants/LocationData';

/**
 * The province a checklist is targeted at: the canonical full name, or null
 * when the user has none. normalizeProvince keeps unmatched free text, so the
 * result is checked against the canonical list here.
 *
 * TODO: after the Resources slice merges, replace this local check with the
 * shared province validator.
 */
export function resolveChecklistProvince(
  province: string | null | undefined
): string | null {
  const normalized = normalizeProvince(province);
  return normalized !== null && CANADIAN_PROVINCES.includes(normalized)
    ? normalized
    : null;
}

/** Sanity query parameter: empty string means national items only. */
export function checklistProvinceParam(
  province: string | null | undefined
): string {
  return resolveChecklistProvince(province) ?? '';
}

/** Cache key segment: the canonical province name, or `none`. */
export function checklistProvinceKeyPart(
  province: string | null | undefined
): string {
  return resolveChecklistProvince(province) ?? 'none';
}
