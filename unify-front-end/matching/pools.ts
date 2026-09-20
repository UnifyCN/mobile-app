type PoolPersona =
  | 'international_student'
  | 'skilled_worker'
  | 'refugee'
  | 'other';
type PoolTimeInCanada =
  | 'not_arrived'
  | 'less_than_1_year'
  | '1_to_2_years'
  | '2_to_3_years'
  | '3_plus_years';

export const COMMUNITY_CIRCLE_SIZE = 4;
export const COMMUNITY_CIRCLE_DURATION_DAYS = 14;

/**
 * Minimal shape of i18next's `t`. Declared locally so this module stays free of
 * react-i18next imports and can still be used from plain unit tests.
 */
export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

export const PERSONA_LABEL_KEYS: Record<PoolPersona, string> = {
  international_student: 'circles.persona.international_student',
  skilled_worker: 'circles.persona.skilled_worker',
  refugee: 'circles.persona.refugee',
  other: 'circles.persona.other',
};

export const TIME_IN_CANADA_LABEL_KEYS: Record<PoolTimeInCanada, string> = {
  not_arrived: 'circles.timeInCanada.not_arrived',
  less_than_1_year: 'circles.timeInCanada.less_than_1_year',
  '1_to_2_years': 'circles.timeInCanada.1_to_2_years',
  '2_to_3_years': 'circles.timeInCanada.2_to_3_years',
  '3_plus_years': 'circles.timeInCanada.3_plus_years',
};

export type PoolKey = string;

const normalizePoolSegment = (value?: string | null, fallback = 'open') =>
  (value || fallback).trim().toLowerCase().replace(/\s+/g, '_');

export const buildPoolKey = (
  persona: PoolPersona | string | null,
  timeInCanada: PoolTimeInCanada | string
): PoolKey =>
  `${normalizePoolSegment(persona, 'mixed')}__${normalizePoolSegment(
    timeInCanada,
    'unknown'
  )}`;

export const formatPersonaLabel = (
  t: TranslateFn,
  persona?: PoolPersona | string | null
) => {
  if (!persona) {
    return t(PERSONA_LABEL_KEYS.other);
  }
  const keys = PERSONA_LABEL_KEYS as Record<string, string>;
  const key = keys[persona];
  // Unknown persona values come from the database, so there is no catalogue
  // entry for them — fall back to the humanized raw value.
  return key ? t(key) : persona.replace(/_/g, ' ');
};

export const formatTimeInCanadaLabel = (
  t: TranslateFn,
  timeInCanada?: PoolTimeInCanada | null
) => {
  if (!timeInCanada) {
    return t('circles.timeInCanadaUnspecified');
  }
  const key = TIME_IN_CANADA_LABEL_KEYS[timeInCanada];
  return key ? t(key) : timeInCanada.replace(/_/g, ' ');
};

export const getPoolLabel = (
  t: TranslateFn,
  persona?: PoolPersona | null,
  timeInCanada?: PoolTimeInCanada | null
) =>
  `${formatPersonaLabel(t, persona)} • ${formatTimeInCanadaLabel(t, timeInCanada)}`;

/**
 * Derives a TimeInCanada category from an arrival date.
 * - If arrival date is in the future: 'not_arrived'
 * - Less than 1 year ago: 'less_than_1_year'
 * - 1-2 years ago: '1_to_2_years'
 * - 2-3 years ago: '2_to_3_years'
 * - 3+ years ago: '3_plus_years'
 */
export const deriveTimeInCanadaFromArrivalDate = (
  arrivalDate: string | null | undefined
): PoolTimeInCanada | null => {
  if (!arrivalDate) {
    return null;
  }

  const arrival = new Date(arrivalDate);
  const now = new Date();

  // If arrival date is in the future, user hasn't arrived yet
  if (arrival > now) {
    return 'not_arrived';
  }

  // Calculate years since arrival
  const yearsDiff =
    (now.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (yearsDiff < 1) {
    return 'less_than_1_year';
  } else if (yearsDiff < 2) {
    return '1_to_2_years';
  } else if (yearsDiff < 3) {
    return '2_to_3_years';
  } else {
    return '3_plus_years';
  }
};

export type MatchingPersona = PoolPersona | string | null;
export type MatchingTimeInCanada = PoolTimeInCanada;
