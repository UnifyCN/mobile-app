// @ts-ignore JSR import
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildPool,
  type OnboardingProfile,
} from '../_shared/companionTemplates.ts';
import {
  rankLearnModules,
  type LearnModuleRow,
  type LearnProgressRow,
  type ScoredModule,
} from '../_shared/learnRanking.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ─── Learn surface ────────────────────────────────────────────────────────────

async function buildLearnSurface(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  userId: string,
  profile: OnboardingProfile
): Promise<{ modules: ScoredModule[] }> {
  // Parallel fetch: module metadata + user progress
  const [modulesResult, progressResult] = await Promise.all([
    supabase
      .from('learn_modules')
      .select('sanity_id, title, personas, interests, province'),
    supabase
      .from('learn_progress')
      .select('module_id, status, completed_at')
      .eq('user_id', userId),
  ]);

  if (modulesResult.error) {
    console.error('personalize/learn: modules fetch error', modulesResult.error);
    return { modules: [] };
  }

  // Province filtering and scoring live in rankLearnModules, which drops
  // modules for other provinces before scoring.
  const modules = rankLearnModules(
    (modulesResult.data as LearnModuleRow[]) ?? [],
    (progressResult.data as LearnProgressRow[]) ?? [],
    profile
  );

  return { modules };
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
        'persona, city, province, arrival_date, stage, goals, learning_interests, hobbies'
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

    const profile: OnboardingProfile = {
      persona: profileData.persona ?? null,
      city: profileData.city ?? null,
      province: profileData.province ?? null,
      arrival_date: profileData.arrival_date ?? null,
      stage: profileData.stage ?? null,
      goals: profileData.goals ?? [],
      learning_interests: profileData.learning_interests ?? [],
      hobbies: profileData.hobbies ?? [],
    };

    const responseBody: Record<string, unknown> = {};

    if (wantsCompanion) {
      responseBody.companion = {
        context: {
          persona: profile.persona,
          city: profile.city,
          province: profile.province,
          arrival_date: profile.arrival_date,
          stage: profile.stage,
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
