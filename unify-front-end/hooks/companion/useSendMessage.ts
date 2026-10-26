import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AICompanionBusyError,
  AICompanionLimitError,
  streamGeminiAPI,
  StreamComplete,
  StreamMetadata,
} from '@/utils/gemini';
import { useChatbotUsage } from '@/hooks/companion/useChatbotUsage';
import { useCreateConversation } from '@/hooks/companion/useCreateConversation';
import { useSaveMessage } from '@/hooks/companion/useSaveMessage';
import {
  Message,
  formatMessagesForAPI,
  sanitizeSuggestedNextSteps,
} from '@/helpers/companion/messageHelpers';
import {
  CompanionInputSource,
  buildCompanionMessageSentProperties,
  buildCompanionStreamResponseProperties,
} from '@/helpers/companion/companionAnalytics';
import { useAnalytics } from '@/utils/analytics';
import {
  parseCompanionContext,
  savableCompanionContext,
} from '@/helpers/companion/companionContext';

type SendMessageError = Error & {
  messagePersisted?: boolean;
};

interface UseSendMessageParams {
  messages: Message[];
  currentConversationId: string | null;
  /** Whether the current conversation's saved messages have loaded. */
  isHistoryLoaded: boolean;
  setCurrentConversationId: (id: string | null) => void;
  isPremium: boolean;
}

export const useSendMessage = ({
  messages,
  currentConversationId,
  isHistoryLoaded,
  setCurrentConversationId,
  isPremium,
}: UseSendMessageParams) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForBot, setIsWaitingForBot] = useState(false);
  const [lastSuggestedNextSteps, setLastSuggestedNextSteps] = useState<
    string[] | undefined
  >(undefined);
  const [lastVerified, setLastVerified] = useState<string | undefined>(
    undefined
  );
  // In-flight bot message — appears in the UI as tokens stream in. Cleared
  // once the final saved message lands in the React Query cache via
  // useSaveMessage (which inserts an optimistic copy on mutate).
  const [streamingBotMessage, setStreamingBotMessage] =
    useState<Message | null>(null);
  const queryClient = useQueryClient();
  const { data: usage } = useChatbotUsage();
  const createConversation = useCreateConversation();
  const saveMessage = useSaveMessage();
  const { trackCompanionMessageSent, trackCompanionResponseReceived } =
    useAnalytics();

  const sendMessage = async (
    messageText: string,
    optimisticClientId?: string,
    inputSource: CompanionInputSource = 'typed'
  ): Promise<void> => {
    setIsLoading(true);
    setIsWaitingForBot(true);
    setLastSuggestedNextSteps(undefined);
    setLastVerified(undefined);
    setStreamingBotMessage(null);
    let userMessagePersisted = false;

    try {
      let conversationIdToUse = currentConversationId;
      const isNewConversation = !currentConversationId;

      // If no conversation exists yet, create a new one with title generated from first message
      if (!conversationIdToUse) {
        try {
          const newConversation = await createConversation.mutateAsync({
            firstMessage: messageText,
          });
          conversationIdToUse = newConversation.conversation_identifier;
          setCurrentConversationId(conversationIdToUse);
        } catch (error) {
          console.error('Failed to create conversation:', error);
          setIsLoading(false);
          throw error;
        }
      }

      // Tracked here, not in the screen, because a new conversation only has
      // an id after createConversation. `messages` holds the conversation as
      // it was before this message, so it gives the turn number once the
      // conversation's history has loaded.
      trackCompanionMessageSent(
        buildCompanionMessageSentProperties({
          messageLength: messageText.length,
          conversationId: conversationIdToUse,
          priorMessages: messages,
          isNewConversation,
          historyLoaded: isHistoryLoaded,
          inputSource,
        })
      );

      // Save user message to database
      try {
        await saveMessage.mutateAsync({
          conversationIdentifier: conversationIdToUse,
          role: 'user',
          content: messageText,
          clientId: optimisticClientId,
        });
        userMessagePersisted = true;
      } catch (error) {
        console.error('Failed to save user message:', error);
        // Continue anyway - message will be saved but might not show immediately
      }

      // Format messages for RAG API (last 10 messages for context)
      const conversationMessages = formatMessagesForAPI(messages, messageText);

      // Stream the bot response. Tokens append to streamingBotMessage so the
      // bubble grows in real time. The final cleanAnswer (from `complete`) is
      // persisted via useSaveMessage.
      const apiStartTime = Date.now();
      let metadata: StreamMetadata | undefined;
      let completion: StreamComplete | undefined;
      let streamFailure: Error | undefined;

      const streamingBotId = `streaming-bot-${apiStartTime}`;

      await new Promise<void>(resolve => {
        let resolved = false;
        const finishOnce = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        streamGeminiAPI(
          messageText,
          conversationIdToUse!,
          conversationMessages,
          {
            onMetadata: meta => {
              metadata = meta;
              // Hide the typing indicator — we now show the (empty) bot
              // bubble that will fill with tokens.
              setIsWaitingForBot(false);
              setStreamingBotMessage({
                id: streamingBotId,
                text: '',
                isUser: false,
                timestamp: new Date(),
                sources: meta.sources,
                queryType: meta.queryType,
                disclaimer: meta.disclaimer,
                lastVerified: meta.lastVerified,
                // Shown while the answer streams; saved with it below.
                companionContext: parseCompanionContext(meta.context),
              });
              if (meta.lastVerified) setLastVerified(meta.lastVerified);
            },
            onToken: delta => {
              setStreamingBotMessage(current => {
                if (!current) {
                  // Metadata never arrived (shouldn't happen) — synthesize.
                  return {
                    id: streamingBotId,
                    text: delta,
                    isUser: false,
                    timestamp: new Date(),
                  };
                }
                return { ...current, text: current.text + delta };
              });
            },
            onComplete: c => {
              completion = c;
              finishOnce();
            },
            onError: err => {
              streamFailure = err;
              finishOnce();
            },
          }
        ).catch(err => {
          streamFailure =
            err instanceof Error ? err : new Error(String(err));
          finishOnce();
        });
      });

      const responseTimeMs = Date.now() - apiStartTime;

      if (streamFailure) throw streamFailure;
      if (!completion) throw new Error('Stream ended without completion');

      // Server incremented usage atomically during rag-query.
      // Invalidate the cache so the UI picks up the new count.
      queryClient.invalidateQueries({ queryKey: ['chatbot-usage'] });

      const sources = metadata?.sources ?? [];
      const sanitizedSuggestions = sanitizeSuggestedNextSteps(
        completion.suggestedNextSteps
      );

      // Track companion response with cost metrics
      trackCompanionResponseReceived(
        buildCompanionStreamResponseProperties({
          metadata,
          completion,
          responseTimeMs,
        })
      );

      // Store real-time-only fields for UI display (not persisted to DB)
      setLastSuggestedNextSteps(sanitizedSuggestions);

      // Replace the in-flight streaming text with the canonical cleanAnswer
      // (handles [SUGGESTIONS]: stripping). One last paint before we hand off
      // to the persisted message in the RQ cache.
      setStreamingBotMessage(current =>
        current ? { ...current, text: completion!.cleanAnswer } : current
      );

      // Save bot message to database
      // Note: queryType, disclaimer, and suggestedNextSteps are not persisted to DB
      // They're only used for immediate UI display
      try {
        await saveMessage.mutateAsync({
          conversationIdentifier: conversationIdToUse,
          role: 'assistant',
          content: completion.cleanAnswer,
          sources: sources.length > 0 ? sources : undefined,
          // Saved with the answer so a reopened conversation shows the same
          // sources and context. Never sent to analytics.
          companionContext: savableCompanionContext(metadata?.context),
        });
      } catch (error) {
        console.error('Failed to save bot message:', error);
        // Continue anyway - message will be saved but might not show immediately
      }

      // The persisted (or RQ-optimistic) bot message now owns this bubble —
      // drop our local copy to avoid a duplicate.
      setStreamingBotMessage(null);
    } catch (error) {
      console.error('Gemini API error:', error);
      console.error(
        'Error details:',
        error instanceof Error ? error.message : String(error)
      );
      // Drop any partial streaming bubble on failure.
      setStreamingBotMessage(null);
      const sendError =
        error instanceof Error
          ? (error as SendMessageError)
          : (new Error(String(error)) as SendMessageError);
      sendError.messagePersisted = userMessagePersisted;
      // Preserve typed errors (busy / daily-limit) so callers can match on
      // instanceof and show the right toast.
      if (
        error instanceof AICompanionBusyError ||
        error instanceof AICompanionLimitError
      ) {
        throw error;
      }
      throw sendError;
    } finally {
      setIsLoading(false);
      setIsWaitingForBot(false);
    }
  };

  return {
    sendMessage,
    isLoading,
    isWaitingForBot,
    lastSuggestedNextSteps,
    lastVerified,
    streamingBotMessage,
  };
};
