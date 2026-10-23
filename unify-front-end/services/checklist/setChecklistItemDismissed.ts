import { supabase } from '@/lib/supabase';

/** Persist whether a Sanity suggested task is hidden from this user's checklist. */
export async function setChecklistItemDismissed(
  userId: string,
  sanityChecklistId: string,
  dismissed: boolean
): Promise<void> {
  const dismissedAt = dismissed ? new Date().toISOString() : null;
  const { error } = await supabase.from('user_tasks').upsert(
    {
      user_id: userId,
      sanity_checklist_id: sanityChecklistId,
      dismissed_at: dismissedAt,
    },
    { onConflict: 'user_id,sanity_checklist_id' }
  );

  if (error) {
    throw new Error(`Failed to update checklist visibility: ${error.message}`);
  }
}
