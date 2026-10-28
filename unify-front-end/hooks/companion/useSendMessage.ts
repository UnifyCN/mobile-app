import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  AccountChangedError,
  ownAccountWork,
  stillOwned,
} from '@/services/account/accountSession';
import { useAccountSnapshot } from '@/hooks/auth/useSessionAccountId';
import {
  parseCompanionContext,
  savableCompanionContext,
} from '@/helpers/companion/companionContext';
import {
  conversationActionsKey,
  useTaskActionStore,
} from '@/hooks/companion/useTaskActions';
import { createMobileTaskActionClient } from '@/services/companionActions/transport';
import {
  DETAIL_TEXT_MAX,
  TITLE_MAX,
  createTaskOperation,
  parseSuggestedDetail,
  parseSuggestedSteps,
  parseSuggestedTask,
  type CommandResult,
} from '@/services/companionActions/contract';
import { parseSuggestedPlan } from '@/services/companionActions/planContract';
import {
  conversationPlansKey,
  createMobilePlanClient,
  plansKey,
} from '@/hooks/companion/usePlans';

/**
 * The question or explanation Companion saves for a command that writes nothing (#363
 * unclear task commands; #370 unclear remember commands, a detail already saved, and a
 * profile fact, which the profile owns).
 */
function commandReply(
  t: (key: string, options?: Record<string, unknown>) => string,
  command: Exclude<CommandResult, { kind: 'none' }>
): string {
  switch (command.kind) {
    case 'create':
      return t('taskCreate.clarifyDuplicate', {
        title: command.sameTitleTasks[0]?.title ?? command.operation.title,
      });
    case 'clarify':
      return t(
        command.reason === 'missing_title'
          ? 'taskCreate.clarifyMissingTitle'
          : command.reason === 'multiple'
            ? 'taskCreate.clarifyMultiple'
            : 'taskCreate.clarifyTooLong',
        { max: TITLE_MAX }
      );
    case 'remember':
      return t('savedDetails.commandExists');
    case 'remember_clarify':
      return t(
        command.reason === 'missing_detail'
          ? 'savedDetails.clarifyMissing'
          : command.reason === 'unclear_reference'
            ? 'savedDetails.clarifyUnclear'
            : command.reason === 'multiple'
              ? 'savedDetails.clarifyMultiple'
              : 'savedDetails.clarifyTooLong',
        { max: DETAIL_TEXT_MAX }
      );
    case 'profile_fact':
      return t(
        command.field === 'province'
          ? 'savedDetails.profileFactProvince'
          : command.field === 'arrival_date'
            ? 'savedDetails.profileFactArrival'
            : 'savedDetails.profileFactPersona'
      );
  }
}

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
  // A send belongs to the account that started it (mobile-app#361). When
  // another account signs in, this hook drops that send's on-screen state, and
  // the send itself stops before its next request or result.
  const { epoch } = useAccountSnapshot();
  const [stateEpoch, setStateEpoch] = useState(epoch);
  if (epoch !== stateEpoch) {
    setStateEpoch(epoch);
    setIsLoading(false);
    setIsWaitingForBot(false);
    setLastSuggestedNextSteps(undefined);
    setLastVerified(undefined);
    setStreamingBotMessage(null);
  }
  const queryClient = useQueryClient();
  const { data: usage } = useChatbotUsage();
  const createConversation = useCreateConversation();
  const saveMessage = useSaveMessage();
  const { trackCompanionMessageSent, trackCompanionResponseReceived } =
    useAnalytics();
  const { t } = useTranslation();
  // The signed-in account's action store: a clear command's write is tracked there.
  const actionStore = useTaskActionStore('companion');

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
    const owner = ownAccountWork();
    const owned = () => stillOwned(owner);
    const ensureOwned = () => {
      if (!owned()) throw new AccountChangedError();
    };

    try {
      // Unknown ownership is not permission: nothing is sent until the
      // session names the account (the screen keeps the text until then).
      ensureOwned();
      let conversationIdToUse = currentConversationId;
      const isNewConversation = !currentConversationId;

      // If no conversation exists yet, create a new one with title generated from first message
      if (!conversationIdToUse) {
        try {
          const newConversation = await createConversation.mutateAsync({
            firstMessage: messageText,
            owner,
          });
          ensureOwned();
          conversationIdToUse = newConversation.conversation_identifier;
          setCurrentConversationId(conversationIdToUse);
        } catch (error) {
          ensureOwned();
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
      ensureOwned();
      let savedUserId: number | null = null;
      try {
        const savedUser = await saveMessage.mutateAsync({
          conversationIdentifier: conversationIdToUse,
          role: 'user',
          content: messageText,
          clientId: optimisticClientId,
          owner,
        });
        userMessagePersisted = true;
        savedUserId = savedUser.id;
      } catch (error) {
        console.error('Failed to save user message:', error);
        // Continue anyway - message will be saved but might not show immediately
      }

      ensureOwned();
      // #363: the action service reads the user's own saved message. A clear create
      // command adds exactly its task (no AI answer, no allowance used); an unclear
      // one gets a question and writes nothing. Otherwise the AI answers as before.
      // An unavailable action service never blocks the answer.
      // #370: a clear remember command saves exactly its detail the same way; an
      // unclear one, a detail already saved or a profile fact gets a reply and writes
      // nothing.
      const actions = createMobileTaskActionClient(owner);
      if (savedUserId !== null) {
        const interpreted = await actions.interpret(savedUserId);
        ensureOwned();
        if (interpreted.kind === 'ok' && interpreted.command.kind !== 'none') {
          const command = interpreted.command;
          if (
            (command.kind === 'create' &&
              command.sameTitleTasks.length === 0) ||
            (command.kind === 'remember' &&
              command.sameTextDetails.length === 0)
          ) {
            setIsWaitingForBot(false);
            await actionStore?.applyOperation(
              `command:${savedUserId}`,
              command.operation,
              { kind: 'direct_command', message_id: savedUserId }
            );
            ensureOwned();
          } else {
            const question = commandReply(t, command);
            await saveMessage.mutateAsync({
              conversationIdentifier: conversationIdToUse,
              role: 'assistant',
              content: question,
              owner,
            });
            ensureOwned();
          }
          queryClient.invalidateQueries({
            queryKey: conversationActionsKey(
              owner.accountId,
              conversationIdToUse
            ),
          });
          return;
        }
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
              if (!owned()) return;
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
              if (!owned()) return;
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
          },
          owner
        ).catch(err => {
          streamFailure =
            err instanceof Error ? err : new Error(String(err));
          finishOnce();
        });
      });

      ensureOwned();
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
      ensureOwned();
      let savedAnswerId: number | null = null;
      try {
        const savedAnswer = await saveMessage.mutateAsync({
          conversationIdentifier: conversationIdToUse,
          role: 'assistant',
          content: completion.cleanAnswer,
          sources: sources.length > 0 ? sources : undefined,
          // Saved with the answer so a reopened conversation shows the same
          // sources and context. Never sent to analytics.
          companionContext: savableCompanionContext(metadata?.context),
          owner,
        });
        savedAnswerId = savedAnswer.id;
      } catch (error) {
        console.error('Failed to save bot message:', error);
        // Continue anyway - message will be saved but might not show immediately
      }

      // #364: a suggested plan becomes a server-owned plan draft for review, tied to
      // this answer. The action service checks every reused task again; preparing
      // writes no task and no plan. A failure only means no plan card.
      const suggestedPlan = parseSuggestedPlan(completion.actionProposal);
      ensureOwned();
      if (suggestedPlan && savedAnswerId !== null) {
        await createMobilePlanClient(owner).prepare(suggestedPlan.goal, suggestedPlan.items, {
          conversationId: conversationIdToUse,
          messageId: savedAnswerId,
        });
        ensureOwned();
        queryClient.invalidateQueries({
          queryKey: conversationPlansKey(owner.accountId, conversationIdToUse),
        });
        queryClient.invalidateQueries({ queryKey: plansKey(owner.accountId ?? null) });
      }

      // #363: a suggested task becomes a server-owned draft for review, tied to this
      // answer. Preparing writes no task; a failure only means no draft card.
      const suggested = parseSuggestedTask(completion.actionProposal);
      ensureOwned();
      if (suggested && savedAnswerId !== null) {
        await actions.prepare(createTaskOperation(suggested.title), {
          conversationId: conversationIdToUse,
          messageId: savedAnswerId,
        });
        ensureOwned();
        queryClient.invalidateQueries({
          queryKey: conversationActionsKey(owner.accountId, conversationIdToUse),
        });
      }
      // #366: suggested steps for one Checklist task become a server-owned draft too.
      // The action service checks the task is this account's live task; nothing is saved.
      const suggestedSteps = parseSuggestedSteps(completion.actionProposal);
      if (suggestedSteps && savedAnswerId !== null) {
        await actions.prepareSteps(
          {
            type: 'step.create',
            task_ref: suggestedSteps.taskRef,
            titles: suggestedSteps.titles,
          },
          { conversationId: conversationIdToUse, messageId: savedAnswerId }
        );
        ensureOwned();
        queryClient.invalidateQueries({
          queryKey: conversationActionsKey(owner.accountId, conversationIdToUse),
        });
      }

      // #370: a detail the answer suggested saving becomes a server-owned draft, asked
      // under this answer. Nothing is saved until the user approves it.
      const suggestedDetail = parseSuggestedDetail(completion.actionProposal);
      if (suggestedDetail && savedAnswerId !== null) {
        await actions.prepareDetail(
          { type: 'detail.create', text: suggestedDetail.text },
          { conversationId: conversationIdToUse, messageId: savedAnswerId }
        );
        ensureOwned();
        queryClient.invalidateQueries({
          queryKey: conversationActionsKey(owner.accountId, conversationIdToUse),
        });
      }

      // The persisted (or RQ-optimistic) bot message now owns this bubble —
      // drop our local copy to avoid a duplicate.
      ensureOwned();
      setStreamingBotMessage(null);
    } catch (error) {
      // Another account signed in: nothing of this send may reach its screen.
      if (!owned()) throw new AccountChangedError();
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
      if (owned()) {
        setIsLoading(false);
        setIsWaitingForBot(false);
      }
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
