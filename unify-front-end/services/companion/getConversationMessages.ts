import { supabase } from '@/lib/supabase';
import { QueryType } from '@/types/chatbot';

export interface ConversationMessage {
  id: number;
  clientId?: string;
  role: 'user' | 'assistant';
  content: string;
  sources: any | null; // JSONB field
  query_type?: QueryType; // Optional - may not exist in DB yet
  disclaimer?: string; // Optional - may not exist in DB yet
  /** Saved Companion context (ticket #362), unvalidated. Absent until the
   *  additive companion_context migration is applied. */
  companion_context?: unknown;
  created_at: string;
}

/**
 * True when PostgREST rejects `messages.companion_context` because the
 * additive migration is not applied yet (42703 / PGRST204 / schema cache).
 * Callers then retry without the column, so chat keeps working.
 */
export const isMissingContextColumn = (error: unknown): boolean => {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === '42703' ||
    e.code === 'PGRST204' ||
    /companion_context/i.test(e.message ?? '')
  );
};

const MESSAGE_COLUMNS = `
        id,
        role,
        content,
        sources,
        created_at,
        conversations!inner(conversation_identifier, user_id)
      `;

export const getConversationMessages = async (
  conversationIdentifier: string
): Promise<ConversationMessage[]> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    // Use a join to fetch messages directly by conversation_identifier
    // Note: query_type and disclaimer columns are optional - only include if they exist in your DB
    const query = (columns: string) =>
      supabase
        .from('messages')
        .select(columns)
        .eq('conversations.conversation_identifier', conversationIdentifier)
        .eq('conversations.user_id', user.id) // Ensure user owns this conversation
        .order('created_at', { ascending: true });
    let { data: messages, error: messagesError } = await query(
      `${MESSAGE_COLUMNS}, companion_context`
    );
    if (messagesError && isMissingContextColumn(messagesError)) {
      ({ data: messages, error: messagesError } = await query(MESSAGE_COLUMNS));
    }

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      throw messagesError;
    }

    return (messages as unknown as ConversationMessage[] | null) || [];
  } catch (error) {
    console.error('Error in getConversationMessages:', error);
    return [];
  }
};
