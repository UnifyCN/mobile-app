// @ts-nocheck Deno runtime — Supabase Edge Functions
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { captureAiGeneration } from '../_shared/posthogCapture.ts';
import { responseLanguageDirective } from '../_shared/responseLanguage.ts';

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

const SYSTEM_PROMPT = `You are a supportive learning coach for newcomers to Canada. You are reviewing a student's practice answer and providing helpful, personalized feedback.

Your feedback should:
1. Acknowledge what the student got right or showed understanding of
2. Gently point out any gaps or misconceptions
3. Provide the key points they may have missed, with a brief explanation
4. Be encouraging and constructive — never dismissive
5. Keep it concise: 3-5 sentences maximum

Context: The student is learning about immigration, finances, taxes, housing, healthcare, and life in Canada through an educational app.

Respond ONLY with the feedback text. Use plain language. Do not use markdown formatting, headers, or bullet points — write in flowing sentences.`;

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
    const { questionText, userAnswer, expectedAnswer, practiceTitle, language } =
      body;

    if (
      !questionText ||
      typeof questionText !== 'string' ||
      questionText.trim().length === 0
    ) {
      return jsonResponse({ error: 'Missing or empty questionText' }, 400);
    }

    if (
      !userAnswer ||
      typeof userAnswer !== 'string' ||
      userAnswer.trim().length === 0
    ) {
      return jsonResponse({ error: 'Missing or empty userAnswer' }, 400);
    }

    if (questionText.length > 2000) {
      return jsonResponse(
        { error: 'questionText too long (max 2000 chars)' },
        400
      );
    }

    if (userAnswer.length > 3000) {
      return jsonResponse(
        { error: 'userAnswer too long (max 3000 chars)' },
        400
      );
    }

    let userPrompt = `Practice exercise: "${practiceTitle || 'Practice Activity'}"

Question: ${questionText.trim()}

Student's answer: "${userAnswer.trim()}"`;

    if (expectedAnswer && typeof expectedAnswer === 'string') {
      const bounded =
        expectedAnswer.length > 2000
          ? expectedAnswer.slice(0, 2000)
          : expectedAnswer;
      userPrompt += `\n\nReference answer (key points the student should cover): ${bounded.trim()}`;
    }

    userPrompt +=
      '\n\nProvide brief, personalized feedback on the student\'s answer.';

    // Answer in the caller's UI language when they asked for one. The
    // directive is built from a whitelist, so `language` is never
    // interpolated into the prompt and English stays byte-for-byte unchanged.
    const systemPrompt = SYSTEM_PROMPT + responseLanguageDirective(language);

    const llmResult = await callOpenRouter({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 300,
      temperature: 0.4,
      timeoutMs: 20000,
      retries: 1,
      retryDelayMs: 400,
      appName: 'Unify — practice-feedback',
    });

    if (!llmResult.ok) {
      console.error(
        'practice-feedback OpenRouter call failed:',
        llmResult.message
      );
      let status = 502;
      if (llmResult.status === 504) status = 504;
      else if (llmResult.retryable) status = 503;
      return jsonResponse({ error: 'AI service unavailable' }, status);
    }

    const feedback = llmResult.content;
    if (!feedback) {
      return jsonResponse({ error: 'No feedback generated' }, 502);
    }

    captureAiGeneration(authData.user.id, {
      $ai_model: llmResult.model,
      $ai_provider: llmResult.provider,
      $ai_input_tokens: llmResult.usage.promptTokens,
      $ai_output_tokens: llmResult.usage.completionTokens,
      $ai_total_tokens: llmResult.usage.totalTokens,
      $ai_total_cost_usd: llmResult.usage.costUsd,
      feature: 'practice_feedback',
      question_length: questionText.length,
      answer_length: userAnswer.length,
    });

    return jsonResponse({ feedback });
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    console.error('practice-feedback error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
