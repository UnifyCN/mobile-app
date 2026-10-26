import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveMessage,
  SaveMessageParams,
  type SavedMessage,
} from '@/services/companion/saveMessage';
import { ConversationMessage } from '@/services/companion/getConversationMessages';
import {
  stillOwned,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import {
  CONVERSATIONS_ROOT,
  conversationMessagesKey,
} from '@/hooks/companion/conversationKeys';

interface SaveMessageContext {
  owner: AccountSnapshot;
  previousMessages: ConversationMessage[] | undefined;
  /** The thread entry of the account that saved the message. */
  queryKey: ReturnType<typeof conversationMessagesKey>;
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

  return useMutation<
    SavedMessage,
    Error,
    SaveMessageParams,
    SaveMessageContext
  >({
    mutationFn: (params: SaveMessageParams) => saveMessage(params),
    onMutate: async variables => {
      // The account that sends the message owns its optimistic row and every
      // later cache write of this save. Once another account signs in (or the
      // session is unknown), this save writes nothing more to the cache: its
      // entries were cleared with that account and must not come back.
      const { owner } = variables;
      const queryKey = conversationMessagesKey(
        owner.accountId,
        variables.conversationIdentifier
      );

      await queryClient.cancelQueries({ queryKey });
      if (!stillOwned(owner))
        return { owner, previousMessages: undefined, queryKey };

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

      return { owner, previousMessages, queryKey };
    },
    onSuccess: (_data, _variables, context) => {
      if (!context || !stillOwned(context.owner)) return;
      queryClient.invalidateQueries({ queryKey: context.queryKey });

      // Keep conversation list fresh (updated_at/title changes)
      queryClient.invalidateQueries({
        queryKey: [CONVERSATIONS_ROOT],
      });
    },
    onError: (error, _variables, context) => {
      if (!context || !stillOwned(context.owner)) return;
      queryClient.setQueryData(context.queryKey, context.previousMessages);

      queryClient.invalidateQueries({
        queryKey: [CONVERSATIONS_ROOT],
      });

      console.error('Failed to save message:', error);
    },
  });
};
