import i18n from '@/i18n';

/** Events in the shared table are BC-based and store exact UTC instants. */
export const EVENT_TIME_ZONE = 'America/Vancouver';

// Helpers below intentionally read from the i18n singleton (i18n.t / i18n.language)
// rather than taking a TFunction param. Components that render strings produced by
// these helpers should call useTranslation() so they re-render on language change —
// every current call site already does, since they render translated text alongside.

export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  // Future timestamps would otherwise produce negative counts; clamp to 0.
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return i18n.t('common.justNow');
  if (diffMins < 60) return i18n.t('common.minutesAgo', { count: diffMins });
  if (diffHours < 24) return i18n.t('common.hoursAgo', { count: diffHours });
  if (diffDays < 7) return i18n.t('common.daysAgo', { count: diffDays });
  return date.toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
  });
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(i18n.language, {
    month: 'long',
    day: 'numeric',
  });
};

export const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString(i18n.language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatEventDate = (dateString: string) => {
  if (!dateString) {
    return '';
  }
  const date = new Date(dateString);
  return date.toLocaleDateString(i18n.language, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: EVENT_TIME_ZONE,
  });
};

export const formatEventTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString(i18n.language, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: EVENT_TIME_ZONE,
  });
};

export const formatEventTimeRange = (
  startDate: string,
  endDate?: string | null
) => {
  if (!endDate) {
    return formatEventTime(startDate);
  }
  return `${formatEventTime(startDate)} - ${formatEventTime(endDate)}`;
};

export const calculateUserStage = (givenTime: Date): number => {
  const currentTime = new Date();

  // If given time is in the future, return 0
  if (givenTime > currentTime) {
    return 0;
  }

  // Calculate difference in months
  const diffInMs = currentTime.getTime() - givenTime.getTime();
  const diffInMonths = diffInMs / (1000 * 60 * 60 * 24 * 30.44); // Average days per month

  if (diffInMonths < 3) {
    return 1;
  } else if (diffInMonths < 12) {
    return 2;
  } else if (diffInMonths < 36) {
    return 3;
  } else {
    return 4;
  }
};

export const stageNumberToEnum = (stageNumber: number): string => {
  return stageNumber.toString();
};

export const stageEnumToNumber = (stageEnum: string): number => {
  return parseInt(stageEnum, 10) || 0;
};

/**
 * Map app stage (0–4) to Sanity stage slug for checklist (exactly 5 values).
 * Unknown stage (null, e.g. no arrival date) maps to arrived_0_3_months.
 */
export const stageNumberToStageSlug = (stage: number | null): string => {
  switch (stage) {
    case 0:
      return 'not_arrived';
    case 1:
      return 'arrived_0_3_months';
    case 2:
      return 'months_3_12';
    case 3:
      return 'years_1_3';
    case 4:
      return 'years_3_plus';
    default:
      return 'arrived_0_3_months';
  }
};

/** Allowed persona slugs for Sanity checklist. Unknown → null so we do not pass to GROQ. */
const CHECKLIST_PERSONA_SLUGS = [
  'international_student',
  'refugee',
  'protected_person',
  'skilled_worker',
  'immigrant',
  'pr',
  'other',
] as const;

export const normalizePersonaSlug = (persona: string | null): string | null => {
  if (!persona) return null;
  const p = persona.toLowerCase().trim();
  return CHECKLIST_PERSONA_SLUGS.find(slug => slug === p) ?? null;
};
