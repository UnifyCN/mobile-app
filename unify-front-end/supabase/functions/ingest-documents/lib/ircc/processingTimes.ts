import { parseLongDate } from './dates.ts';
import type { SourceRecord } from './types.ts';

export interface ProcessingTimeFiles {
  countryTimes: unknown;
  nonCountryTimes: unknown;
  countryNames: unknown;
  flpt: unknown;
  flptByWeek: unknown;
}

export interface ProcessingTimeResult {
  records: SourceRecord[];
  /** Counts of entries left out, by reason. */
  skipped: Record<string, number>;
}

type Json = Record<string, unknown>;

// Labels are the ones IRCC shows on its "Check processing times" page.
interface CountryCategory {
  key: string;
  label: string;
  /** The application the page shows for the country code CA instead of a country. */
  inCanadaLabel?: string;
  /** Nested values: one leaf per step. */
  steps?: Record<string, string>;
}

const COUNTRY_CATEGORIES: CountryCategory[] = [
  {
    key: 'visitor-outside-canada',
    label: 'Visitor visa (from outside Canada)',
  },
  { key: 'supervisa', label: 'Super visa (parents or grandparents)' },
  {
    key: 'study',
    label: 'Study permit (from outside Canada)',
    inCanadaLabel: 'Study permit in Canada',
  },
  {
    key: 'work',
    label: 'Work permit (from outside Canada)',
    inCanadaLabel: 'Work permit in Canada',
  },
  { key: 'child_dependent', label: 'Dependent child' },
  { key: 'child_adopted', label: 'Adopted child or other relative' },
  { key: 'refugees_gov', label: 'Government-assisted refugees' },
  {
    key: 'refugees_private',
    label: 'Privately sponsored refugees',
    steps: {
      sponsor: 'Step 1 sponsorship application',
      refugee: 'Step 2 refugee application',
    },
  },
];

const COUNTRY_CODE = /^[A-Z]{2}$/;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The time as IRCC wrote it. An official "No processing time available" or
 * "Not enough data" is kept word for word, so no number is ever invented. A
 * value that is not text is malformed and fails the whole source, so a broken
 * file never replaces a complete one.
 */
function readTime(value: unknown, where: string): string {
  const time =
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (time === '') throw new Error(`Processing times: malformed ${where}`);
  return time;
}

function countryNameMap(countryNames: unknown): Map<string, string> {
  const names = isObject(countryNames) ? countryNames['country-name'] : null;
  if (!isObject(names)) throw new Error('Processing times: no country names');
  return new Map(
    Object.entries(names).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

function count(skipped: Record<string, number>, reason: string) {
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}

function convertCountryTimes(
  countryTimes: unknown,
  names: Map<string, string>
): SourceRecord[] {
  if (!isObject(countryTimes))
    throw new Error('Processing times: no country file');
  const records: SourceRecord[] = [];
  for (const category of COUNTRY_CATEGORIES) {
    const section = countryTimes[category.key];
    if (!isObject(section)) {
      throw new Error(`Processing times: no ${category.key} section`);
    }
    const publishedAt = parseLongDate(section.lastupdated);
    const codes = Object.keys(section)
      .filter(code => COUNTRY_CODE.test(code))
      .sort((a, b) => ((names.get(a) ?? a) < (names.get(b) ?? b) ? -1 : 1));
    if (codes.length === 0) {
      throw new Error(
        `Processing times: no country values in ${category.key} section`
      );
    }
    for (const code of codes) {
      const value = section[code];
      const inCanada = code === 'CA' && category.inCanadaLabel !== undefined;
      const country = inCanada
        ? null
        : (names.get(code) ?? `country code ${code}`);
      const where = `${category.key} value for ${code}`;
      if (category.steps && !isObject(value)) {
        throw new Error(`Processing times: malformed ${where}`);
      }
      const leaves: Array<[string, unknown]> = category.steps
        ? Object.entries(category.steps).map(([step, label]) => [
            `${category.label}, ${label}`,
            (value as Json)[step],
          ])
        : [[inCanada ? category.inCanadaLabel! : category.label, value]];
      for (const [label, leaf] of leaves) {
        const time = readTime(leaf, where);
        records.push({
          text: `Processing time for ${label}${country === null ? '' : ` (${country})`}: ${time}.`,
          publishedAt,
        });
      }
    }
  }
  return records;
}

// Rows of data-ptime-non-country-en.json. Labels are the page's own.
const NON_COUNTRY_LABELS: Record<string, Record<string, string>> = {
  visitor_inside_canada: {
    visitor_inside_canada: 'Visitor visa (from inside Canada)',
  },
  visitor_extension: {
    visitor_extension: 'Visitor extension (Visitor record)',
  },
  iec: {
    iec: 'International Experience Canada (current season)',
    iec_past: 'International Experience Canada (last season)',
  },
  eta: { eta: 'Electronic Travel Authorization (eTA)' },
  fed_skilled_trades: {
    skilled_trades_ee: 'Skilled trades (federal): Online via Express Entry',
  },
  citizenship: {
    cit_resumption: 'Resumption of citizenship',
    cit_renunciation: 'Renunciation of citizenship',
    cit_search: 'Search of citizenship records',
    cit_adoption_part1: 'Citizenship for adopted persons',
  },
  pr_card: {
    new_pr: 'New permanent resident card',
    existing_pr: 'Renewing or replacing a permanent resident card',
  },
  rep_documents: {
    vos: 'Verification of status',
    replacement: 'Replacement of valid temporary resident documents',
    amend_imm: 'Amendments of immigration documents',
    amend_tr: 'Amendments of valid temporary resident documents',
  },
  sawp: { sawp_current: 'Seasonal Agricultural Worker Program (SAWP)' },
};

// In the file, but the page shows the extension queue file's 8 and 12 weeks
// for these two applications and never reads these keys.
const NOT_SHOWN_ON_PAGE = new Set(['study_extension', 'work_extension']);

/** "Part 1: 4 months" is a part label and a time. */
function splitPart(time: string): { part: string | null; time: string } {
  const match = /^(Part \d+):\s*(.+)$/.exec(time);
  return match ? { part: match[1], time: match[2] } : { part: null, time };
}

function convertNonCountryTimes(
  nonCountryTimes: unknown,
  skipped: Record<string, number>
): SourceRecord[] {
  if (!isObject(nonCountryTimes)) {
    throw new Error('Processing times: no non-country file');
  }
  const update = nonCountryTimes['default-update'];
  const publishedAt = isObject(update)
    ? parseLongDate(update.lastupdated)
    : null;
  // Records come out in the order of NON_COUNTRY_LABELS, never file order.
  const records: SourceRecord[] = [];
  for (const [group, labels] of Object.entries(NON_COUNTRY_LABELS)) {
    // Every labelled group is required: a partial file must not replace a
    // complete one.
    const entries = nonCountryTimes[group];
    if (!isObject(entries)) {
      throw new Error(`Processing times: no ${group} group`);
    }
    for (const [key, label] of Object.entries(labels)) {
      const read = readTime(entries[key], `${group}.${key} value`);
      const { part, time } = splitPart(read);
      records.push({
        text: `Processing time for ${label}${part === null ? '' : ` (${part})`}: ${time}.`,
        publishedAt,
      });
    }
  }
  for (const [group, entries] of Object.entries(nonCountryTimes)) {
    if (group === 'default-update' || !isObject(entries)) continue;
    for (const key of Object.keys(entries)) {
      if (NON_COUNTRY_LABELS[group]?.[key] !== undefined) continue;
      count(
        skipped,
        NOT_SHOWN_ON_PAGE.has(key) ? 'notShownOnPage' : 'unlabelled'
      );
    }
  }
  return records;
}

// current-flpt keys of flpt-en.json, with the page's labels. The four refugee
// keys in the file (government-refugees-* and private-refugees-*) are not shown
// on the page, so they have no label and are skipped.
const FLPT_LABELS: Record<string, string> = {
  aip: 'Atlantic Immigration Program',
  caregiver: 'Caregivers (all programs)',
  cec: 'Canadian Experience Class (online via Express Entry)',
  fsw: 'Skilled workers (federal)',
  qsw: 'Skilled workers (Quebec)',
  'pnp-ee': 'Provincial nominees (online via Express Entry)',
  'pnp-base': 'Provincial nominees (not through Express Entry)',
  'self-employed': 'Self-employed persons (federal)',
  'startup-visa': 'Start-up visa',
  'quebec-business': 'Quebec business class',
  'spousal-canada-roc':
    'Spouse or common-law partner living in Canada (outside Quebec)',
  'spousal-canada-quebec':
    'Spouse or common-law partner living in Canada (in Quebec)',
  'spousal-abroad-roc':
    'Spouse, common-law or conjugal partner living outside Canada (outside Quebec)',
  'spousal-abroad-quebec':
    'Spouse, common-law or conjugal partner living outside Canada (in Quebec)',
  'pgp-roc': 'Parents or grandparents (outside Quebec)',
  'pgp-quebec': 'Parents or grandparents (in Quebec)',
  'protected-persons-in-canada-roc':
    'Protected persons and convention refugees in Canada (outside Quebec)',
  'protected-persons-in-canada-quebec':
    'Protected persons and convention refugees in Canada (in Quebec)',
  'dependants-abroad-roc':
    'Dependants of protected persons living outside Quebec',
  'dependants-abroad-quebec':
    'Dependants of protected persons living in Quebec',
  'humanitarian-roc': 'Humanitarian and compassionate cases (outside Quebec)',
  'humanitarian-quebec': 'Humanitarian and compassionate cases (in Quebec)',
  'citizen-grants': 'Citizenship grant',
  'citizen-proofs': 'Citizenship certificate (proof of citizenship)',
};

// current-flpt keys of flpt-by-week-en.json, the extension queue.
const EXTENSION_QUEUE_LABELS: Record<string, string> = {
  'SP-EXT': 'Study permit extension in Canada',
  'WP-EXT': 'Work permit extension in Canada',
};

// The extension pages show their estimate under "If you apply today". The
// work permit page also lists what the one shared estimate includes. It is not
// a separate PGWP estimate, and not a wait for an application already sent.
const EXTENSION_QUEUE_NOTES: Record<string, string> = {
  'SP-EXT': ' (if you apply today).',
  'WP-EXT':
    ' (if you apply today). This shared estimate includes new post-graduation work permits (PGWPs), bridging open work permits and change of conditions to a work permit.',
};

/**
 * Durations from a file's current-flpt section. total-people, people-ahead and
 * wait-times are queue counts and history, not durations, and are never read.
 */
function convertCurrentDurations(
  current: unknown,
  labels: Record<string, string>,
  publishedAt: string | null,
  skipped: Record<string, number>,
  notes: Record<string, string> = {}
): SourceRecord[] {
  const section = current as Json;
  const records: SourceRecord[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const time = readTime(section[key], `current-flpt ${key} value`);
    records.push({
      text: `Processing time for ${label}: ${time}${notes[key] ?? '.'}`,
      publishedAt,
    });
  }
  for (const key of Object.keys(section)) {
    if (labels[key] === undefined) count(skipped, 'unlabelled');
  }
  return records;
}

function convertFlpt(
  flpt: unknown,
  skipped: Record<string, number>
): SourceRecord[] {
  const current = isObject(flpt) ? flpt['current-flpt'] : null;
  if (!isObject(current)) {
    throw new Error('Processing times: no current-flpt section');
  }
  const update = (flpt as Json)['default-update'];
  const publishedAt = isObject(update)
    ? parseLongDate(update.flpt_lastupdated)
    : null;
  return convertCurrentDurations(current, FLPT_LABELS, publishedAt, skipped);
}

function convertExtensionQueue(
  flptByWeek: unknown,
  skipped: Record<string, number>
): SourceRecord[] {
  const current = isObject(flptByWeek) ? flptByWeek['current-flpt'] : null;
  if (!isObject(current)) {
    throw new Error('Processing times: no extension queue section');
  }
  const publishedAt = parseLongDate((flptByWeek as Json)['tr-last-updated']);
  return convertCurrentDurations(
    current,
    EXTENSION_QUEUE_LABELS,
    publishedAt,
    skipped,
    EXTENSION_QUEUE_NOTES
  );
}

export function convertProcessingTimes(
  files: ProcessingTimeFiles
): ProcessingTimeResult {
  const skipped: Record<string, number> = {};
  const names = countryNameMap(files.countryNames);
  const records = [
    ...convertCountryTimes(files.countryTimes, names),
    ...convertNonCountryTimes(files.nonCountryTimes, skipped),
    ...convertFlpt(files.flpt, skipped),
    ...convertExtensionQueue(files.flptByWeek, skipped),
  ];
  return { records, skipped };
}
