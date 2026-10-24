import { supabase } from '@/lib/supabase';
import { getArrivalStage } from '@/helpers/arrivalDate';
import { isArrivalDateInRange } from '@/helpers/arrivalDatePicker';
import {
  normalizeStoredArrivalDate,
  resolveStoredStage,
} from '@/supabase/functions/_shared/arrivalStage';
import type { StageNumber } from '@/types/checklist';

/** What the database confirmed for one arrival-date write. */
export interface ConfirmedArrival {
  id: string;
  arrival_date: string;
  /** Stored stage cache, normalized. Null means unknown or unreadable. */
  stage: StageNumber | null;
}

/**
 * Writes only arrival_date and the stage cache for one user. Not
 * saveOnboardingProfile: its upsert defaults would reset unrelated fields.
 * Throws unless the database confirms the updated row. The hosted date column
 * is a timestamptz, so the confirmed date is read back as the calendar date
 * the timestamp stands for. The stage column is an enum, so the API returns it
 * as a string; it is normalized here.
 */
export const updateArrivalDate = async (
  userId: string,
  arrivalDate: string
): Promise<ConfirmedArrival> => {
  const today = new Date();
  if (!isArrivalDateInRange(arrivalDate, today)) {
    throw new Error('Arrival date is invalid or out of range');
  }

  const { data, error } = await supabase
    .from('user_onboarding_profiles')
    .update({
      arrival_date: arrivalDate,
      stage: getArrivalStage(arrivalDate, today),
    })
    .eq('id', userId)
    .select('id, arrival_date, stage');

  if (error) {
    throw new Error(`Failed to update arrival date: ${error.message}`);
  }
  const row = data?.length === 1 ? data[0] : null;
  // The column is a timestamp, so the row holds the date as an instant. Compare
  // the calendar date it stands for with the date that was sent.
  const confirmedDate = normalizeStoredArrivalDate(row?.arrival_date);
  if (!row || row.id !== userId || confirmedDate !== arrivalDate) {
    throw new Error('Arrival date update was not confirmed');
  }
  return {
    id: row.id,
    arrival_date: confirmedDate,
    stage: resolveStoredStage(row.stage),
  };
};
