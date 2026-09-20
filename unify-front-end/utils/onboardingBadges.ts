import { deriveTimeInCanadaFromArrivalDate } from '@/matching/pools';
import { Persona } from '@/types/onboardingProfile';

export type TimeInCanadaRange =
  | 'less_than_1_year'
  | 'one_to_three_years'
  | 'three_plus_years';

export type BadgeIconName =
  | 'book-open'
  | 'briefcase'
  | 'shield'
  | 'user'
  | 'calendar';

export interface BadgeColors {
  backgroundColor: string;
  textColor: string;
}

/**
 * Badge copy lives in the locale catalogues; these maps hold i18n keys so the
 * profile renders badges in the user's language. Callers translate with `t()`.
 */
export const TIME_IN_CANADA_RANGE_LABEL_KEYS: Record<
  TimeInCanadaRange,
  string
> = {
  less_than_1_year: 'profile.badges.timeInCanada.lessThanOneYear',
  one_to_three_years: 'profile.badges.timeInCanada.oneToThreeYears',
  three_plus_years: 'profile.badges.timeInCanada.threePlusYears',
};

const PERSONA_LABEL_KEYS: Record<Exclude<Persona, 'other'>, string> = {
  international_student: 'profile.badges.persona.internationalStudent',
  skilled_worker: 'profile.badges.persona.skilledWorker',
  refugee: 'profile.badges.persona.refugee',
};

const NEWCOMER_LABEL_KEY = 'profile.badges.persona.newcomer';

const PERSONA_ICON_NAMES: Record<Persona, BadgeIconName> = {
  international_student: 'book-open',
  skilled_worker: 'briefcase',
  refugee: 'shield',
  other: 'user',
};

const PERSONA_COLORS: Record<Persona, BadgeColors> = {
  international_student: {
    backgroundColor: '#EAF2FF',
    textColor: '#2F5DA9',
  },
  skilled_worker: {
    backgroundColor: '#EAF7EE',
    textColor: '#2E7D32',
  },
  refugee: {
    backgroundColor: '#FFF1E6',
    textColor: '#C25A00',
  },
  other: {
    backgroundColor: '#F2F2F2',
    textColor: '#5B5B5B',
  },
};

const TIME_IN_CANADA_COLORS: Record<TimeInCanadaRange, BadgeColors> = {
  less_than_1_year: {
    backgroundColor: '#E8F7FF',
    textColor: '#1E6A8A',
  },
  one_to_three_years: {
    backgroundColor: '#F3ECFF',
    textColor: '#5A3FA6',
  },
  three_plus_years: {
    backgroundColor: '#FFF4E5',
    textColor: '#B36B00',
  },
};

export const deriveTimeInCanadaRange = (
  arrivalDate: string | null | undefined
): TimeInCanadaRange | null => {
  const timeInCanada = deriveTimeInCanadaFromArrivalDate(arrivalDate);

  if (!timeInCanada) {
    return null;
  }

  switch (timeInCanada) {
    case 'less_than_1_year':
      return 'less_than_1_year';
    case '1_to_2_years':
    case '2_to_3_years':
      return 'one_to_three_years';
    case '3_plus_years':
      return 'three_plus_years';
    case 'not_arrived':
    default:
      return null;
  }
};

export const getPersonaBadgeInfo = (
  persona: Persona | null | undefined,
  personaOther?: string | null
): {
  labelKey: string;
  /** User-entered persona text — rendered verbatim, never translated. */
  labelText?: string;
  iconName: BadgeIconName;
  colors: BadgeColors;
} | null => {
  if (!persona) {
    return null;
  }

  if (persona === 'other') {
    const trimmedOther = personaOther?.trim();
    return {
      labelKey: NEWCOMER_LABEL_KEY,
      ...(trimmedOther ? { labelText: trimmedOther } : {}),
      iconName: PERSONA_ICON_NAMES.other,
      colors: PERSONA_COLORS.other,
    };
  }

  return {
    labelKey: PERSONA_LABEL_KEYS[persona] ?? NEWCOMER_LABEL_KEY,
    iconName: PERSONA_ICON_NAMES[persona],
    colors: PERSONA_COLORS[persona],
  };
};

export const getTimeInCanadaBadgeInfo = (
  arrivalDate: string | null | undefined
): {
  labelKey: string;
  iconName: BadgeIconName;
  range: TimeInCanadaRange;
  colors: BadgeColors;
} | null => {
  const range = deriveTimeInCanadaRange(arrivalDate);

  if (!range) {
    return null;
  }

  return {
    range,
    labelKey: TIME_IN_CANADA_RANGE_LABEL_KEYS[range],
    iconName: 'calendar',
    colors: TIME_IN_CANADA_COLORS[range],
  };
};
