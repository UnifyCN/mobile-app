import { useQuery } from '@tanstack/react-query';
import { getChatbotUsage } from '@/services/companion/getChatbotUsage';
import { useAccountSnapshot } from '@/hooks/auth/useSessionAccountId';
import { ownAccountWork } from '@/services/account/accountSession';
import { ChatbotUsage } from '@/types/chatbot';

export const useChatbotUsage = () => {
  const { accountId, epoch } = useAccountSnapshot();
  const owner = ownAccountWork();
  return useQuery<ChatbotUsage>({
    queryKey: ['chatbot-usage', accountId, epoch],
    queryFn: () => getChatbotUsage(owner),
    enabled: Boolean(accountId),
    refetchInterval: 60_000,
  });
};
