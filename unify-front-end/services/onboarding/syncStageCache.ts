import { resolveStoredStage } from '@/supabase/functions/_shared/arrivalStage';
import type { StageNumber } from '@/types/checklist';
import { updateUserStage } from '@/services/onboarding/updateUserStage';

/**
 * Bring the stored stage cache in line with the stage computed from the
 * arrival date. Writes whenever they differ, including null transitions.
 * Best effort: a failed write never breaks the caller. Returns true if a
 * write succeeded. Call this only for the signed-in user's own profile.
 */
export const syncStageCache = async (
  userId: string,
  storedStage: unknown,
  computedStage: StageNumber | null
): Promise<boolean> => {
  const isCurrent =
    computedStage === null
      ? storedStage === null || storedStage === undefined
      : resolveStoredStage(storedStage) === computedStage;
  if (isCurrent) return false;

  try {
    await updateUserStage(userId, computedStage);
    return true;
  } catch (error) {
    console.warn('Failed to update onboarding stage cache:', error);
    return false;
  }
};
