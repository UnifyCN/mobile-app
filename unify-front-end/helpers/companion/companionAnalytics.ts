import type { QueryType, TokenUsage } from '@/types/chatbot';

/** How the user produced a Companion message. */
export type CompanionInputSource = 'typed' | 'starter_prompt' | 'suggestion';

/** Fixed topic list that rag-query labels each question with (spec #314). */
export const COMPANION_TOPICS = [
  'immigration',
  'work',
  'housing',
  'money',
  'taxes',
  'health',
  'education',
  'transportation',
  'settling_in',
  'other',
] as const;

export type CompanionTopic = (typeof COMPANION_TOPICS)[number];

export interface CompanionMessageSentProperties {
  message_length: number;
  conversation_id: string;
  turn_number: number;
  input_source: CompanionInputSource;
}

/**
 * Properties for `companion_message_sent`. `turn_number` is 1 for the first
 * user message in a conversation: earlier user messages + 1. Bot replies and
 * the local greeting bubble do not count. Never carries the message text.
 */
export function buildCompanionMessageSentProperties(input: {
  messageLength: number;
  conversationId: string;
  priorMessages: readonly { isUser: boolean }[];
  inputSource: CompanionInputSource;
}): CompanionMessageSentProperties {
  const priorUserTurns = input.priorMessages.filter(m => m.isUser).length;
  return {
    message_length: input.messageLength,
    conversation_id: input.conversationId,
    turn_number: priorUserTurns + 1,
    input_source: input.inputSource,
  };
}

/**
 * Text the app (not the user) put in the input box, and the source it came
 * from: a fact-check starter prefill, or a failed starter / suggestion send
 * restored for retry.
 */
export interface CompanionInputOrigin {
  text: string;
  source: CompanionInputSource;
}

/**
 * Source for a message sent from the input box. When the sent text still
 * starts with the text the app put there, that origin produced the message;
 * otherwise the user typed it.
 */
export function resolveTypedInputSource(
  text: string,
  origin: CompanionInputOrigin | null
): CompanionInputSource {
  const originText = origin?.text.trim();
  return origin && originText && text.startsWith(originText)
    ? origin.source
    : 'typed';
}

/** Accepts only a topic from the fixed list, so no free text reaches analytics. */
export function normalizeCompanionTopic(
  value: unknown
): CompanionTopic | undefined {
  return typeof value === 'string' &&
    (COMPANION_TOPICS as readonly string[]).includes(value)
    ? (value as CompanionTopic)
    : undefined;
}

export interface CompanionResponseProperties {
  query_type: string;
  topic?: CompanionTopic;
  has_sources: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  response_time_ms?: number;
}

/**
 * Properties for `companion_response_received`. `topic` is present only when
 * the response carries a known topic; older rag-query builds send none.
 */
export function buildCompanionResponseProperties(input: {
  queryType?: QueryType;
  topic?: unknown;
  hasSources: boolean;
  tokenUsage?: TokenUsage;
  estimatedCostUsd?: number;
  responseTimeMs?: number;
}): CompanionResponseProperties {
  const topic = normalizeCompanionTopic(input.topic);
  return {
    query_type: input.queryType || 'unknown',
    ...(topic ? { topic } : {}),
    has_sources: input.hasSources,
    prompt_tokens: input.tokenUsage?.prompt_tokens,
    completion_tokens: input.tokenUsage?.completion_tokens,
    total_tokens: input.tokenUsage?.total_tokens,
    estimated_cost_usd: input.estimatedCostUsd,
    response_time_ms: input.responseTimeMs,
  };
}
