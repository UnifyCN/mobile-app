import { resolveUserProvince } from '@/constants/LocationData';

/** Sanity query parameter: empty string means national items only. */
export function checklistProvinceParam(
  province: string | null | undefined
): string {
  return resolveUserProvince(province) ?? '';
}

/** Cache key segment: the canonical province name, or `none`. */
export function checklistProvinceKeyPart(
  province: string | null | undefined
): string {
  return resolveUserProvince(province) ?? 'none';
}
