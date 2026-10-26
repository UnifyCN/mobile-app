import { supabase } from '@/lib/supabase';
import {
  assertOwned,
  isAccountChange,
  type AccountSnapshot,
} from '@/services/account/accountSession';

export interface Conversation {
  conversation_identifier: string;
  title: string | null;
  updated_at: string;
}

/** The conversations of `owner`, read only while it is the signed-in account. */
export const getConversations = async (
  owner: AccountSnapshot
): Promise<Conversation[]> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');
    assertOwned(owner, user.id);

    const { data, error } = await supabase
      .from('conversations')
      .select('conversation_identifier, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    // Another account signed in: fail the read, never cache another list here.
    if (isAccountChange(error)) throw error;
    console.error('Error in getConversations:', error);
    return [];
  }
};
