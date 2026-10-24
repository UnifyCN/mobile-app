// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/fetchWithRetry.ts';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { captureAiGeneration } from '../_shared/posthogCapture.ts';
import { getStageDescription } from '../_shared/arrivalStage.ts';

// ============================================================================
// CONSTANTS
// ============================================================================

const PERSONAS = [
  'international_student',
  'skilled_worker',
  'refugee',
  'other',
] as const;
const STAGES = ['0', '1', '2', '3', '4'] as const;
const BATCH_SIZE = 5;

const EMBEDDING_MODEL =
  Deno.env.get('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small';

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  international_student: 'international student studying in Canada',
  skilled_worker: 'skilled worker who immigrated to Canada',
  refugee: 'refugee or protected person in Canada',
  other: 'newcomer to Canada',
};

// ============================================================================
// TIP GENERATION
// ============================================================================

interface GeneratedTip {
  category: string;
  title: string;
  description: string;
  tip_text: string;
}

const VALID_CATEGORIES = [
  'documents',
  'finance',
  'housing',
  'employment',
  'healthcare',
  'immigration',
  'settlement',
  'general',
];

function buildTopicQuery(persona: string, stage: string): string {
  const personaDesc = PERSONA_DESCRIPTIONS[persona] || 'newcomer to Canada';
  const stageDesc = getStageDescription(stage);
  return stageDesc
    ? `practical tips for ${personaDesc} (stage: ${stageDesc})`
    : `practical tips for ${personaDesc}`;
}

function buildGeminiPrompt(
  persona: string,
  stage: string,
  date: string,
  kbContext: string
): string {
  const personaDesc = PERSONA_DESCRIPTIONS[persona] || 'newcomer to Canada';
  const stageDesc = getStageDescription(stage);
  const stageLine = stageDesc
    ? `- Stage (time since arrival): ${stageDesc}\n`
    : '';

  return `You are generating a daily tip for newcomers to Canada.

USER PROFILE:
- Persona: ${personaDesc}
${stageLine}- Time context: ${date}

KNOWLEDGE BASE CONTEXT:
${kbContext || 'No specific knowledge base context available. Use your general knowledge about Canadian newcomer resources.'}

Generate a single, specific, actionable tip. Respond ONLY with valid JSON (no markdown, no code fences):
{
  "category": "documents|finance|housing|employment|healthcare|immigration|settlement|general",
  "title": "short title (max 60 chars)",
  "description": "one-line summary (max 80 chars)",
  "tip_text": "the full tip, specific and actionable (max 200 chars)"
}

RULES:
- Be specific to this persona and stage
- Reference real Canadian programs, services, or resources when possible
- No legal advice — use "generally" or "typically"
- No eligibility determinations
- Keep it actionable — tell them what to DO, not just what to know
- Vary the category day-to-day — do not always pick the same topic`;
}

function parseGeminiTipResponse(rawText: string): GeneratedTip | null {
  try {
    // Strip markdown code fences if present
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (
      !parsed.category ||
      !parsed.title ||
      !parsed.description ||
      !parsed.tip_text
    ) {
      console.error('Missing required fields in tip response');
      return null;
    }

    // Validate category
    const category = VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : 'general';

    return {
      category,
      title: String(parsed.title).slice(0, 60),
      description: String(parsed.description).slice(0, 80),
      tip_text: String(parsed.tip_text).slice(0, 200),
    };
  } catch (error) {
    console.error(
      'Failed to parse tip JSON:',
      error,
      'Raw:',
      rawText.slice(0, 300)
    );
    return null;
  }
}

async function generateEmbedding(
  text: string,
  openaiApiKey: string
): Promise<number[] | null> {
  try {
    const response = await fetchWithRetry(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
        }),
      },
      { timeoutMs: 15000, retries: 2, retryDelayMs: 400 }
    );

    if (!response.ok) {
      console.error('OpenAI embedding error:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return null;
  }
}

interface SourceRef {
  document_title: string;
  url: string;
}

interface KBSearchResult {
  context: string;
  sourceRefs: SourceRef[] | null;
}

async function searchKnowledgeBase(
  supabase: ReturnType<typeof createClient>,
  embedding: number[]
): Promise<KBSearchResult> {
  try {
    const { data: chunks, error } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 5,
    });

    if (error || !chunks || chunks.length === 0) {
      return { context: '', sourceRefs: null };
    }

    const context = chunks
      .map((chunk: any) => chunk.chunk_text)
      .join('\n\n')
      .slice(0, 3000); // Cap context size

    // Extract unique source references from chunk metadata
    const seenUrls = new Set<string>();
    const sourceRefs: SourceRef[] = [];
    for (const chunk of chunks) {
      const doc = chunk.knowledge_documents || {};
      const title = doc.title;
      const url = doc.source_url;
      if (title && url && !seenUrls.has(url)) {
        seenUrls.add(url);
        sourceRefs.push({ document_title: title, url });
      }
    }

    return {
      context,
      sourceRefs: sourceRefs.length > 0 ? sourceRefs : null,
    };
  } catch (error) {
    console.error('KB search failed:', error);
    return { context: '', sourceRefs: null };
  }
}

interface LlmCallResult {
  text: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
}

async function callTipModel(prompt: string): Promise<LlmCallResult | null> {
  const result = await callOpenRouter({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 300,
    temperature: 0.8,
    jsonMode: true,
    timeoutMs: 20000,
    retries: 2,
    retryDelayMs: 500,
    appName: 'Unify — generate-daily-tips',
  });

  if (!result.ok) {
    console.error('OpenRouter call failed:', result.message);
    return null;
  }

  return {
    text: result.content,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
  };
}

async function generateTipForCohort(
  supabase: ReturnType<typeof createClient>,
  persona: string,
  stage: string,
  date: string,
  openaiApiKey: string | null
): Promise<{ success: boolean; persona: string; stage: string }> {
  const cohortKey = `${persona}/${stage}`;

  // Step 1: Build topic query and get KB context
  let kbContext = '';
  let sourceRefs: SourceRef[] | null = null;
  if (openaiApiKey) {
    const topicQuery = buildTopicQuery(persona, stage);
    const embedding = await generateEmbedding(topicQuery, openaiApiKey);
    if (embedding) {
      const kbResult = await searchKnowledgeBase(supabase, embedding);
      kbContext = kbResult.context;
      sourceRefs = kbResult.sourceRefs;
    }
  }

  // Step 2: Generate tip via OpenRouter
  const prompt = buildGeminiPrompt(persona, stage, date, kbContext);
  const llmResult = await callTipModel(prompt);

  if (!llmResult) {
    console.error(`[${cohortKey}] LLM call failed`);
    return { success: false, persona, stage };
  }

  // Step 3: Parse response — track which call's text actually produced
  // the tip so analytics reflect the correct model/usage.
  let tip = parseGeminiTipResponse(llmResult.text);
  let effectiveResult: LlmCallResult = llmResult;

  // Retry once on parse failure
  if (!tip) {
    console.warn(`[${cohortKey}] Parse failed, retrying once`);
    const retryResult = await callTipModel(prompt);
    if (retryResult) {
      const retryTip = parseGeminiTipResponse(retryResult.text);
      if (retryTip) {
        tip = retryTip;
        effectiveResult = retryResult;
      }
    }
  }

  if (!tip) {
    console.error(`[${cohortKey}] Failed to generate valid tip after retry`);
    return { success: false, persona, stage };
  }

  // Step 4: Upsert into daily_tips
  const { error: upsertError } = await supabase.from('daily_tips').upsert(
    {
      persona,
      stage,
      date,
      category: tip.category,
      title: tip.title,
      description: tip.description,
      tip_text: tip.tip_text,
      source_refs: sourceRefs,
    },
    { onConflict: 'persona,stage,date' }
  );

  if (upsertError) {
    console.error(`[${cohortKey}] DB upsert error:`, upsertError);
    return { success: false, persona, stage };
  }

  // Step 5: PostHog tracking — attribute to the call that produced the tip
  captureAiGeneration(`system:daily-tips:${cohortKey}`, {
    $ai_model: effectiveResult.model,
    $ai_provider: effectiveResult.provider,
    $ai_input_tokens: effectiveResult.usage.promptTokens,
    $ai_output_tokens: effectiveResult.usage.completionTokens,
    $ai_total_tokens: effectiveResult.usage.totalTokens,
    $ai_total_cost_usd: effectiveResult.usage.costUsd,
    feature: 'daily_tips',
    persona,
    stage,
    category: tip.category,
  });

  console.log(`[${cohortKey}] Generated tip: "${tip.title}" (${tip.category})`);
  return { success: true, persona, stage };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const startTime = performance.now();

  try {
    // Auth: verify service role key
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!Deno.env.get('OPENROUTER_API_KEY')) {
      return new Response(
        JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || null;
    if (!openaiApiKey) {
      console.warn(
        'OPENAI_API_KEY not set — generating tips without RAG grounding'
      );
    }

    const today = new Date().toISOString().split('T')[0]; // UTC date

    // Build cohort matrix
    const cohorts: Array<{ persona: string; stage: string }> = [];
    for (const persona of PERSONAS) {
      for (const stage of STAGES) {
        cohorts.push({ persona, stage });
      }
    }

    console.log(`Generating ${cohorts.length} tips for date ${today}`);

    // Process in batches of BATCH_SIZE
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < cohorts.length; i += BATCH_SIZE) {
      const batch = cohorts.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(({ persona, stage }) =>
          generateTipForCohort(supabase, persona, stage, today, openaiApiKey)
        )
      );

      for (const result of results) {
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    }

    const totalTime = Math.round(performance.now() - startTime);
    const summary = {
      date: today,
      total: cohorts.length,
      success: successCount,
      failed: failureCount,
      duration_ms: totalTime,
    };

    console.log('Generation complete:', summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fatal error in generate-daily-tips:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
