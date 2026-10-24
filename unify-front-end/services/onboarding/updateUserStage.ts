import { supabase } from '@/lib/supabase';
import type { StageNumber } from '@/types/checklist';

/** Write the stage cache. Null means unknown (no usable arrival date). */
export const updateUserStage = async (
  userId: string,
  stage: StageNumber | null
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('user_onboarding_profiles')
      .update({ stage })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update user stage: ${error.message}`);
    }
  } catch (error) {
    console.error('Error updating user stage:', error);
    throw error;
  }
};
