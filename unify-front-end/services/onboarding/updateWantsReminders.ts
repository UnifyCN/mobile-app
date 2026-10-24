import { supabase } from '@/lib/supabase';

/**
 * Writes only wants_reminders for one user. A cached full profile must never
 * be written back for this: it can hold an older arrival date. Throws unless
 * the database confirms the updated row.
 */
export const updateWantsReminders = async (
  userId: string,
  wantsReminders: boolean
): Promise<void> => {
  const { data, error } = await supabase
    .from('user_onboarding_profiles')
    .update({ wants_reminders: wantsReminders })
    .eq('id', userId)
    .select('id, wants_reminders');

  if (error) {
    throw new Error(`Failed to update reminder preference: ${error.message}`);
  }
  const row = data?.length === 1 ? data[0] : null;
  if (!row || row.wants_reminders !== wantsReminders) {
    throw new Error('Reminder preference update was not confirmed');
  }
};
