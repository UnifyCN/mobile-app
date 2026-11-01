// App-context reads for the Companion: the signed-in user's profile, Checklist
// and conversation. Every database read goes through a client that carries the
// user's own JWT, so row-level security decides what comes back; the service
// role is never used here. A record the JWT cannot see is a denied read, not a
// cross-account fallback.
//
// The Checklist read mirrors both clients (web services/checklist.ts, mobile
// services/checklist/*): published `checklist` documents for the profile's
// persona and stage, merged with the user's `user_tasks` progress rows and
// their `custom_checklist_tasks`. As on mobile, a published task with a
// province shows only to accounts in that province; one without a province is
// national. Task keys are the shared `sanity:<id>` / `custom:<id>` keys. `select('*')` keeps the read working before and after the
// additive task-state migration (#360/#361): progress_state, revision and
// removed_at are used when present.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type {
  ChecklistContextItem,
  ConversationContextItem,
  ProfileContextItem,
  ProfileFieldKey,
  TaskState,
} from './contract.ts';
import { ReadDeniedError, ReadUnavailableError } from './registry.ts';
import { canonicalProvince } from '../province.ts';
import { parseUtcDate, formatIsoDate } from '../dates.ts';

export type UserClient = ReturnType<typeof createClient>;

/** A Supabase client that acts as the caller: anon key + the caller's JWT. */
export function createUserScopedClient(
  supabaseUrl: string,
  anonKey: string,
  authorization: string
): UserClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------- profile

export type ProfileRow = Record<string, unknown>;

/** The caller's onboarding profile row, or null when they have none. */
export async function readProfileRow(
  client: UserClient,
  userId: string,
  signal: AbortSignal
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('user_onboarding_profiles')
    .select('*')
    .eq('id', userId)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw classifyPostgrestError(error);
  return (data as ProfileRow | null) ?? null;
}

const PERSONA_PATTERN = /^[a-z_]{1,40}$/;

/** The profile fields the answer may use, as display-safe strings. */
export function profileContextItem(row: ProfileRow | null): ProfileContextItem | null {
  if (!row) return null;
  const fields: ProfileContextItem['fields'] = [];
  const push = (key: ProfileFieldKey, value: string | null) => {
    if (value) fields.push({ key, value });
  };
  const persona = typeof row.persona === 'string' && PERSONA_PATTERN.test(row.persona)
    ? row.persona
    : null;
  push('persona', persona);
  push('city', cleanShortText(row.city, 60));
  push('province', canonicalProvince(row.province));
  const arrival = parseUtcDate(row.arrival_date);
  push('arrival_date', arrival ? formatIsoDate(arrival) : null);
  if (fields.length === 0) return null;
  return {
    kind: 'profile',
    id: 'profile',
    revision: typeof row.updated_at === 'string' ? row.updated_at : null,
    fields,
  };
}

// ---------------------------------------------------------------- saved details

/** At most this many saved details reach the prompt. */
export const SAVED_DETAIL_LIMIT = 20;

/**
 * The caller's saved personal details (#370), oldest first. RLS returns only the
 * account's live details, and none while the Companion actions gate is off, so a removed
 * detail is never read again. Text only: it goes to the prompt, not to the client.
 */
export async function readSavedDetails(
  client: UserClient,
  userId: string,
  signal: AbortSignal
): Promise<string[]> {
  const { data, error } = await client
    .from('companion_saved_details')
    .select('body')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(SAVED_DETAIL_LIMIT)
    .abortSignal(signal);
  if (error) throw classifyPostgrestError(error);
  return ((data ?? []) as Array<{ body?: unknown }>)
    .map(row => cleanShortText(row.body, 300))
    .filter((text): text is string => text !== null);
}

// ---------------------------------------------------------------- conversation

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseConversationIdentifier(raw: unknown): string | null {
  return typeof raw === 'string' && UUID_PATTERN.test(raw.trim()) ? raw.trim().toLowerCase() : null;
}

/**
 * The caller's own conversation. Throws ReadDeniedError when the JWT cannot
 * see it (another account's id, a deleted conversation, a lost session).
 */
export async function readOwnConversation(
  client: UserClient,
  conversationIdentifier: string,
  signal: AbortSignal
): Promise<ConversationContextItem> {
  const { data, error } = await client
    .from('conversations')
    .select('conversation_identifier, updated_at')
    .eq('conversation_identifier', conversationIdentifier)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw classifyPostgrestError(error);
  if (!data) throw new ReadDeniedError('conversation not visible to this account');
  const row = data as { conversation_identifier: string; updated_at: string | null };
  return {
    kind: 'conversation',
    id: String(row.conversation_identifier),
    revision: row.updated_at ?? null,
  };
}

// ---------------------------------------------------------------- checklist

const STAGE_TO_SLUG: Record<number, string> = {
  0: 'not_arrived',
  1: 'arrived_0_3_months',
  2: 'months_3_12',
  3: 'years_1_3',
  4: 'years_3_plus',
};

/** At most this many tasks reach the prompt and the client. */
export const CHECKLIST_ITEM_LIMIT = 12;

const CHECKLIST_GROQ = `*[
  _type == "checklist"
  && (language == "en" || !defined(language))
  && $persona in personas
  && stage == $stage
  && (!defined(province) || province == "" || province == $province)
] | order(class asc, class_order asc) {
  _id,
  _rev,
  title,
  class,
  province,
  "i18n": select($lang != "en" => *[_type == "translation.metadata" && references(^._id)][0].translations[_key == $lang][0].value->{ title }, null)
}`;

export interface SanityConfig {
  projectId: string;
  dataset: string;
}

/** Sanity read config from the function environment, or null when absent. */
export function sanityConfigFromEnv(get: (key: string) => string | undefined): SanityConfig | null {
  const projectId = get('SANITY_PROJECT_ID')?.trim() ?? '';
  const dataset = get('SANITY_DATASET')?.trim() || 'production';
  if (!/^[a-z0-9]{1,32}$/.test(projectId) || !/^[\w-]{1,64}$/.test(dataset)) return null;
  return { projectId, dataset };
}

interface SanityChecklistDoc {
  _id: string;
  _rev: string | null;
  title: string | null;
}

/** The mobile Checklist rule: no province means national, else that province only. */
function shownInProvince(raw: unknown, province: string): boolean {
  if (raw === undefined || raw === null || raw === '') return true;
  const own = canonicalProvince(raw);
  return own !== null && own === province;
}

async function fetchChecklistContent(
  sanity: SanityConfig,
  persona: string,
  stage: string,
  lang: string,
  province: string,
  signal: AbortSignal,
  queryURL?: string
): Promise<SanityChecklistDoc[]> {
  const url = new URL(
    queryURL ?? `https://${sanity.projectId}.apicdn.sanity.io/v2024-01-01/data/query/${sanity.dataset}`
  );
  url.searchParams.set('query', CHECKLIST_GROQ);
  url.searchParams.set('$persona', JSON.stringify(persona));
  url.searchParams.set('$stage', JSON.stringify(stage));
  url.searchParams.set('$lang', JSON.stringify(lang));
  // Empty string: the account has no province, so national tasks only.
  url.searchParams.set('$province', JSON.stringify(province));
  const res = await fetch(url, { signal, redirect: 'error' });
  if (!res.ok) throw new ReadUnavailableError(`checklist content ${res.status}`);
  const body = (await res.json()) as { result?: unknown };
  if (!Array.isArray(body?.result)) throw new ReadUnavailableError('checklist content shape');
  return body.result.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const rec = raw as Record<string, unknown>;
    if (typeof rec._id !== 'string' || !/^[\w.-]{1,120}$/.test(rec._id)) return [];
    // Also checked here, so a content response that ignores the filter cannot
    // put another province's task in this account's context.
    if (!shownInProvince(rec.province, province)) return [];
    const i18n = rec.i18n && typeof rec.i18n === 'object' ? (rec.i18n as Record<string, unknown>) : null;
    return [
      {
        _id: rec._id,
        _rev: typeof rec._rev === 'string' ? rec._rev.slice(0, 64) : null,
        title: cleanShortText(i18n?.title, 160) ?? cleanShortText(rec.title, 160),
      },
    ];
  });
}

type ProgressRow = Record<string, unknown>;

function taskState(row: ProgressRow | undefined): TaskState {
  if (!row) return 'not_started';
  if (row.completed === true) return 'completed';
  if (row.progress_state === 'waiting') return 'waiting';
  if (row.progress_state === 'in_progress') return 'in_progress';
  return 'not_started';
}

function taskRevision(row: ProgressRow | undefined): string | null {
  if (!row) return null;
  const revision = row.revision;
  if (typeof revision === 'number' && Number.isInteger(revision)) return `r${revision}`;
  if (typeof revision === 'string' && /^\d{1,15}$/.test(revision)) return `r${revision}`;
  for (const key of ['updated_at', 'state_updated_at', 'dismissed_at', 'completed_at', 'created_at']) {
    const value = row[key];
    if (typeof value === 'string' && value) return `legacy:${value}`;
  }
  return null;
}

export interface ChecklistRead {
  items: ChecklistContextItem[];
  /** False when published task content could not be read (titles missing). */
  contentAvailable: boolean;
  /**
   * True when `items` holds every live task: the profile needs no published content, or
   * that content was read. False when published tasks may exist but were not read (no
   * content configuration, or the content read failed).
   */
  complete: boolean;
}

/**
 * The caller's current Checklist tasks, most relevant to `prompt` first.
 * Removed (dismissed) tasks are left out. Progress and custom tasks come from
 * the caller's JWT; published task content is public.
 */
export async function readChecklist(
  client: UserClient,
  userId: string,
  profile: ProfileRow | null,
  options: { sanity: SanityConfig | null; lang: string; prompt: string; limit?: number },
  signal: AbortSignal
): Promise<ChecklistRead> {
  const persona = typeof profile?.persona === 'string' && PERSONA_PATTERN.test(profile.persona)
    ? profile.persona
    : null;
  const stage = STAGE_TO_SLUG[Number(profile?.stage)] ?? null;
  const province = canonicalProvince(profile?.province) ?? '';

  const contentPromise: Promise<SanityChecklistDoc[] | null> =
    options.sanity && persona && stage
      ? fetchChecklistContent(options.sanity, persona, stage, options.lang, province, signal).catch(() => null)
      : Promise.resolve(null);

  const [progressRes, customRes, content] = await Promise.all([
    client
      .from('user_tasks')
      .select('*')
      .eq('user_id', userId)
      .not('sanity_checklist_id', 'is', null)
      .abortSignal(signal),
    client
      .from('custom_checklist_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .abortSignal(signal),
    contentPromise,
  ]);
  if (progressRes.error) throw classifyPostgrestError(progressRes.error);
  if (customRes.error) throw classifyPostgrestError(customRes.error);

  const progressById = new Map<string, ProgressRow>();
  for (const row of (progressRes.data ?? []) as ProgressRow[]) {
    if (typeof row.sanity_checklist_id === 'string') {
      progressById.set(row.sanity_checklist_id, row);
    }
  }

  const tasks: ChecklistContextItem[] = [];
  for (const doc of content ?? []) {
    const row = progressById.get(doc._id);
    if (row?.dismissed_at) continue; // removed from the Checklist
    tasks.push({
      kind: 'checklist_task',
      id: `sanity:${doc._id}`,
      revision: taskRevision(row),
      contentRevision: doc._rev,
      title: doc.title,
      state: taskState(row),
    });
  }
  for (const row of (customRes.data ?? []) as ProgressRow[]) {
    if (row.removed_at) continue;
    const id = row.id;
    if (typeof id !== 'number' && !(typeof id === 'string' && /^\d{1,19}$/.test(id))) continue;
    tasks.push({
      kind: 'checklist_task',
      id: `custom:${id}`,
      revision: taskRevision(row),
      contentRevision: null,
      title: cleanShortText(row.title, 160),
      state: taskState(row),
    });
  }

  return {
    items: rankTasks(tasks, options.prompt).slice(0, options.limit ?? CHECKLIST_ITEM_LIMIT),
    contentAvailable: content !== null || !options.sanity || !persona || !stage,
    complete: content !== null || !persona || !stage,
  };
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 3)
  );
}

/** Open tasks before completed ones; within each, word overlap with the prompt. */
function rankTasks(tasks: ChecklistContextItem[], prompt: string): ChecklistContextItem[] {
  const promptWords = words(prompt);
  const score = (task: ChecklistContextItem) => {
    let overlap = 0;
    for (const w of words(task.title ?? '')) if (promptWords.has(w)) overlap++;
    return overlap;
  };
  return tasks
    .map((task, index) => ({ task, index, open: task.state !== 'completed', score: score(task) }))
    .sort((a, b) =>
      a.open !== b.open ? (a.open ? -1 : 1) : b.score - a.score || a.index - b.index
    )
    .map(entry => entry.task);
}

// ---------------------------------------------------------------- helpers

/** Plain single-line text: no control characters, collapsed spaces, clamped. */
export function cleanShortText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** 401/403 and JWT errors are denials; anything else is an error. */
function classifyPostgrestError(error: { code?: string; message?: string; status?: number }): Error {
  const code = String(error.code ?? '');
  if (code === 'PGRST301' || code === 'PGRST302' || code === '42501' || /jwt/i.test(error.message ?? '')) {
    return new ReadDeniedError(code || 'denied');
  }
  return new Error(code || 'postgrest error');
}

/** #369 worker: the same persona/stage/province content rule, under its caller's total deadline.
 * The worker reads the account profile in its locked SQL transaction. The optional URL
 * belongs to a loopback-only local fixture; production callers omit it. No task title
 * leaves this function. A missing profile/config fails closed. */
export async function publishedTaskAvailable(
  profile: ProfileRow | null, taskId: string, sanity: SanityConfig | null,
  signal: AbortSignal, queryURL?: string,
): Promise<boolean> {
  const persona=typeof profile?.persona === 'string' && PERSONA_PATTERN.test(profile.persona) ? profile.persona : null;
  const stage=STAGE_TO_SLUG[Number(profile?.stage)] ?? null;
  if (!persona || !stage || !sanity) return false;
  const docs=await fetchChecklistContent(sanity,persona,stage,'en',canonicalProvince(profile?.province) ?? '',signal,queryURL);
  return docs.some(doc=>doc._id===taskId);
}
