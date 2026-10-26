import { useQuery } from '@tanstack/react-query';
import {
  getConversations,
  Conversation,
} from '@/services/companion/getConversations';
import { useSessionAccountId } from '@/hooks/auth/useSessionAccountId';
import { conversationsKey } from '@/hooks/companion/conversationKeys';

export const useConversations = () => {
  // Keyed by account: another account signing in switches a mounted list to
  // its own entry instead of showing the previous account's titles.
  const accountId = useSessionAccountId();
  return useQuery<Conversation[]>({
    queryKey: conversationsKey(accountId),
    queryFn: () => getConversations(),
    enabled: Boolean(accountId),
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};
