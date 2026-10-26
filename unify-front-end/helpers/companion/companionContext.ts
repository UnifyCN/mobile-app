/**
 * Companion context (spec #359, ticket #362): what an answer read from the
 * user's account and which official pages it checked. rag-query sends it as
 * `context` (version 1) on the streamed `metadata` event; the app saves it
 * with the assistant message (`messages.companion_context`) so a reopened
 * conversation shows the same sources and context. Same contract as the web
 * app's lib/companionContext.ts.
 *
 * Everything here is display data. It is validated field by field against an
 * allowlist and rendered as plain text; a malformed or unknown entry is
 * dropped, never shown raw. It grants nothing and triggers nothing.
 */

export type TaskState = 'not_started' | 'in_progress' | 'waiting' | 'completed';

export type ContextItem =
  | {
      kind: 'profile';
      fields: {
        key: 'persona' | 'city' | 'province' | 'arrival_date';
        value: string;
      }[];
    }
  | {
      kind: 'conversation_detail';
      fields: { key: 'city' | 'province' | 'arrival'; value: string }[];
    }
  | {
      kind: 'checklist_task';
      id: string;
      title: string | null;
      state: TaskState;
    };

export interface GuidanceSource {
  id: string;
  url: string;
  title: string | null;
  publisher: string;
  jurisdiction: string;
  checkedAt: string | null;
  status: 'checked' | 'failed' | 'excluded';
}

export type GuidanceStatus =
  | 'not_needed'
  | 'checked'
  | 'conflict'
  | 'unavailable';

export type Clarification =
  | {
      kind: 'profile_conflict';
      field: 'province' | 'arrival_date';
      profileValue: string;
      conversationValue: string;
    }
  | { kind: 'missing'; field: 'province' };

export interface CompanionContext {
  version: 1;
  items: ContextItem[];
  guidance: { status: GuidanceStatus; sources: GuidanceSource[] };
  clarification: Clarification | null;
  /** Reads that failed or were denied (shown as "could not be read"). */
  unreadable: ('profile' | 'checklist')[];
}

const TASK_STATES: readonly TaskState[] = [
  'not_started',
  'in_progress',
  'waiting',
  'completed',
];
const GUIDANCE_STATUSES: readonly GuidanceStatus[] = [
  'not_needed',
  'checked',
  'conflict',
  'unavailable',
];
const PROFILE_KEYS = ['persona', 'city', 'province', 'arrival_date'] as const;
const DETAIL_KEYS = ['city', 'province', 'arrival'] as const;

/** Largest context saved with a message (the column allows 32 KB). */
const MAX_SAVED_CHARS = 30_000;

// Control and invisible formatting characters (bidi overrides, zero-width).
// Written as ranges: Hermes regex support for \p{…} varies by version.
const HIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁩﻿]/g;

function record(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** Single-line display text, clamped; null when absent or blank. */
function text(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(HIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** Only plain https links are shown; anything else is not a link. */
function httpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  return /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/.test(raw)
    ? raw
    : null;
}

function isoTime(raw: unknown): string | null {
  return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

function fields<K extends string>(
  raw: unknown,
  keys: readonly K[]
): { key: K; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => {
    const rec = record(entry);
    const key = rec?.key;
    const value = text(rec?.value, 80);
    return typeof key === 'string' &&
      (keys as readonly string[]).includes(key) &&
      value
      ? [{ key: key as K, value }]
      : [];
  });
}

function item(raw: unknown): ContextItem | null {
  const rec = record(raw);
  if (!rec) return null;
  if (rec.kind === 'profile') {
    const f = fields(rec.fields, PROFILE_KEYS);
    return f.length ? { kind: 'profile', fields: f } : null;
  }
  if (rec.kind === 'conversation_detail') {
    const f = fields(rec.fields, DETAIL_KEYS);
    return f.length ? { kind: 'conversation_detail', fields: f } : null;
  }
  if (rec.kind === 'checklist_task') {
    const id =
      typeof rec.id === 'string' &&
      /^(sanity|custom):[\w.-]{1,120}$/.test(rec.id)
        ? rec.id
        : null;
    const state = TASK_STATES.find(s => s === rec.state);
    return id && state
      ? { kind: 'checklist_task', id, title: text(rec.title, 160), state }
      : null;
  }
  return null;
}

function source(raw: unknown): GuidanceSource | null {
  const rec = record(raw);
  const url = httpsUrl(rec?.url);
  const publisher = text(rec?.publisher, 80);
  const status = rec?.status;
  if (!rec || !url || !publisher) return null;
  if (status !== 'checked' && status !== 'failed' && status !== 'excluded') {
    return null;
  }
  return {
    id: text(rec.id, 8) ?? '',
    url,
    title: text(rec.title, 160),
    publisher,
    jurisdiction: text(rec.jurisdiction, 40) ?? '',
    // A check time is shown only for a page that was actually read.
    checkedAt: status === 'failed' ? null : isoTime(rec.checkedAt),
    status,
  };
}

function clarification(raw: unknown): Clarification | null {
  const rec = record(raw);
  if (!rec) return null;
  if (rec.kind === 'missing' && rec.field === 'province') {
    return { kind: 'missing', field: 'province' };
  }
  if (
    rec.kind === 'profile_conflict' &&
    (rec.field === 'province' || rec.field === 'arrival_date')
  ) {
    const profileValue = text(rec.profileValue, 60);
    const conversationValue = text(rec.conversationValue, 60);
    return profileValue && conversationValue
      ? {
          kind: 'profile_conflict',
          field: rec.field,
          profileValue,
          conversationValue,
        }
      : null;
  }
  return null;
}

/**
 * Validate a `context` object from rag-query or a saved message. Null for
 * anything that is not version 1 (an older rag-query sends none; an unknown
 * later version is not guessed at).
 */
export function parseCompanionContext(raw: unknown): CompanionContext | null {
  const rec = record(raw);
  if (!rec || rec.version !== 1) return null;
  const guidance = record(rec.guidance);
  const status =
    GUIDANCE_STATUSES.find(s => s === guidance?.status) ?? 'not_needed';
  const reads = Array.isArray(rec.reads) ? rec.reads : [];
  const unreadable = reads.flatMap(r => {
    const read = record(r);
    const failed =
      read?.status === 'error' ||
      read?.status === 'unavailable' ||
      read?.status === 'denied';
    if (!failed) return [];
    if (read?.capability === 'context.profile') return ['profile' as const];
    if (read?.capability === 'context.checklist') return ['checklist' as const];
    return [];
  });
  return {
    version: 1,
    items: (Array.isArray(rec.items) ? rec.items : [])
      .map(item)
      .filter((i): i is ContextItem => i !== null)
      .slice(0, 30),
    guidance: {
      status,
      sources: (Array.isArray(guidance?.sources) ? guidance.sources : [])
        .map(source)
        .filter((s): s is GuidanceSource => s !== null)
        .slice(0, 6),
    },
    clarification: clarification(rec.clarification),
    unreadable,
  };
}

/**
 * The server's context object as received, for saving with the answer (the
 * saved row is parsed again on read). Null unless it is version 1 and fits.
 */
export function savableCompanionContext(
  raw: unknown
): Record<string, unknown> | null {
  if (!parseCompanionContext(raw)) return null;
  return JSON.stringify(raw).length <= MAX_SAVED_CHARS
    ? (raw as Record<string, unknown>)
    : null;
}

/** True when there is anything worth a disclosure entry. */
export function hasVisibleContext(
  context: CompanionContext | null | undefined
): context is CompanionContext {
  if (!context) return false;
  return (
    context.items.length > 0 ||
    context.guidance.sources.length > 0 ||
    context.guidance.status === 'unavailable' ||
    context.guidance.status === 'conflict' ||
    context.clarification !== null ||
    context.unreadable.length > 0
  );
}

/** The place this answer was about: what the user said, else the profile. */
export function contextPlace(context: CompanionContext): string | null {
  const from = (kind: ContextItem['kind']) => {
    const found = context.items.find(i => i.kind === kind);
    if (!found || found.kind === 'checklist_task') return null;
    const city = found.fields.find(f => f.key === 'city')?.value;
    const province = found.fields.find(f => f.key === 'province')?.value;
    return [city, province].filter(Boolean).join(', ') || null;
  };
  return from('conversation_detail') ?? from('profile');
}

/** The most recent check time among pages actually read, if any. */
export function latestCheck(context: CompanionContext): string | null {
  const times = context.guidance.sources
    .filter(s => s.status === 'checked' && s.checkedAt)
    .map(s => s.checkedAt as string)
    .sort();
  return times.length ? times[times.length - 1] : null;
}

/**
 * An arrival code (`next_week`, `in_days:3`) as an i18n key and its number.
 * `number`, not `count`: i18next reserves `count` for plural keys.
 */
export function arrivalKey(
  code: string
): { key: string; number?: number } | null {
  const n = /^in_(days|weeks):(\d{1,2})$/.exec(code);
  if (n) {
    const value = Number(n[2]);
    if (n[1] === 'days' && value === 1) {
      return { key: 'companion.context.arrival.tomorrow' };
    }
    if (n[1] === 'weeks' && value === 1) {
      return { key: 'companion.context.arrival.inOneWeek' };
    }
    return { key: `companion.context.arrival.${n[1]}`, number: value };
  }
  if (['tomorrow', 'this_week', 'next_week', 'next_month'].includes(code)) {
    return { key: `companion.context.arrival.${code}` };
  }
  return null;
}
