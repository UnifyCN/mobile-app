/**
 * Conversation query keys carry the account id (mobile-app#361), so a mounted
 * list or thread never reads another account's entry. Prefix invalidation of a
 * root still reaches every account's entry.
 */
export const CONVERSATIONS_ROOT = 'conversations' as const;
export const CONVERSATION_MESSAGES_ROOT = 'conversation-messages' as const;

export const conversationsKey = (accountId: string | null | undefined) =>
  [CONVERSATIONS_ROOT, accountId ?? null] as const;

export const conversationMessagesKey = (
  accountId: string | null | undefined,
  conversationIdentifier: string | null
) =>
  [CONVERSATION_MESSAGES_ROOT, accountId ?? null, conversationIdentifier] as const;
