import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { DEFAULT_CONVERSATION_TITLE } from '@/helpers/companion/conversationHelpers';

export interface CreateConversationResponse {
  conversation_identifier: string;
  id: number;
}

export interface CreateConversationParams {
  firstMessage?: string;
}

const FALLBACK_TITLE_MAX_LENGTH = 50;

const buildFallbackTitle = (firstMessage: string): string =>
  firstMessage.length > FALLBACK_TITLE_MAX_LENGTH
    ? firstMessage.substring(0, FALLBACK_TITLE_MAX_LENGTH) + '...'
    : firstMessage;

const generateTitle = async (firstMessage: string): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-title', {
      body: {
        message: firstMessage,
      },
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
  firstMessage: string
) => {
  try {
    const generatedTitle = await generateTitle(firstMessage);
    if (!generatedTitle) {
      return;
    }

    const { error } = await supabase
      .from('conversations')
      .update({ title: generatedTitle })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update conversation title:', error);
      return;
    }

    queryClient.invalidateQueries({
      queryKey: ['conversations'],
    });
  } catch (error) {
    console.error('Failed to generate or update conversation title:', error);
  }
};

export const createConversation = async (
  params?: CreateConversationParams
): Promise<CreateConversationResponse> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    // Generate title from first message if provided
    let title = DEFAULT_CONVERSATION_TITLE;
    if (params?.firstMessage && params.firstMessage.trim()) {
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

    if (params?.firstMessage && params.firstMessage.trim()) {
      void updateConversationTitle(
        data.id,
        user.id,
        params.firstMessage.trim()
      );
    }

    return {
      conversation_identifier: data.conversation_identifier,
      id: data.id,
    };
  } catch (error) {
    console.error('Error in createConversation:', error);
    throw error;
  }
};
