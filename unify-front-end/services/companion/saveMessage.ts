import { supabase } from '@/lib/supabase';
import { QueryType } from '@/types/chatbot';
import { isMissingContextColumn } from '@/services/companion/getConversationMessages';
import {
  assertOwned,
  isAccountChange,
  type AccountSnapshot,
} from '@/services/account/accountSession';

export interface SaveMessageParams {
  conversationIdentifier: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any; // JSONB field
  clientId?: string;
  suggestedNextSteps?: string[]; // Optional - not persisted to DB, used for UI only
  /** The answer's context (ticket #362); saved when the column exists. */
  companionContext?: Record<string, unknown> | null;
  /**
   * The account that sends the message (mobile-app#361). Each request of the
   * save is made only while it is the signed-in account.
   */
  owner: AccountSnapshot;
}

/** The saved row's id: the action service reads a user's own message by it (#363). */
export interface SavedMessage {
  id: number;
}

export const saveMessage = async ({
  conversationIdentifier,
  role,
  content,
  sources,
  companionContext,
  owner,
}: SaveMessageParams): Promise<SavedMessage> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');
    assertOwned(owner, user.id);

    // First, get the conversation by identifier to get the internal id
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('conversation_identifier', conversationIdentifier)
      .eq('user_id', user.id) // Ensure user owns this conversation
      .single();

    if (convError) {
      throw new Error(`Conversation not found: ${convError.message}`);
    }

    if (!conversation) {
      throw new Error('Conversation not found - no data returned');
    }

    // Insert the message
    assertOwned(owner);
    const row = {
      conversation_id: conversation.id,
      role,
      content,
      sources: sources || null,
    };
    const insert = (values: Record<string, unknown>) =>
      supabase.from('messages').insert(values).select('id').single();
    let { data: saved, error: messageError } = await insert(
      companionContext ? { ...row, companion_context: companionContext } : row
    );
    if (
      messageError &&
      companionContext &&
      isMissingContextColumn(messageError)
    ) {
      // Column not migrated yet: save the answer without its context.
      assertOwned(owner);
      ({ data: saved, error: messageError } = await insert(row));
    }

    if (messageError) {
      throw messageError;
    }
    return { id: (saved as { id: number }).id };
  } catch (error) {
    if (!isAccountChange(error)) console.error('Error in saveMessage:', error);
    throw error;
  }
};
