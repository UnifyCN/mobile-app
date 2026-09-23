/**
 * Where the spotlight partner (see `getSpotlightPartner`) appears outside the
 * Resources directory, and when.
 *
 * Sanity has no topic field on checklist items or modules, so the immigration
 * set is an explicit allowlist of base-language document ids. Only items where
 * a licensed consultant can help are listed: applications, permits, status,
 * PR pathways, sponsorship, citizenship. Scam, tax, housing and test-prep
 * items are left out on purpose.
 */

/** Sanity `checklist` ids (base language, no locale suffix). */
export const IMMIGRATION_CHECKLIST_IDS: ReadonlySet<string> = new Set([
  '0cab402f-e7c2-4848-ac72-823bfa1f6e5a', // work permit renewal date
  '1491d8a3-9ab6-49de-b08c-79b1d230a273', // check PR card expiry
  '178a2729-7cb4-4218-b6b9-a5034a20afc2', // apply for citizenship
  '1dc573e4-5da0-429c-a52a-b3bbe7f4193f', // family sponsorship after PR
  '1fe95ffd-1ff8-412b-ae6f-67c73e14e65d', // sponsorship as a citizen
  '24201b58-7af8-4fa3-aae1-e1c450284fa6', // study permit renewal
  '347d7b29-f268-4be3-a7c1-c2e143ddc27b', // apply for PGWP
  '50f93ae1-5dbf-4e91-8da0-73ea007e1c36', // renew PR card
  '59015af3-b178-44ee-b1a2-2568be1898be', // pick a PR pathway
  '5efefd2b-5ee5-47dd-a5b1-552b92502516', // submit PR application (ITA)
  '7264d61a-2005-4808-a9aa-d321e00ad7d7', // PGWP eligibility
  '73fb082a-7f29-4f8e-a2de-e9abee78cfcf', // create Express Entry profile
  '7494c278-8200-4e78-98ff-e2fc12abca9b', // calculate CRS score
  '908da0f1-a067-4006-a696-e33913a27f4a', // apply for PR card
  '94d67fe4-8f1a-45ea-b465-35480ad2479f', // gather PR documents
  '950a8f79-7c56-4a2a-85fa-b659e8bdd388', // prepare citizenship application
  'a422f615-9841-4ee4-a62b-a529841d96e3', // does the program qualify for PGWP
  'a9303e96-5ed9-44c9-8a9f-c237243129be', // sponsor a family member
  'bc898c8c-9a37-426e-9517-10484a430d3a', // PNP streams
  'd00621c1-4375-43ce-9421-494bb1a70231', // BC PNP
  'd57c4d62-f380-48c1-8a97-dbaee83679ab', // maintained status
  'd7eed90d-f00d-4d2f-85cd-abfc597984ab', // work permit conditions
  'e6c31b6b-0b6b-4126-8c6d-a7eedd924c2c', // PR pathways with Canadian work
  'fe7e26f6-282f-4931-adf2-b9155c146315', // submit PR application (ITA)
]);

/** Sanity `module` ids (base language). Permanent Resident (PR). */
export const IMMIGRATION_MODULE_IDS: ReadonlySet<string> = new Set([
  '9717e260-bdeb-4ee4-8d39-4159a48eb627',
]);

/** Immigration answers in one Companion chat before the banner shows. */
export const COMPANION_SPOTLIGHT_THRESHOLD = 2;

// Translated Sanity documents carry the base id plus a locale suffix
// (`<uuid>-es`, `<uuid>-fr-CA`). A UUID ends in 12 hex digits, so anything
// after that is the suffix.
const LOCALE_SUFFIX =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-.+$/i;

/** Strip a locale suffix from a Sanity document id. */
export const baseSanityId = (id: string): string =>
  id.replace(LOCALE_SUFFIX, '$1');

export const isImmigrationChecklistItem = (
  sanityId: string | null | undefined
): boolean =>
  !!sanityId && IMMIGRATION_CHECKLIST_IDS.has(baseSanityId(sanityId));

export const isImmigrationModule = (
  moduleId: string | null | undefined
): boolean => !!moduleId && IMMIGRATION_MODULE_IDS.has(baseSanityId(moduleId));

/**
 * The one Checklist item, in display order, that carries the partner row:
 * the first immigration item not yet done.
 */
export const firstPartnerHelpKey = (
  items: {
    key: string;
    sanityId: string | null | undefined;
    completed: boolean;
  }[]
): string | undefined =>
  items.find(
    item => !item.completed && isImmigrationChecklistItem(item.sanityId)
  )?.key;

/**
 * Whether the Companion banner shows: enough immigration answers in this
 * chat, and the person has not dismissed it or acted on it.
 */
export const shouldShowCompanionSpotlight = (
  immigrationAnswerCount: number,
  dismissed: boolean
): boolean =>
  !dismissed && immigrationAnswerCount >= COMPANION_SPOTLIGHT_THRESHOLD;
