import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { withAppPlatform } from '@/utils/appPlatform';
import { DEFAULT_CONVERSATION_TITLE } from '@/helpers/companion/conversationHelpers';
import {
  assertOwned,
  isAccountChange,
  type AccountSnapshot,
} from '@/services/account/accountSession';

export interface CreateConversationResponse {
  conversation_identifier: string;
  id: number;
}

export interface CreateConversationParams {
  firstMessage?: string;
  /**
   * The account the conversation is created for (mobile-app#361). Every request
   * of the creation, including the background title, is made only while it is
   * the signed-in account.
   */
  owner: AccountSnapshot;
}

const FALLBACK_TITLE_MAX_LENGTH = 50;

const buildFallbackTitle = (firstMessage: string): string =>
  firstMessage.length > FALLBACK_TITLE_MAX_LENGTH
    ? firstMessage.substring(0, FALLBACK_TITLE_MAX_LENGTH) + '...'
    : firstMessage;

const generateTitle = async (firstMessage: string): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-title', {
      body: withAppPlatform({
        message: firstMessage,
      }),
    });

    if (error || !data || !data.title) {
      return buildFallbackTitle(firstMessage);
    }

    return data.title.trim();
  } catch (error) {
    console.error('Error generating title:', error);
    return buildFallbackTitle(firstMessage);
  }
};

const updateConversationTitle = async (
  conversationId: number,
  userId: string,
  firstMessage: string,
  owner: AccountSnapshot
) => {
  try {
    assertOwned(owner);
    const generatedTitle = await generateTitle(firstMessage);
    if (!generatedTitle) {
      return;
    }

    assertOwned(owner);
    const { error } = await supabase
      .from('conversations')
      .update({ title: generatedTitle })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update conversation title:', error);
      return;
    }

    assertOwned(owner);
    queryClient.invalidateQueries({
      queryKey: ['conversations'],
    });
  } catch (error) {
    // Another account signed in: the title is left as the fallback.
    if (isAccountChange(error)) return;
    console.error('Failed to generate or update conversation title:', error);
  }
};

export const createConversation = async (
  params: CreateConversationParams
): Promise<CreateConversationResponse> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');
    const { owner } = params;
    assertOwned(owner, user.id);

    // Generate title from first message if provided
    let title = DEFAULT_CONVERSATION_TITLE;
    if (params.firstMessage && params.firstMessage.trim()) {
      title = buildFallbackTitle(params.firstMessage.trim());
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title,
        // conversation_identifier and timestamps are auto-generated
      })
      .select('conversation_identifier, id')
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from conversation creation');
    }

    // The insert may answer after another account signed in: then nothing
    // more is requested, not even the title from the private first message.
    assertOwned(owner);
    if (params.firstMessage && params.firstMessage.trim()) {
      void updateConversationTitle(
        data.id,
        user.id,
        params.firstMessage.trim(),
        owner
      );
    }

    return {
      conversation_identifier: data.conversation_identifier,
      id: data.id,
    };
  } catch (error) {
    if (!isAccountChange(error))
      console.error('Error in createConversation:', error);
    throw error;
  }
};
