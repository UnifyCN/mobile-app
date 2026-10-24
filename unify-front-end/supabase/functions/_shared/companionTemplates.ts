// supabase/functions/_shared/companionTemplates.ts

// Mirrored from the edge function's OnboardingProfile so this file
// has zero Deno-specific imports and can be loaded by jest.
export interface OnboardingProfile {
  persona: string | null;
  city: string | null;
  province: string | null;
  arrival_date: string | null;
  // Arrival stage 0-4 (a number, or the enum label "0"-"4"). Null is unknown.
  // The caller recomputes it from arrival_date; see _shared/arrivalStage.ts.
  stage: number | string | null;
  goals: string[];
  learning_interests: string[];
  hobbies: string[];
}

export type FeatherIconName =
  | 'map-pin' | 'briefcase' | 'home' | 'heart' | 'users'
  | 'book-open' | 'award' | 'flag' | 'file-text' | 'dollar-sign'
  | 'globe' | 'truck' | 'compass' | 'clipboard' | 'sun';

export interface PersonalizedStarter {
  id: string;
  category: string;
  iconName: FeatherIconName;
  iconBackground: string;
  prompt: string;
  priority: number;
}

export type TemplateFn = (profile: OnboardingProfile) => PersonalizedStarter | null;

export const CATEGORY_META: Record<
  string,
  { iconName: FeatherIconName; iconBackground: string }
> = {
  Vancouver:    { iconName: 'map-pin',     iconBackground: '#5C6BC0' },
  Toronto:      { iconName: 'map-pin',     iconBackground: '#5C6BC0' },
  Montreal:     { iconName: 'map-pin',     iconBackground: '#5C6BC0' },
  Calgary:      { iconName: 'map-pin',     iconBackground: '#5C6BC0' },
  Ottawa:       { iconName: 'map-pin',     iconBackground: '#5C6BC0' },
  'Your City':  { iconName: 'map-pin',     iconBackground: '#5C6BC0' },
  Settlement:   { iconName: 'compass',     iconBackground: '#66BB6A' },
  'Pre-Arrival':{ iconName: 'globe',       iconBackground: '#26A69A' },
  Documents:    { iconName: 'file-text',   iconBackground: '#F0A04B' },
  'Job Search': { iconName: 'briefcase',   iconBackground: '#EF5350' },
  Healthcare:   { iconName: 'heart',       iconBackground: '#66BB6A' },
  Housing:      { iconName: 'home',        iconBackground: '#26A69A' },
  'PR & Immigration': { iconName: 'award', iconBackground: '#5C6BC0' },
  Family:       { iconName: 'users',       iconBackground: '#E3A0C9' },
  Finance:      { iconName: 'dollar-sign', iconBackground: '#F0A04B' },
  Transit:      { iconName: 'truck',       iconBackground: '#26A69A' },
  Lifestyle:    { iconName: 'sun',         iconBackground: '#7C5CBF' },
  Education:    { iconName: 'book-open',   iconBackground: '#26A69A' },
  Citizenship:  { iconName: 'flag',        iconBackground: '#E3A0C9' },
};

export function makeStarter(
  id: string,
  category: keyof typeof CATEGORY_META,
  prompt: string,
  priority: number
): PersonalizedStarter {
  const meta = CATEGORY_META[category];
  return {
    id,
    category: category as string,
    iconName: meta.iconName,
    iconBackground: meta.iconBackground,
    prompt,
    priority,
  };
}

const PERSONA_LABELS: Record<string, string> = {
  international_student: 'international student',
  skilled_worker: 'skilled worker',
  refugee: 'refugee',
  other: 'newcomer',
};

const INTEREST_PROMPTS: Record<
  string,
  { category: keyof typeof CATEGORY_META; prompt: string }
> = {
  documents:     { category: 'Documents',         prompt: 'Which documents and IDs should I get first as a newcomer?' },
  employment:    { category: 'Job Search',        prompt: 'How do I start my job search in Canada?' },
  finance:       { category: 'Finance',           prompt: 'How do I open a bank account and build credit in Canada?' },
  housing:       { category: 'Housing',           prompt: 'How do I find housing as a newcomer?' },
  pr_immigration:{ category: 'PR & Immigration',  prompt: 'How do I apply for permanent residence?' },
  healthcare:    { category: 'Healthcare',        prompt: 'How does provincial healthcare work for newcomers?' },
  family_kids:   { category: 'Family',            prompt: 'What family and childcare benefits are available to newcomers?' },
  transit:       { category: 'Transit',           prompt: 'How do I get a driver\'s licence and use public transit in my city?' },
};

const HOBBY_PROMPTS: Record<
  string,
  { category: keyof typeof CATEGORY_META; verb: string }
> = {
  career_growth:    { category: 'Job Search', verb: 'grow my career' },
  exploring_canada: { category: 'Lifestyle',  verb: 'explore' },
  wellness:         { category: 'Lifestyle',  verb: 'find wellness activities' },
  technology:       { category: 'Lifestyle',  verb: 'meet other tech enthusiasts' },
  music:            { category: 'Lifestyle',  verb: 'enjoy live music' },
  fitness:          { category: 'Lifestyle',  verb: 'find affordable gyms and fitness classes' },
  personal_finance: { category: 'Finance',    verb: 'manage personal finances' },
  family_parenting: { category: 'Family',     verb: 'connect with other parents' },
  education:        { category: 'Education',  verb: 'continue my education' },
  food_cooking:     { category: 'Lifestyle',  verb: 'find authentic ingredients and cooking classes' },
  movies:           { category: 'Lifestyle',  verb: 'find indie cinemas and film events' },
};

const KNOWN_CITY_CATEGORIES = new Set([
  'Vancouver', 'Toronto', 'Montreal', 'Calgary', 'Ottawa',
]);

function cityCategory(city: string): keyof typeof CATEGORY_META {
  return (KNOWN_CITY_CATEGORIES.has(city) ? city : 'Your City') as keyof typeof CATEGORY_META;
}

// The stage is a number or the enum label "0"-"4". Anything else matches no stage.
function stageIs(stage: OnboardingProfile['stage'], expected: number): boolean {
  return stage !== null && String(stage) === String(expected);
}

function monthsSince(isoDate: string): number {
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return Infinity;
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 +
         (now.getMonth() - then.getMonth());
}

export const TEMPLATES: TemplateFn[] = [];

TEMPLATES.push(
  // persona + city — strongest signal
  (p) => p.persona && p.city ? makeStarter(
    'persona_city',
    cityCategory(p.city),
    `What do I need to know as a ${PERSONA_LABELS[p.persona] ?? 'newcomer'} in ${p.city}?`,
    10,
  ) : null,

  // persona only — fallback when no city
  (p) => p.persona && !p.city ? makeStarter(
    'persona_only',
    'Settlement',
    `What resources are available for a ${PERSONA_LABELS[p.persona] ?? 'newcomer'} in Canada?`,
    7,
  ) : null,

  // recent arrival
  (p) => {
    if (!p.arrival_date) return null;
    const months = monthsSince(p.arrival_date);
    if (months < 0 || months > 6) return null;
    return makeStarter(
      'arrival_recent',
      'Settlement',
      'I just arrived in Canada — what should I do in my first 30 days?',
      9,
    );
  },

  // future arrival
  (p) => {
    if (!p.arrival_date) return null;
    if (monthsSince(p.arrival_date) >= 0) return null;
    return makeStarter(
      'arrival_future',
      'Pre-Arrival',
      'How should I prepare before arriving in Canada?',
      9,
    );
  },

  // stage-based: planning before arrival, first month right after
  (p) => stageIs(p.stage, 0) ? makeStarter(
    'stage_planning',
    'Documents',
    'I\'m still planning my move - what documents do I need to start?',
    6,
  ) : null,

  (p) => stageIs(p.stage, 1) ? makeStarter(
    'stage_recently_arrived',
    'Settlement',
    'What should I prioritize in my first month here?',
    6,
  ) : null,

  // persona × employment combo
  (p) => p.persona === 'skilled_worker' && p.learning_interests.includes('employment') ? makeStarter(
    'persona_skilled_credentials',
    'Job Search',
    'How do I get my foreign credentials recognized in Canada?',
    9,
  ) : null,

  (p) => p.persona === 'international_student' && p.learning_interests.includes('employment') ? makeStarter(
    'persona_student_pgwp',
    'Job Search',
    'How do I get a post-graduation work permit (PGWP)?',
    9,
  ) : null,
);

// One template per learning interest
for (const [interest, meta] of Object.entries(INTEREST_PROMPTS)) {
  TEMPLATES.push((p) => p.learning_interests.includes(interest)
    ? makeStarter(`interest_${interest}`, meta.category, meta.prompt, 5)
    : null);
}

// One template per hobby (requires city)
for (const [hobby, meta] of Object.entries(HOBBY_PROMPTS)) {
  TEMPLATES.push((p) => {
    if (!p.city || !p.hobbies.includes(hobby)) return null;
    return makeStarter(
      `hobby_${hobby}_city`,
      meta.category,
      `Where can I ${meta.verb} in ${p.city}?`,
      4,
    );
  });
}

// Goal-mapped templates
TEMPLATES.push(
  (p) => p.goals.includes('learn_something') ? makeStarter(
    'goal_learn',
    'Education',
    'What free learning resources are available to newcomers?',
    5,
  ) : null,

  (p) => p.goals.includes('build_community') ? makeStarter(
    'goal_community',
    'Settlement',
    'How can I meet other newcomers and build community here?',
    5,
  ) : null,

  (p) => p.goals.includes('quick_answers') ? makeStarter(
    'goal_quick_answers',
    'Documents',
    'Quick reference: what are the top documents and steps I\'ll need?',
    5,
  ) : null,

  // pr_immigration × province
  (p) => p.learning_interests.includes('pr_immigration') && p.province ? makeStarter(
    'interest_pr_province',
    'PR & Immigration',
    `How do I apply for permanent residence from ${p.province}?`,
    7,
  ) : null,
);

export function buildPool(profile: OnboardingProfile): PersonalizedStarter[] {
  const out: PersonalizedStarter[] = [];
  for (const fn of TEMPLATES) {
    const result = fn(profile);
    if (result) out.push(result);
  }
  // Sort priority desc; stable for ties (declaration order preserved).
  return out.sort((a, b) => b.priority - a.priority).slice(0, 30);
}
