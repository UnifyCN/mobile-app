import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { getArrivalStage } from '../_shared/arrivalStage.ts';
import { buildArrivalLine, buildStageLine } from '../_shared/stageContext.ts';
import {
  LOCAL_DATE_HEADER,
  readRequestToday,
} from '../_shared/requestToday.ts';

// ============================================================================
// CONFIG
// ============================================================================

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  international_student: 'international student studying in Canada',
  skilled_worker: 'skilled worker who immigrated to Canada',
  refugee: 'refugee or protected person in Canada',
  other: 'newcomer to Canada',
};

const GOAL_LABELS: Record<string, string> = {
  learn_something: 'learning about life in Canada',
  build_community: 'building community and connections',
  quick_answers: 'getting quick answers to questions',
  something_else: 'general newcomer support',
};

const INTEREST_LABELS: Record<string, string> = {
  documents: 'documents & paperwork',
  employment: 'employment & job search',
  finance: 'finance & banking',
  housing: 'housing & renting',
  pr_immigration: 'PR & immigration pathways',
  healthcare: 'healthcare & insurance',
  family_kids: 'family & kids',
  transit: 'transit & transportation',
  other: 'other topics',
};

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${LOCAL_DATE_HEADER}`,
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ============================================================================
// GEMINI TIP GENERATION
// ============================================================================

interface GeneratedTip {
  category: string;
  title: string;
  description: string;
  tip_text: string;
}

interface UserProfile {
  persona: string;
  stage: number | null; // Computed from arrival_date. Null is unknown.
  city: string | null;
  province: string | null;
  goals: string[];
  learning_interests: string[];
  arrival_date: string | null;
}

function buildGeminiPrompt(
  profile: UserProfile,
  date: string,
  localToday: Date
): string {
  const personaDesc =
    PERSONA_DESCRIPTIONS[profile.persona] || 'newcomer to Canada';

  // Build location string
  let locationLine = '';
  if (profile.city && profile.province) {
    locationLine = `- Location: ${profile.city}, ${profile.province}`;
  } else if (profile.province) {
    locationLine = `- Location: ${profile.province}`;
  }

  // Build goals string
  const goalLabels = (profile.goals || [])
    .map(g => GOAL_LABELS[g] || g)
    .filter(Boolean);
  const goalsLine =
    goalLabels.length > 0 ? `- Goals: ${goalLabels.join(', ')}` : '';

  // Build interests string
  const interestLabels = (profile.learning_interests || [])
    .map(i => INTEREST_LABELS[i] || i)
    .filter(Boolean);
  const interestsLine =
    interestLabels.length > 0
      ? `- Interested in: ${interestLabels.join(', ')}`
      : '';

  // Build arrival context from the date, not from the stored stage
  const arrivalLine = buildArrivalLine(profile.arrival_date, localToday);

  const profileLines = [
    `- Persona: ${personaDesc}`,
    buildStageLine(profile.stage),
    locationLine,
    arrivalLine,
    goalsLine,
    interestsLine,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are generating a daily tip for newcomers to Canada.

USER PROFILE:
${profileLines}
- Time context: ${date}

Generate a single, specific, actionable tip that is highly relevant to this user's situation, location, and interests. Respond ONLY with valid JSON (no markdown, no code fences):
{
  "category": "documents|finance|housing|employment|healthcare|immigration|settlement|general",
  "title": "short title (max 60 chars)",
  "description": "one-line summary (max 80 chars)",
  "tip_text": "the full tip, specific and actionable (max 200 chars)"
}

RULES:
- Be specific to this user's persona, stage, location, and interests
- If the user is in a specific city/province, reference local resources, programs, or services available there
- Prioritize topics the user has expressed interest in
- Reference real Canadian programs, services, or resources when possible
- No legal advice — use "generally" or "typically"
- No eligibility determinations
- Keep it actionable — tell them what to DO, not just what to know
- Vary the category day-to-day — do not always pick the same topic`;
}

function parseGeminiTipResponse(rawText: string): GeneratedTip | null {
  try {
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

async function callTipModel(prompt: string): Promise<string | null> {
  const result = await callOpenRouter({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 300,
    temperature: 0.8,
    jsonMode: true,
    timeoutMs: 20000,
    retries: 1,
    retryDelayMs: 500,
    appName: 'Unify — get-daily-tip',
  });

  if (!result.ok) {
    console.error('OpenRouter call failed:', result.message);
    return null;
  }

  return result.content;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  if (!Deno.env.get('OPENROUTER_API_KEY')) {
    return jsonResponse({ error: 'Missing OPENROUTER_API_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // The stage rule uses the caller's local day. Older clients send none.
    const requestToday = readRequestToday(req);
    if (!requestToday.ok) {
      return jsonResponse({ error: requestToday.message }, 400);
    }
    const localToday = requestToday.today;

    // 1. Validate auth
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse({ error: 'Invalid user' }, 401);
    }

    // 2. Get user's onboarding profile
    const { data: profile, error: profileError } = await supabase
      .from('user_onboarding_profiles')
      .select(
        'persona, city, province, goals, learning_interests, arrival_date'
      )
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return jsonResponse({ error: 'Failed to fetch profile' }, 500);
    }

    const persona: string = profile?.persona || 'other';
    // The stored stage is only a cache. Recompute it from arrival_date.
    const computedStage = getArrivalStage(profile?.arrival_date, localToday);
    // daily_tips.stage is NOT NULL text, so unknown is stored as 'unknown'.
    const stage: string = computedStage === null ? 'unknown' : String(computedStage);
    const today = new Date().toISOString().split('T')[0];

    const userId = authData.user.id;

    // 3. Check if today's tip already exists for this user.
    // Race protection: two concurrent requests (e.g. pull-to-refresh + tab
    // focus) would otherwise BOTH call Gemini and burn tokens. We solve this
    // by inserting a `__pending__` placeholder before calling Gemini; the
    // unique index on (user_id, date) makes that an atomic claim.
    const PENDING = '__pending__';
    // Gemini calls can take 20-30s in the worst case. The poll budget needs to
    // outlive that, and the staleness threshold needs to be longer than the
    // poll budget so we don't delete in-flight claims.
    const POLL_INTERVAL_MS = 1000;
    const POLL_ATTEMPTS = 45; // ~45s ceiling
    const STALE_PENDING_MS = 180_000; // 3 min — definitely abandoned by then

    const respondWithTip = (row: {
      id: string;
      persona: string;
      stage: string;
      date: string;
      category: string;
      title: string;
      description: string;
      tip_text: string;
      source_refs: unknown;
    }) =>
      jsonResponse({
        tip: {
          id: row.id,
          persona: row.persona,
          stage: row.stage,
          date: row.date,
          category: row.category,
          title: row.title,
          description: row.description,
          tip_text: row.tip_text,
          source_refs: row.source_refs,
        },
      });

    const pollForCompletion = async () => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const { data: row } = await supabase
          .from('daily_tips')
          .select('*')
          .eq('user_id', userId)
          .eq('date', today)
          .maybeSingle();
        if (row && row.title !== PENDING) {
          return respondWithTip(row);
        }
      }
      return new Response(
        JSON.stringify({ error: 'Tip generation in progress, retry shortly' }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Retry-After': '5' },
        }
      );
    };

    const { data: existingTip, error: fetchError } = await supabase
      .from('daily_tips')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (fetchError) {
      console.error('Tip fetch error:', fetchError);
      return jsonResponse({ error: 'Failed to fetch tip' }, 500);
    }

    if (existingTip && existingTip.title !== PENDING) {
      return respondWithTip(existingTip);
    }

    if (existingTip && existingTip.title === PENDING) {
      const ageMs =
        Date.now() - new Date(existingTip.created_at).getTime();
      if (ageMs > STALE_PENDING_MS) {
        // Crashed previous run left a stale placeholder — clear it and re-claim.
        await supabase.from('daily_tips').delete().eq('id', existingTip.id);
      } else {
        // Fresh placeholder from another in-flight request — poll for completion.
        return await pollForCompletion();
      }
    }

    // 4. Insert claim. ON CONFLICT (user_id, date) returns 23505.
    const { data: claim, error: claimError } = await supabase
      .from('daily_tips')
      .insert({
        user_id: userId,
        persona,
        stage,
        date: today,
        category: PENDING,
        title: PENDING,
        description: PENDING,
        tip_text: PENDING,
        source_refs: null,
      })
      .select('id')
      .maybeSingle();

    const claimErrorCode = (claimError as { code?: string } | null)?.code;
    const isUniqueConflict = claimErrorCode === '23505';

    if (claimError && !isUniqueConflict) {
      console.error('Daily tip claim failed:', claimError);
      return jsonResponse({ error: 'Failed to claim tip slot' }, 500);
    }

    if (isUniqueConflict || !claim) {
      // Lost the claim race to another concurrent request. Poll for its result.
      return await pollForCompletion();
    }

    // We won the claim — generate via Gemini.
    const userProfile: UserProfile = {
      persona,
      stage: computedStage,
      city: profile?.city || null,
      province: profile?.province || null,
      goals: profile?.goals || [],
      learning_interests: profile?.learning_interests || [],
      arrival_date: profile?.arrival_date || null,
    };
    const prompt = buildGeminiPrompt(userProfile, today, localToday);
    let rawText = await callTipModel(prompt);
    let tip = rawText ? parseGeminiTipResponse(rawText) : null;

    // Retry once on failure
    if (!tip) {
      console.warn(
        `[${persona}/${stage}] First attempt failed, retrying once`
      );
      rawText = await callTipModel(prompt);
      tip = rawText ? parseGeminiTipResponse(rawText) : null;
    }

    if (!tip) {
      // Roll back the claim so a future request can retry.
      await supabase.from('daily_tips').delete().eq('id', claim!.id);
      return jsonResponse({ error: 'Failed to generate tip' }, 502);
    }

    // 5. Replace placeholder with the real content.
    const { data: inserted, error: updateError } = await supabase
      .from('daily_tips')
      .update({
        category: tip.category,
        title: tip.title,
        description: tip.description,
        tip_text: tip.tip_text,
        source_refs: null,
      })
      .eq('id', claim!.id)
      .select()
      .single();

    if (updateError) {
      console.error('DB update error:', updateError);
      // Return the generated tip even if storage update failed.
      return jsonResponse({
        tip: {
          id: claim!.id,
          persona,
          stage,
          date: today,
          category: tip.category,
          title: tip.title,
          description: tip.description,
          tip_text: tip.tip_text,
          source_refs: null,
        },
      });
    }

    console.log(
      `[${persona}/${stage}] Generated tip on demand: "${tip.title}" (${tip.category})`
    );

    return jsonResponse({
      tip: {
        id: inserted.id,
        persona: inserted.persona,
        stage: inserted.stage,
        date: inserted.date,
        category: inserted.category,
        title: inserted.title,
        description: inserted.description,
        tip_text: inserted.tip_text,
        source_refs: inserted.source_refs,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    console.error('get-daily-tip error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
