// @ts-nocheck Deno runtime — Supabase Edge Functions
/**
 * generate-title — short title for a new AI Companion conversation.
 *
 * Replaces the legacy direct-Gemini function (GEMINI_MODEL / GEMINI_API_KEY,
 * pinned to the deprecated gemini-2.0-flash) with the shared OpenRouter helper
 * so title generation follows the same model chain, reasoning setting, and
 * PostHog cost tracking as every other AI feature.
 *
 * Contract is unchanged for the mobile caller
 * (services/companion/createConversation.ts): POST { message } → { title }.
 * Any failure returns a non-2xx so the client falls back to a truncated title.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { captureAiGeneration } from '../_shared/posthogCapture.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const MAX_MESSAGE_LENGTH = 2000;
const MAX_TITLE_LENGTH = 80;

const SYSTEM_PROMPT = `You write short conversation titles. Given the first user message of a chat, reply with a concise title of at most 6 words that captures the topic. Use the same language as the message. Return ONLY the title — no quotes, no punctuation at the end, no explanation.`;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

/** Strip wrapping quotes / trailing punctuation the model sometimes adds. */
function cleanTitle(raw: string): string {
  return raw
    .split('\n')[0]
    .trim()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/[.。!！?？:：]+$/g, '')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }
  if (!Deno.env.get('OPENROUTER_API_KEY')) {
    return jsonResponse({ error: 'Missing OPENROUTER_API_KEY' }, 500);
  }

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !authData?.user) {
      return jsonResponse({ error: 'Invalid user' }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    const message = body?.message;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return jsonResponse({ error: 'Message is required' }, 400);
    }

    const llmResult = await callOpenRouter({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message.trim().slice(0, MAX_MESSAGE_LENGTH) },
      ],
      maxTokens: 24,
      temperature: 0.7,
      timeoutMs: 10000,
      retries: 1,
      retryDelayMs: 300,
      appName: 'Unify — generate-title',
    });

    if (!llmResult.ok) {
      console.error('generate-title OpenRouter call failed:', llmResult.message);
      let status = 502;
      if (llmResult.status === 504) status = 504;
      else if (llmResult.retryable) status = 503;
      return jsonResponse({ error: 'AI service unavailable' }, status);
    }

    const title = cleanTitle(llmResult.content);
    if (!title) {
      return jsonResponse({ error: 'No title generated' }, 502);
    }

    captureAiGeneration(authData.user.id, {
      $ai_model: llmResult.model,
      $ai_provider: llmResult.provider,
      $ai_input_tokens: llmResult.usage.promptTokens,
      $ai_output_tokens: llmResult.usage.completionTokens,
      $ai_total_tokens: llmResult.usage.totalTokens,
      $ai_total_cost_usd: llmResult.usage.costUsd,
      feature: 'generate_title',
      message_length: message.length,
    });

    return jsonResponse({ title });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    console.error('generate-title error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
