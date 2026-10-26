import { useQuery } from '@tanstack/react-query';
import {
  getConversationMessages,
  ConversationMessage,
} from '@/services/companion/getConversationMessages';
import { useSessionAccountId } from '@/hooks/auth/useSessionAccountId';
import { conversationMessagesKey } from '@/hooks/companion/conversationKeys';

export const useConversationMessages = (
  conversationIdentifier: string | null
) => {
  const accountId = useSessionAccountId();
  return useQuery<ConversationMessage[]>({
    queryKey: conversationMessagesKey(accountId, conversationIdentifier),
    queryFn: () => {
      if (!conversationIdentifier) {
        throw new Error('Conversation identifier is required');
      }
      return getConversationMessages(conversationIdentifier);
    },
    enabled: !!conversationIdentifier && !!accountId,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};
