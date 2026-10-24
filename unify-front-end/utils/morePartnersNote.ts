import { resolveUserProvince } from '@/constants/LocationData';

/**
 * The province named by the Resources "more partners are coming" line, or null
 * when the line stays hidden. It shows for a known province other than British
 * Columbia, where the directory is already built. No line for BC users or for
 * users with no recognized province.
 */
export function getMorePartnersNoteProvince(
  profileProvince: string | null | undefined
): string | null {
  const province = resolveUserProvince(profileProvince);
  return province && province !== 'British Columbia' ? province : null;
}
