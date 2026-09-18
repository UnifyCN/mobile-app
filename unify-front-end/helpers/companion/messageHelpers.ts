import { ConversationMessage } from '@/services/companion/getConversationMessages';
import { QueryType, RAGResponse, TokenUsage } from '@/types/chatbot';

export interface Source {
  document_id: number;
  document_title: string;
  url: string;
}

export interface Message {
  id: string;
  clientId?: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  sources?: Source[];
  queryType?: QueryType;
  disclaimer?: string;
  suggestedNextSteps?: string[]; // AI-generated follow-up questions
  lastVerified?: string; // ISO timestamp of when source docs were last verified/crawled
}

export interface ConversationMessageForAPI {
  message: string;
  role: 'user' | 'assistant';
}

/**
 * Parsed response from the RAG API
 */
export interface ParsedRAGResponse {
  answer: string;
  sources: Source[];
  queryType?: QueryType;
  disclaimer?: string;
  suggestedNextSteps?: string[];
  lastVerified?: string;
  tokenUsage?: TokenUsage;
  estimatedCostUsd?: number;
}

// NOTE: This sanitizer logic is intentionally mirrored in the rag-query edge
// function (source of truth: UnifyCN/web-app, supabase/functions/rag-query/index.ts).
// Keep both copies in sync until we extract a shared cross-runtime module.
// TODO(unify-companion): move smartchip sanitization to a single shared source of truth.
const INVALID_ASSISTANT_LED_PATTERNS: RegExp[] = [
  /^would you like\b/i,
  /^do you want\b/i,
  /^can i\b/i,
  /^what kind of information are you looking for\b/i,
  /^what are you looking for\b/i,
  /^how can i help\b/i,
  /^what would you like\b/i,
  /\blet me know\b/i,
  /\bi can help\b/i,
  /\bwould you like me to\b/i,
];

const USER_QUESTION_STARTS = [
  'what',
  'how',
  'can',
  'should',
  'when',
  'where',
  'why',
  'which',
  'is',
  'are',
  'do',
  'does',
  'could',
  'would',
  'who',
];

/**
 * Keep only user-askable follow-up chips and normalize formatting.
 */
export const sanitizeSuggestedNextSteps = (
  suggestions?: string[]
): string[] | undefined => {
  if (!suggestions || suggestions.length === 0) {
    return undefined;
  }

  const deduped = new Set<string>();
  const cleaned = suggestions
    .map(s => s.replace(/^[\s"'`-]+|[\s"'`]+$/g, '').trim())
    .filter(s => s.length >= 10)
    .filter(
      s => !INVALID_ASSISTANT_LED_PATTERNS.some(pattern => pattern.test(s))
    )
    .map(s => {
      const lower = s.toLowerCase();
      const startsLikeQuestion = USER_QUESTION_STARTS.some(word =>
        lower.startsWith(`${word} `)
      );

      if (startsLikeQuestion && !s.endsWith('?')) {
        return `${s}?`;
      }
      return s;
    })
    .filter(s => s.endsWith('?'))
    .filter(s => {
      const key = s.toLowerCase();
      if (deduped.has(key)) return false;
      deduped.add(key);
      return true;
    })
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : undefined;
};

/**
 * Converts database messages to UI Message format
 */
export const formatMessagesForUI = (
  dbMessages: ConversationMessage[] | undefined
): Message[] => {
  if (!dbMessages) return [];

  return dbMessages.map(msg => ({
    id: msg.id.toString(),
    clientId: msg.clientId,
    text: msg.content,
    isUser: msg.role === 'user',
    timestamp: new Date(msg.created_at),
    sources: msg.sources || undefined,
    // Note: queryType, disclaimer, and suggestedNextSteps are not persisted to DB
    // They are only available in real-time responses, not when loading from DB
  }));
};

/**
 * Formats messages for RAG API context (last 10 messages)
 */
export const formatMessagesForAPI = (
  messages: Message[],
  currentUserMessage: string
): ConversationMessageForAPI[] => {
  return [
    ...messages
      .slice(-9) // Get last 9 messages (we'll add current one)
      .map(msg => ({
        message: msg.text,
        role: msg.isUser ? ('user' as const) : ('assistant' as const),
      })),
    {
      message: currentUserMessage,
      role: 'user' as const,
    },
  ].slice(-10); // Ensure we only send last 10 total
};

/**
 * Parses the response from the RAG API to extract answer, sources, queryType, disclaimer, and suggestedNextSteps
 */
export const parseRAGResponse = (response: any): ParsedRAGResponse => {
  let botResponse = 'Sorry, I encountered an error. Please try again.';
  let sources: Source[] = [];
  let queryType: QueryType | undefined;
  let disclaimer: string | undefined;
  let suggestedNextSteps: string[] | undefined;
  let lastVerified: string | undefined;
  let tokenUsage: TokenUsage | undefined;
  let estimatedCostUsd: number | undefined;

  // Handle new RAG response format with queryType, disclaimer, and suggestedNextSteps
  if (response && response.answer) {
    botResponse = response.answer.trim();
    sources = response.sources || [];
    queryType = response.queryType;
    disclaimer = response.disclaimer;
    suggestedNextSteps = response.suggestedNextSteps;
    lastVerified = response.lastVerified;
    tokenUsage = response.tokenUsage;
    estimatedCostUsd = response.estimatedCostUsd;
  }
  // Fallback: Handle old Gemini response format (for backward compatibility)
  else if (response && response.candidates && response.candidates[0]) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts[0]
    ) {
      botResponse = candidate.content.parts[0].text.trim();
    }
  }

  return {
    answer: botResponse,
    sources,
    queryType,
    disclaimer,
    suggestedNextSteps: sanitizeSuggestedNextSteps(suggestedNextSteps),
    lastVerified,
    tokenUsage,
    estimatedCostUsd,
  };
};
