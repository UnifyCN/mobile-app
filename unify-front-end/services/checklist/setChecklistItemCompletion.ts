import { supabase } from '@/lib/supabase';

/**
 * Mark a checklist item as completed or not.
 * - Completed: upsert a row in user_tasks (user_id, sanity_checklist_id, completed: true).
 * - Unchecked: update completion fields while preserving independent state such as dismissed_at.
 */
export async function setChecklistItemCompletion(
  userId: string,
  sanityChecklistId: string,
  completed: boolean
): Promise<void> {
  try {
    if (completed) {
      const { error } = await supabase.from('user_tasks').upsert(
        {
          user_id: userId,
          task_id: null,
          sanity_checklist_id: sanityChecklistId,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,sanity_checklist_id',
        }
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('user_tasks')
        .update({ completed: false, completed_at: null })
        .eq('user_id', userId)
        .eq('sanity_checklist_id', sanityChecklistId);
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    console.error('Error in setChecklistItemCompletion:', error);
    throw error;
  }
}
