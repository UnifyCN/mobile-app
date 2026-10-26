import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  CreateConversationResponse,
  CreateConversationParams,
} from '@/services/companion/createConversation';
import { CONVERSATIONS_ROOT } from '@/hooks/companion/conversationKeys';

export const useCreateConversation = () => {
  const queryClient = useQueryClient();

  return useMutation<
    CreateConversationResponse,
    Error,
    CreateConversationParams | undefined
  >({
    mutationFn: params => createConversation(params),
    onSuccess: () => {
      // Invalidate conversations list to show the new conversation
      queryClient.invalidateQueries({
        queryKey: [CONVERSATIONS_ROOT],
      });
    },
    onError: error => {
      console.error('Failed to create conversation:', error);
    },
  });
};
