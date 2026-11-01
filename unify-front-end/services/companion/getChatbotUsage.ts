import { supabase } from '@/lib/supabase';
import { ChatbotUsage } from '@/types/chatbot';
import { ownAccountWork, assertOwned } from '@/services/account/accountSession';

export const getChatbotUsage = async (owner = ownAccountWork()): Promise<ChatbotUsage> => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  assertOwned(owner, user?.id ?? null);
  if (!user) throw new Error('Authentication required');
  const { data, error } = await supabase.rpc('get_chatbot_allowance');
  assertOwned(owner, user.id);
  if (error) throw error;
  if (!data || !Number.isInteger(data.message_count) || data.message_count < 0 ||
      !Number.isInteger(data.daily_limit) || data.daily_limit < 0 ||
      typeof data.is_premium !== 'boolean' ||
      (data.is_premium ? data.remaining !== null : !Number.isInteger(data.remaining) || data.remaining < 0) ||
      !Number.isFinite(Date.parse(data.resets_at)) || !Number.isFinite(Date.parse(data.observed_at))) {
    throw new Error('Invalid server allowance');
  }
  return data as ChatbotUsage;
};
