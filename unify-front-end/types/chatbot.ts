export interface ChatbotUsage {
  daily_limit: number;
  remaining: number | null;
  is_premium: boolean;
  resets_at: string;
  observed_at: string;
  message_count: number;
  last_message_at: string | null;
  total_tokens_used?: number;
  total_estimated_cost_usd?: number;
}

// Query classification types from the RAG chatbot
export type QueryType =
  | 'immigration'
  | 'newcomer_settlement'
  | 'general'
  | 'fact_check'
  | 'form_help';

// Token usage from the AI model
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// RAG API response structure
export interface RAGResponse {
  answer: string;
  sources?: Source[];
  queryType: QueryType;
  disclaimer?: string;
  suggestedNextSteps?: string[];
  tokenUsage?: TokenUsage;
  estimatedCostUsd?: number;
}

// Source document reference
export interface Source {
  document_id: number;
  document_title: string;
  url: string;
}
