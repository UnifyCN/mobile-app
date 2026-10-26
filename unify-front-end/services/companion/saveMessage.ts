import { supabase } from '@/lib/supabase';
import { QueryType } from '@/types/chatbot';
import { isMissingContextColumn } from '@/services/companion/getConversationMessages';

export interface SaveMessageParams {
  conversationIdentifier: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any; // JSONB field
  clientId?: string;
  suggestedNextSteps?: string[]; // Optional - not persisted to DB, used for UI only
  /** The answer's context (ticket #362); saved when the column exists. */
  companionContext?: Record<string, unknown> | null;
}

export const saveMessage = async ({
  conversationIdentifier,
  role,
  content,
  sources,
  companionContext,
}: SaveMessageParams): Promise<void> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

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
    const row = {
      conversation_id: conversation.id,
      role,
      content,
      sources: sources || null,
    };
    let { error: messageError } = await supabase
      .from('messages')
      .insert(
        companionContext ? { ...row, companion_context: companionContext } : row
      );
    if (
      messageError &&
      companionContext &&
      isMissingContextColumn(messageError)
    ) {
      // Column not migrated yet: save the answer without its context.
      ({ error: messageError } = await supabase.from('messages').insert(row));
    }

    if (messageError) {
      throw messageError;
    }
  } catch (error) {
    console.error('Error in saveMessage:', error);
    throw error;
  }
};
