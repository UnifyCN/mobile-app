import { useQuery } from '@tanstack/react-query';
import {
  getConversationMessages,
  ConversationMessage,
} from '@/services/companion/getConversationMessages';
import { useAccountSnapshot } from '@/hooks/auth/useSessionAccountId';
import { conversationMessagesKey } from '@/hooks/companion/conversationKeys';

export const useConversationMessages = (
  conversationIdentifier: string | null
) => {
  // Keyed by account, and read only as that account.
  const owner = useAccountSnapshot();
  return useQuery<ConversationMessage[]>({
    queryKey: conversationMessagesKey(owner.accountId, conversationIdentifier),
    queryFn: () => {
      if (!conversationIdentifier) {
        throw new Error('Conversation identifier is required');
      }
      return getConversationMessages(conversationIdentifier, owner);
    },
    enabled: !!conversationIdentifier && !!owner.accountId,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};
