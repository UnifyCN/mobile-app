// supabase/functions/_shared/stageContext.ts
//
// Stage-aware profile and prompt pieces for the edge functions. The stage
// always comes from arrival_date. The stored stage column is only a cache.

import {
  getArrivalStage,
  getMonthsSinceArrival,
  getStageDescription,
  normalizeStoredArrivalDate,
} from './arrivalStage.ts';
import type { OnboardingProfile } from './companionTemplates.ts';

/**
 * Companion profile with the stage recomputed from arrival_date (null =
 * unknown). The row holds the raw timestamptz, so the date is normalized to a
 * calendar date first; the profile carries only that date.
 */
export function buildCompanionProfile(
  row: Record<string, unknown>,
  today: Date = new Date()
): OnboardingProfile {
  const arrivalDate = normalizeStoredArrivalDate(row.arrival_date);
  return {
    persona: (row.persona as string | null | undefined) ?? null,
    city: (row.city as string | null | undefined) ?? null,
    province: (row.province as string | null | undefined) ?? null,
    arrival_date: arrivalDate,
    stage: getArrivalStage(arrivalDate, today),
    goals: (row.goals as string[] | null | undefined) ?? [],
    learning_interests:
      (row.learning_interests as string[] | null | undefined) ?? [],
    hobbies: (row.hobbies as string[] | null | undefined) ?? [],
  };
}

/** Daily-tip prompt line for the stage. Unknown has no line. */
export function buildStageLine(stage: unknown): string {
  const description = getStageDescription(stage);
  return description ? `- Stage (time since arrival): ${description}` : '';
}

/** Daily-tip prompt line for the arrival date. Empty when the date is missing or invalid. */
export function buildArrivalLine(
  arrivalDate: string | null | undefined,
  today: Date = new Date()
): string {
  if (getArrivalStage(arrivalDate, today) === null) return '';
  const months = getMonthsSinceArrival(arrivalDate, today);
  if (months === null) return '- Has not yet arrived in Canada';
  if (months === 0) return '- Arrived in Canada within the last month';
  return `- Has been in Canada for approximately ${months} month${months === 1 ? '' : 's'}`;
}
