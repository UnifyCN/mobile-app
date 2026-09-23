import type { Partner } from '@/types/partner';

/**
 * Where the user came from when they tapped a partner CTA.
 * Used as utm_medium so partner reporting can attribute by surface.
 */
export type PartnerCtaSource =
  | 'learn_resources'
  | 'resources_spotlight'
  | 'companion_ai'
  | 'checklist_link'
  | 'learn_module'
  | 'home_card';

const PARTNER_CTA_SOURCES: readonly PartnerCtaSource[] = [
  'learn_resources',
  'resources_spotlight',
  'companion_ai',
  'checklist_link',
  'learn_module',
  'home_card',
];

/** Narrows a route param to a known source; anything else is `undefined`. */
export function parsePartnerCtaSource(
  value: string | string[] | undefined
): PartnerCtaSource | undefined {
  return typeof value === 'string' &&
    (PARTNER_CTA_SOURCES as readonly string[]).includes(value)
    ? (value as PartnerCtaSource)
    : undefined;
}

/**
 * Append Unify's UTM scheme to a partner's bare URL.
 *
 * Single source of truth: the partner record stores the bare URL only,
 * and the tracked URL is derived at click time. This prevents the same
 * UTM scheme from drifting across partner records and lets us A/B
 * different sources (Learn vs. Companion vs. Checklist) without
 * editing partner data.
 */
export function buildPartnerUrl(
  partner: Partner,
  source: PartnerCtaSource
): string {
  if (!partner.website) return '';
  const url = new URL(partner.website);
  url.searchParams.set('utm_source', 'unify');
  url.searchParams.set('utm_medium', source);
  url.searchParams.set('utm_campaign', partner.slug);
  url.searchParams.set('ref', 'unify');
  return url.toString();
}

/**
 * Route to a partner's detail screen. `via` names the surface the person came
 * from; the detail screen reads it for analytics, the CTA's utm_medium, and
 * its back label.
 */
export function partnerDetailHref(slug: string, via: PartnerCtaSource): string {
  return `/(tabs)/Learn/resources/${slug}?via=${via}`;
}
