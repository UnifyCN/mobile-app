import { useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getAllModulesWithSubmodules } from '@/services/sanity/modules';
import { progressEventEmitter } from '@/utils/progressEventEmitter';
import type {
  ModuleProgressStatus,
  PersonalizeLearnResponse,
  PersonalizedModule,
} from '@/types/learn';
import type { SanityModuleWithSubmodules } from '@/types/sanity';
import { sanityQueryKeys } from '@/hooks/sanity/sanityQueryKeys';
import { useSanityLanguage } from '@/hooks/sanity/useSanityLanguage';
import { useLearnProvince } from '@/hooks/learn/useLearnProvince';
import { isVisibleForProvince } from '@/supabase/functions/_shared/province';

// ─── Personalize fetch ────────────────────────────────────────────────────────

async function fetchPersonalizedLearn(): Promise<PersonalizeLearnResponse | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/personalize?surfaces=learn`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;
    const json = await res.json();
    return (json?.learn as PersonalizeLearnResponse) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Independent progress fetch (used in fallback path) ─────────────────────

async function fetchAllModuleProgress(): Promise<
  Map<string, ModuleProgressStatus>
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return new Map();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { data, error } = await supabase
    .from('learn_progress')
    .select('module_id, status')
    .eq('user_id', user.id);

  if (error || !data) return new Map();

  const map = new Map<string, ModuleProgressStatus>();
  for (const row of data) {
    map.set(row.module_id, row.status as ModuleProgressStatus);
  }
  return map;
}

// ─── Merge helper ─────────────────────────────────────────────────────────────

/**
 * Merge personalized ranking with the Sanity modules this user may see.
 * Preserves the edge function's order (do NOT re-sort). A ranked module that
 * is not in `sanityModules` (filtered by province) is dropped. Eligible Sanity
 * modules with no learn_modules row are appended at the end with score 0 and
 * their saved progress.
 */
function mergePersonalizedWithSanity(
  personalized: PersonalizedModule[],
  sanityModules: SanityModuleWithSubmodules[],
  progressMap: Map<string, ModuleProgressStatus> | undefined
): PersonalizedSanityModule[] {
  const sanityById = new Map(sanityModules.map(m => [m._id, m]));
  const result: PersonalizedSanityModule[] = [];

  for (const pm of personalized) {
    const sanity = sanityById.get(pm.sanity_id);
    if (sanity) {
      result.push({
        ...sanity,
        progress: pm.progress,
        score: pm.score,
        why_tag: pm.why_tag,
      });
      sanityById.delete(pm.sanity_id);
    }
  }

  // Append unscored Sanity modules at the end
  for (const remaining of sanityById.values()) {
    result.push({
      ...remaining,
      progress: progressMap?.get(remaining._id) ?? 'not_started',
      score: 0,
      why_tag: '',
    });
  }

  return result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type PersonalizedSanityModule = SanityModuleWithSubmodules & {
  progress: PersonalizedModule['progress'];
  score: number;
  why_tag: string;
};

interface UsePersonalizedModulesResult {
  modules: PersonalizedSanityModule[] | undefined;
  isLoading: boolean;
  isPersonalized: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function usePersonalizedModules(): UsePersonalizedModulesResult {
  const language = useSanityLanguage();
  const { province, isLoading: provinceLoading } = useLearnProvince();
  // Always fetch Sanity modules (they own colorTheme, icon, submodules)
  const {
    data: allSanityModules,
    isLoading: sanityLoading,
    error: sanityError,
    refetch: refetchSanity,
  } = useQuery({
    queryKey: sanityQueryKeys.modules(language),
    queryFn: () => getAllModulesWithSubmodules(language),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Always fetch personalized ranking
  const {
    data: personalizedData,
    isLoading: personalizeLoading,
    isPlaceholderData: personalizeIsPlaceholder,
    refetch: refetchPersonalized,
  } = useQuery({
    queryKey: ['personalize', 'learn', province],
    queryFn: fetchPersonalizedLearn,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  // Independent progress fetch — keeps badges visible even when personalization
  // is disabled or the edge function fails/times out.
  const { data: progressMap, refetch: refetchProgress } = useQuery({
    queryKey: ['learn', 'progress'],
    queryFn: fetchAllModuleProgress,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const isLoading = sanityLoading || personalizeLoading || provinceLoading;

  // Sanity owns the province tag, so it decides what this user may see on every
  // path: the merged ranking, the fallback and the loading state.
  const sanityModules = useMemo(
    () =>
      allSanityModules?.filter(m => isVisibleForProvince(m.province, province)),
    [allSanityModules, province]
  );

  // An empty ranking is a valid answer (the edge function filters by province
  // too): it means this user has no module, even when eligible Sanity modules
  // have not synced to learn_modules yet. Only a missing response means
  // personalization is unavailable. A ranking kept from the previous province
  // while the new one loads does not answer for this province.
  const isPersonalized =
    Array.isArray(personalizedData?.modules) && !!sanityModules;

  let modules: PersonalizedSanityModule[] | undefined;

  if (sanityModules) {
    if (isPersonalized && personalizedData) {
      modules =
        personalizedData.modules.length === 0 && !personalizeIsPlaceholder
          ? []
          : mergePersonalizedWithSanity(
              personalizedData.modules,
              sanityModules,
              progressMap
            );
    } else {
      // Fallback: Sanity order, unscored — but still show real progress badges
      modules = sanityModules.map(m => ({
        ...m,
        progress: progressMap?.get(m._id) ?? ('not_started' as const),
        score: 0,
        why_tag: '',
      }));
    }
  }

  const refetch = () =>
    Promise.all([refetchSanity(), refetchPersonalized(), refetchProgress()]);

  // U6: When a lesson completes (or the module auto-flips to 'completed'), the
  // lesson-save path emits a progress event. Refetch so the Learn home carousel
  // and module list reflect the new state without pull-to-refresh. Only the
  // progress-backed queries need to rerun — Sanity content is immutable here.
  //
  // A fast learner can complete several lessons inside a minute, and every
  // `saveLessonCompletion` + auto-complete flip emits. The progress query is
  // a cheap Supabase select so we run it eagerly, but `refetchPersonalized`
  // hits a rate-limited edge function (3 s timeout, cost-sensitive) whose
  // ranking barely shifts per-lesson — debounce it so a burst of completions
  // coalesces into a single invocation.
  useEffect(() => {
    let personalizeTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = progressEventEmitter.subscribe(() => {
      refetchProgress();
      if (personalizeTimer) clearTimeout(personalizeTimer);
      personalizeTimer = setTimeout(() => {
        refetchPersonalized();
        personalizeTimer = null;
      }, 1500);
    });
    return () => {
      if (personalizeTimer) clearTimeout(personalizeTimer);
      unsubscribe();
    };
  }, [refetchPersonalized, refetchProgress]);

  return {
    modules,
    isLoading,
    isPersonalized,
    error: sanityError as Error | null,
    refetch,
  };
}
