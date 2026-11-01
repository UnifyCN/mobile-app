// Companion context contract, version 1 (spec UnifyCN/mobile-app#359, ticket
// #362). rag-query returns this object beside each answer: on the streaming
// `metadata` event and in the non-streaming JSON body, as `context`.
//
// It names the app records the answer read (with stable ids and revisions, for
// the later planning boundary), the external pages it checked (URL, publisher,
// actual check time) and anything missing or conflicting that the answer asks
// about. Every field is structured data that clients render as text; nothing in
// it is HTML, an instruction or an authorization.
//
// Reads only. Nothing here is written to the profile, Checklist or saved
// personal details.

import type { CanadianProvince } from '../province.ts';

export const CONTEXT_VERSION = 1;

/** Read capabilities in the typed registry (registry.ts). */
export type ReadCapabilityName =
  | 'context.profile'
  | 'context.checklist'
  | 'context.conversation'
  /** #370: the account's saved personal details. Prompt data only; not in this object. */
  | 'context.saved_details'
  | 'content.knowledge'
  | 'guidance.search'
  | 'guidance.read';

export type ReadStatus = 'ok' | 'denied' | 'unavailable' | 'error' | 'skipped';

export interface ReadReport {
  capability: ReadCapabilityName;
  status: ReadStatus;
}

/** The four shared task states (GLOSSARY.md). */
export type TaskState = 'not_started' | 'in_progress' | 'waiting' | 'completed';

export type ProfileFieldKey = 'persona' | 'city' | 'province' | 'arrival_date';

export interface ProfileContextItem {
  kind: 'profile';
  id: 'profile';
  /** `updated_at` of the profile row, or null when the row has none. */
  revision: string | null;
  fields: Array<{ key: ProfileFieldKey; value: string }>;
}

export interface ChecklistContextItem {
  kind: 'checklist_task';
  /** The shared task key: `sanity:<document id>` or `custom:<row id>`. */
  id: string;
  /** `r<n>` from the task revision column, else `legacy:<timestamp>`. */
  revision: string | null;
  /** Content revision (`_rev`) of a content-backed task, else null. */
  contentRevision: string | null;
  title: string | null;
  state: TaskState;
}

export interface ConversationContextItem {
  kind: 'conversation';
  /** conversation_identifier of the signed-in user's own conversation. */
  id: string;
  /** `updated_at` of the conversation row. */
  revision: string | null;
}

/**
 * Details the user stated in this conversation. Used for this answer only:
 * never written to the profile or to saved personal details, and never read
 * by a later conversation.
 */
export interface ConversationDetailItem {
  kind: 'conversation_detail';
  saved: false;
  fields: Array<{ key: 'city' | 'province' | 'arrival'; value: string }>;
}

/** A knowledge-base article the answer retrieved (app content). */
export interface AppContentItem {
  kind: 'app_content';
  id: string;
  revision: string | null;
  title: string;
}

export type ContextItem =
  | ProfileContextItem
  | ChecklistContextItem
  | ConversationContextItem
  | ConversationDetailItem
  | AppContentItem;

export type Jurisdiction = 'federal' | CanadianProvince;

export interface GuidanceSource {
  /** Stable within one answer: S1, S2, … (the order the prompt cites). */
  id: string;
  url: string;
  title: string | null;
  /** From the domain registry, never from page text. */
  publisher: string;
  jurisdiction: Jurisdiction;
  /** When this server finished reading the page (ISO), else null. */
  checkedAt: string | null;
  status: 'checked' | 'failed' | 'excluded';
  reason?: 'different_province' | 'fetch_failed' | 'not_readable';
}

export type GuidanceUnavailableReason =
  | 'provider_disabled'
  | 'provider_not_configured'
  | 'search_failed'
  | 'no_official_results'
  | 'read_failed';

export interface GuidanceResult {
  status: 'not_needed' | 'checked' | 'conflict' | 'unavailable';
  reason?: GuidanceUnavailableReason;
  sources: GuidanceSource[];
}

export type Clarification =
  | {
      kind: 'profile_conflict';
      field: 'province' | 'arrival_date';
      profileValue: string;
      conversationValue: string;
    }
  | { kind: 'missing'; field: 'province' }
  /** The message names two or more different destinations; ask which applies. */
  | { kind: 'place_unclear'; field: 'province'; options: string[] };

export interface CompanionContext {
  version: typeof CONTEXT_VERSION;
  items: ContextItem[];
  reads: ReadReport[];
  guidance: GuidanceResult;
  clarification: Clarification | null;
}
