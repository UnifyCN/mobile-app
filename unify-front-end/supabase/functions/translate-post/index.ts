// @ts-nocheck We do not need the actual Deno import since it's used by supabase serverless functions so ignore
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { captureAiGeneration } from '../_shared/posthogCapture.ts';
import { aiPlatformProperties } from '../_shared/aiPlatform.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese',
  es: 'Spanish',
  hi: 'Hindi',
};

const MAX_CONTENT_LENGTH = 5000;

const SYSTEM_PROMPT = `You are a translation engine. Translate the user-provided text into the requested target language. Rules:
1. Preserve the original meaning, tone, and intent as closely as possible.
2. If the text contains HTML tags, preserve all HTML tags exactly — only translate the text content between tags.
3. Do not add, remove, or modify any HTML markup.
4. Do not add explanations, notes, or commentary — respond ONLY with the translated text.
5. If the text is already in the target language, return it unchanged.
6. Preserve any @mentions, URLs, numbers, and proper nouns as-is.`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  if (!Deno.env.get('OPENROUTER_API_KEY')) {
    return jsonResponse({ error: 'Missing OPENROUTER_API_KEY' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: authData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !authData?.user) {
      return jsonResponse({ error: 'Invalid user' }, 401);
    }

    const body = await req.json();
    const { text, targetLanguage } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return jsonResponse({ error: 'Missing or empty text' }, 400);
    }

    if (text.length > MAX_CONTENT_LENGTH) {
      return jsonResponse(
        { error: `Text too long (max ${MAX_CONTENT_LENGTH} chars)` },
        400
      );
    }

    if (
      !targetLanguage ||
      typeof targetLanguage !== 'string' ||
      !LANGUAGE_NAMES[targetLanguage]
    ) {
      return jsonResponse(
        { error: 'Invalid targetLanguage. Supported: en, vi, es, hi' },
        400
      );
    }

    const targetName = LANGUAGE_NAMES[targetLanguage];

    const llmResult = await callOpenRouter({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Translate the following text into ${targetName}:\n\n${text.trim()}`,
        },
      ],
      maxTokens: 2048,
      temperature: 0.1,
      timeoutMs: 15000,
      retries: 1,
      retryDelayMs: 400,
      appName: 'Unify — translate-post',
    });

    if (!llmResult.ok) {
      console.error('translate-post OpenRouter call failed:', llmResult.message);
      let status = 502;
      if (llmResult.status === 504) status = 504;
      else if (llmResult.retryable) status = 503;
      return jsonResponse({ error: 'Translation service unavailable' }, status);
    }

    const translatedText = llmResult.content;
    if (!translatedText) {
      return jsonResponse({ error: 'No translation generated' }, 502);
    }

    captureAiGeneration(authData.user.id, {
      $ai_model: llmResult.model,
      $ai_provider: llmResult.provider,
      $ai_input_tokens: llmResult.usage.promptTokens,
      $ai_output_tokens: llmResult.usage.completionTokens,
      $ai_total_tokens: llmResult.usage.totalTokens,
      $ai_total_cost_usd: llmResult.usage.costUsd,
      feature: 'translate_post',
      ...aiPlatformProperties(body),
      target_language: targetLanguage,
      text_length: text.length,
    });

    return jsonResponse({ translatedText });
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    console.error('translate-post error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
