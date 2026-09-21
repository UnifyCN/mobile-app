import type { TFunction } from 'i18next';
import type {
  LocalizedPartner,
  LocalizedPartnerProgram,
  Partner,
  PartnerProgram,
} from '@/types/partner';

/**
 * Resolves a partner's display copy for the active language.
 *
 * `constants/Partners.ts` holds structure only — slug, category, contact
 * values, logos, ordering. Every string a person reads lives in the locale
 * files under `learn.resources.partners.<slug>`, so the directory follows the
 * app language instead of shipping one hardcoded English copy deck.
 *
 * Keys are derived from ids rather than stored beside each record: a record
 * cannot then drift out of sync with its copy, and adding a partner means
 * adding one block per locale under a key the slug already dictates. The
 * `__tests__/resources/partnerCopy.test.ts` suite asserts the two sides match
 * in both directions, so a missing block fails the build rather than rendering
 * a raw key on a phone.
 *
 * i18n stays a parameter, not an import, matching `utils/searchPartners` — the
 * module is then testable without standing up an i18next instance.
 */

/** Root of the partner copy tree in every locale file. */
export const PARTNER_COPY_ROOT = 'learn.resources.partners';

/** Key holding one of a partner's own copy fields. */
export function partnerCopyKey(slug: string, field: string): string {
  return `${PARTNER_COPY_ROOT}.${slug}.${field}`;
}

/**
 * The program's key segment: its id with the parent slug stripped.
 *
 * Program ids are namespaced by slug (`diversecity-linc`), which would read as
 * `partners.diversecity.programs.diversecity-linc` if used whole. The prefix is
 * guaranteed by the partner data suite, and the raw id is the fallback so a
 * malformed id degrades to a missing key rather than a wrong one.
 */
export function programKeySegment(slug: string, programId: string): string {
  const prefix = `${slug}-`;
  return programId.startsWith(prefix)
    ? programId.slice(prefix.length)
    : programId;
}

/** Key holding one of a program's copy fields. */
export function programCopyKey(
  slug: string,
  programId: string,
  field: string
): string {
  return `${PARTNER_COPY_ROOT}.${slug}.programs.${programKeySegment(
    slug,
    programId
  )}.${field}`;
}

/**
 * A required string. An empty result means the locale block is missing, which
 * the copy test catches at build time; at runtime the key resolves to '' rather
 * than rendering the key itself at a person.
 */
function text(t: TFunction, key: string): string {
  const value = t(key, { defaultValue: '' });
  return typeof value === 'string' ? value : '';
}

/**
 * An optional string. Absence is meaningful here — the detail screen hides a
 * whole contact row when a partner does not publish that field — so a missing
 * or blank key has to come back `undefined`, never ''.
 */
function optionalText(t: TFunction, key: string): string | undefined {
  const value = text(t, key);
  return value.length > 0 ? value : undefined;
}

/** A required list, e.g. highlights. Empty when the key is absent. */
function list(t: TFunction, key: string): string[] {
  const value = t(key, { returnObjects: true, defaultValue: [] });
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** An optional list, e.g. languages of service. */
function optionalList(t: TFunction, key: string): string[] | undefined {
  const value = list(t, key);
  return value.length > 0 ? value : undefined;
}

function localizeProgram(
  slug: string,
  program: PartnerProgram,
  t: TFunction
): LocalizedPartnerProgram {
  const key = (field: string) => programCopyKey(slug, program.id, field);
  return {
    ...program,
    name: text(t, key('name')),
    description: text(t, key('description')),
    eligibility: optionalText(t, key('eligibility')),
  };
}

/** One partner with its copy resolved for the active language. */
export function localizePartner(
  partner: Partner,
  t: TFunction
): LocalizedPartner {
  const key = (field: string) => partnerCopyKey(partner.slug, field);
  return {
    ...partner,
    tagline: text(t, key('tagline')),
    description: text(t, key('description')),
    highlights: list(t, key('highlights')),
    serviceArea: text(t, key('serviceArea')),
    eligibility: optionalText(t, key('eligibility')),
    howToStart: optionalText(t, key('howToStart')),
    hours: optionalText(t, key('hours')),
    languages: optionalList(t, key('languages')),
    programs: partner.programs?.map(program =>
      localizeProgram(partner.slug, program, t)
    ),
  };
}

/** Every partner in a list, with copy resolved for the active language. */
export function localizePartners(
  partners: Partner[],
  t: TFunction
): LocalizedPartner[] {
  return partners.map(partner => localizePartner(partner, t));
}
