// supabase/functions/_shared/learnRanking.ts
//
// Learn module ranking for the `personalize` edge function. Dependency-free
// so Deno and Jest can both load it.

import type { OnboardingProfile } from './companionTemplates.ts';
// @ts-ignore Deno needs the .ts extension; the app's tsc does not allow it.
import { isVisibleForProvince, resolveUserProvince } from './province.ts';

export interface LearnModuleRow {
  sanity_id: string;
  title: string;
  personas: string[];
  interests: string[];
  province?: string | null;
}

export interface LearnProgressRow {
  module_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at: string | null;
}

export interface ScoredModule {
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
  module: LearnModuleRow,
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

/**
 * Score and order the modules a user may see. Modules for other provinces are
 * dropped before scoring, so nothing downstream can bring them back.
 */
export function rankLearnModules(
  modules: readonly LearnModuleRow[],
  progressRows: readonly LearnProgressRow[],
  profile: OnboardingProfile
): ScoredModule[] {
  const progressByModule = new Map<string, LearnProgressRow>();
  for (const row of progressRows) {
    progressByModule.set(row.module_id, row);
  }

  // The stored profile province may be an abbreviation or free text.
  const userProvince = resolveUserProvince(profile.province);
  const visible = modules.filter(m =>
    isVisibleForProvince(m.province, userProvince)
  );

  const scored: ScoredModule[] = visible.map(m => {
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

  return scored;
}
