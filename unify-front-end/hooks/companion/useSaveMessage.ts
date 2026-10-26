import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveMessage,
  SaveMessageParams,
} from '@/services/companion/saveMessage';
import { ConversationMessage } from '@/services/companion/getConversationMessages';

interface SaveMessageContext {
  previousMessages: ConversationMessage[] | undefined;
}

// Optimistic rows get negative ids so they never collide with database ids.
// isConversationHistoryLoaded relies on this to tell them apart.
let nextOptimisticMessageId = -1;

const getNextOptimisticMessageId = () => {
  const id = nextOptimisticMessageId;
  nextOptimisticMessageId -= 1;
  return id;
};

export const useSaveMessage = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SaveMessageParams, SaveMessageContext>({
    mutationFn: (params: SaveMessageParams) => saveMessage(params),
    onMutate: async variables => {
      const queryKey = [
        'conversation-messages',
        variables.conversationIdentifier,
      ] as const;

      await queryClient.cancelQueries({ queryKey });

      const previousMessages =
        queryClient.getQueryData<ConversationMessage[]>(queryKey);

      const optimisticMessage: ConversationMessage = {
        id: getNextOptimisticMessageId(),
        clientId: variables.clientId,
        role: variables.role,
        content: variables.content,
        sources: variables.sources ?? null,
        companion_context: variables.companionContext ?? null,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<ConversationMessage[]>(queryKey, current => [
        ...(current ?? []),
        optimisticMessage,
      ]);

      return { previousMessages };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation-messages', variables.conversationIdentifier],
      });

      // Keep conversation list fresh (updated_at/title changes)
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });
    },
    onError: (error, variables, context) => {
      const queryKey = [
        'conversation-messages',
        variables.conversationIdentifier,
      ] as const;

      queryClient.setQueryData(queryKey, context?.previousMessages);

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      console.error('Failed to save message:', error);
    },
  });
};
