// @ts-ignore JSR import
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildPool,
  type OnboardingProfile,
} from '../_shared/companionTemplates.ts';
import { buildCompanionProfile } from '../_shared/stageContext.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ─── Learn surface ────────────────────────────────────────────────────────────

interface LearnModule {
  sanity_id: string;
  title: string;
  personas: string[];
  interests: string[];
}

interface LearnProgressRow {
  module_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at: string | null;
}

interface ScoredModule {
  sanity_id: string;
  title: string;
  score: number;
  progress: 'not_started' | 'in_progress' | 'completed';
  completed_at: string | null;
  why_tag: string;
}

const PERSONA_LABELS: Record<string, string> = {
  international_student: 'international students',
  skilled_worker: 'skilled workers & immigrants',
  refugee: 'refugees & protected persons',
};

const INTEREST_LABELS: Record<string, string> = {
  documents: 'documents & IDs',
  employment: 'jobs & career',
  finance: 'money & banking',
  housing: 'housing',
  pr_immigration: 'PR & immigration',
  healthcare: 'healthcare',
  family_kids: 'family & kids',
  transit: 'transit',
};

function scoreModule(
  module: LearnModule,
  profile: OnboardingProfile
): { score: number; why_tag: string } {
  const hasInterestMatch =
    module.interests.length > 0 &&
    profile.learning_interests.some(i => module.interests.includes(i));

  const hasPersonaMatch =
    module.personas.length > 0 &&
    !!profile.persona &&
    module.personas.includes(profile.persona);

  const score = (hasInterestMatch ? 0.7 : 0) + (hasPersonaMatch ? 0.3 : 0);

  // Build why_tag from matched signals
  let why_tag = '';
  const matchedInterest = hasInterestMatch
    ? profile.learning_interests.find(i => module.interests.includes(i))
    : null;
  const interestLabel = matchedInterest
    ? INTEREST_LABELS[matchedInterest] ?? matchedInterest.replace(/_/g, ' ')
    : '';
  const personaLabel = hasPersonaMatch && profile.persona
    ? PERSONA_LABELS[profile.persona] ?? profile.persona.replace(/_/g, ' ')
    : '';

  if (hasInterestMatch && hasPersonaMatch) {
    why_tag = `Recommended for ${personaLabel} interested in ${interestLabel}`;
  } else if (hasInterestMatch) {
    why_tag = `Based on your interest in ${interestLabel}`;
  } else if (hasPersonaMatch) {
    why_tag = `Recommended for ${personaLabel}`;
  }

  return { score, why_tag };
}

async function buildLearnSurface(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  profile: OnboardingProfile
): Promise<{ modules: ScoredModule[] }> {
  // Parallel fetch: module metadata + user progress
  const [modulesResult, progressResult] = await Promise.all([
    supabase
      .from('learn_modules')
      .select('sanity_id, title, personas, interests'),
    supabase
      .from('learn_progress')
      .select('module_id, status, completed_at')
      .eq('user_id', userId),
  ]);

  if (modulesResult.error) {
    console.error('personalize/learn: modules fetch error', modulesResult.error);
    return { modules: [] };
  }

  const progressByModule = new Map<string, LearnProgressRow>();
  for (const row of (progressResult.data as LearnProgressRow[]) ?? []) {
    progressByModule.set(row.module_id, row);
  }

  // Score each module
  const scored: ScoredModule[] = ((modulesResult.data as LearnModule[]) ?? []).map(m => {
    const { score, why_tag } = scoreModule(m, profile);
    const progress = progressByModule.get(m.sanity_id);
    return {
      sanity_id: m.sanity_id,
      title: m.title,
      score,
      progress: progress?.status ?? 'not_started',
      completed_at: progress?.completed_at ?? null,
      why_tag,
    };
  });

  // Sort: in_progress first → then by score desc → ties by title asc → completed last
  scored.sort((a, b) => {
    const aInProgress = a.progress === 'in_progress' ? 0 : 1;
    const bInProgress = b.progress === 'in_progress' ? 0 : 1;
    if (aInProgress !== bInProgress) return aInProgress - bInProgress;

    const aCompleted = a.progress === 'completed' ? 1 : 0;
    const bCompleted = b.progress === 'completed' ? 1 : 0;
    if (aCompleted !== bCompleted) return aCompleted - bCompleted;

    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return { modules: scored };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const surfaces = url.searchParams.get('surfaces') ?? '';
    const wantsCompanion = surfaces.includes('companion');
    const wantsLearn = surfaces.includes('learn');

    if (!wantsCompanion && !wantsLearn) {
      return new Response(JSON.stringify({ companion: null, learn: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profileData, error: profileError } = await supabaseClient
      .from('user_onboarding_profiles')
      .select(
        'persona, city, province, arrival_date, goals, learning_interests, hobbies'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      // No profile — return null surfaces so the app falls back gracefully
      return new Response(
        JSON.stringify({ companion: null, learn: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The stored stage is only a cache. Recompute it from arrival_date.
    const profile: OnboardingProfile = buildCompanionProfile(profileData);

    const responseBody: Record<string, unknown> = {};

    if (wantsCompanion) {
      responseBody.companion = {
        context: {
          persona: profile.persona,
          city: profile.city,
          province: profile.province,
          arrival_date: profile.arrival_date,
          stage: profile.stage === null ? null : String(profile.stage),
          goals: profile.goals,
          interests: profile.learning_interests,
          hobbies: profile.hobbies,
        },
        starters: buildPool(profile),
      };
    }

    if (wantsLearn) {
      responseBody.learn = await buildLearnSurface(
        supabaseClient,
        user.id,
        profile
      );
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('personalize edge function error:', error);
    return new Response(
      JSON.stringify({ companion: null, learn: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
