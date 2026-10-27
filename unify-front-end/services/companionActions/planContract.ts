/**
 * Client side of the settlement plan actions (mobile-app#364), contract version 1.
 * A plan refers to shared Checklist tasks by stable identity; it never holds a copy
 * of their progress. Responses are checked here: unknown fields are ignored, a
 * missing or mistyped field is a contract error. Mirror of the web app's
 * lib/companionActions/planContract.ts.
 */
import {
  ContractError,
  TASK_STATES,
  type ProposalProfile,
  type TaskState,
} from './contract';

export const PLAN_GOAL_MAX = 120;

/** A task the plan refers to, read now from the shared task rows. */
export interface PlanTaskNow {
  taskRef: string;
  source: 'sanity' | 'custom';
  /** Current title of a custom task. Content tasks are titled by the client's Checklist. */
  title: string | null;
  /** Display text the suggestion gave a reused task (never authority). */
  label: string | null;
  state: TaskState;
  waitingReason: string | null;
  revision: number;
  /** Removed from the Checklist, or no longer accessible. Its controls are disabled. */
  removed: boolean;
}

export type PlanDraftItem =
  | { kind: 'existing'; taskRef: string; label: string | null }
  | {
      kind: 'new';
      key: string;
      title: string;
      include: boolean;
      confirmNew: boolean;
      candidates: string[];
    }
  /** A reviewed compensating change of a plan Undo: */
  | { kind: 'remove_plan'; planId: string; expectedRevision: number }
  | { kind: 'remove_task'; taskRef: string; title: string; expectedRevision: number }
  | { kind: 'keep_task'; taskRef: string; title: string };

export interface PlanContext {
  profile: ProposalProfile | null;
  existing: { taskRef: string; available: boolean }[];
  /** Possible matches per addition key: same-title tasks the user must choose about. */
  matches: Record<string, { taskRef: string; title: string | null }[]>;
}

export type PlanResultOutcome =
  | 'reused'
  | 'created'
  | 'failed'
  | 'needs_review'
  /** Left out by the user in a revised retry review: never added. */
  | 'excluded'
  | 'removed'
  | 'already_removed'
  | 'kept';

/** One item of a plan receipt: what actually happened, with the title saved at the time. */
export interface PlanResult {
  key: string | null;
  taskRef: string | null;
  title: string | null;
  label: string | null;
  outcome: PlanResultOutcome;
  reason: string | null;
  itemOperationId: string | null;
  /** A `needs_review` addition: the revised review that can add it after a new approval. */
  planProposalId: string | null;
}

export interface PlanReceipt {
  operationId: string;
  createdAt: string;
  kind: 'plan' | 'plan_retry' | 'plan_undo';
  planId: string | null;
  /** 'partial': some independent additions failed; the others are saved. */
  status: 'applied' | 'partial';
  results: PlanResult[];
  /** Keys of failed additions that a Retry would run (with their original identity). */
  retryable: string[];
  /** A retry receipt: the plan approval it continues. */
  retryOf: string | null;
  /** The revised review this receipt approved (a reviewed retry), if any. */
  planProposalId: string | null;
  undoneBy: string | null;
  undoable: boolean;
  /** How many tasks this approval added (an Undo removes them, after confirmation). */
  removalCount: number;
}

export interface PlanProposal {
  id: string;
  revision: number;
  status: 'draft' | 'applied' | 'cancelled';
  /** 'retry': the revised review of a saved plan's failed additions after its context changed. */
  kind: 'plan' | 'undo' | 'retry';
  goal: string;
  items: PlanDraftItem[];
  /** The items exactly as the server returned them: approval sends them back. */
  rawItems: unknown[];
  context: PlanContext | null;
  previousContext: PlanContext | null;
  reviewReason: 'edited' | 'context_changed' | 'restored' | null;
  source: { conversationId: string; messageId: number | null } | null;
  undoOf: string | null;
  /** Kind retry: the plan approval receipt whose failed additions it reviews again. */
  retryOf: string | null;
  /** Tasks approval adds (kind plan) or removes (kind undo). */
  changeCount: number;
  /** Additions with a possible match the user has not resolved. Approval waits for them. */
  unresolved: string[];
  tasks: PlanTaskNow[];
  planId: string | null;
  receipt: PlanReceipt | null;
}

export interface PlanView {
  planId: string;
  goal: string;
  revision: number;
  removed: boolean;
  context: PlanContext | null;
  source: { conversationId: string; messageId: number | null } | null;
  proposalId: string | null;
  items: PlanTaskNow[];
  receipt: PlanReceipt | null;
  /**
   * Every revised review of this plan's failed additions that is open (it needs the
   * user's approval) or approved (its receipt says what it added), oldest first. Separate
   * Retries can leave more than one open; each is approved, edited or closed on its own.
   */
  reviews: PlanProposal[];
  updatedAt: string;
}

export interface PlanApplyReply {
  status: 'applied' | 'partial';
  replayed: boolean;
  operationId: string;
  receipt: PlanReceipt;
  plan: PlanView | null;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (o: Json, k: string): string => {
  if (typeof o[k] !== 'string') throw new ContractError(k);
  return o[k] as string;
};
const strOrNull = (o: Json, k: string): string | null =>
  o[k] === null || o[k] === undefined ? null : str(o, k);
const int = (o: Json, k: string): number => {
  if (typeof o[k] !== 'number' || !Number.isInteger(o[k]))
    throw new ContractError(k);
  return o[k] as number;
};
const bool = (o: Json, k: string): boolean => {
  if (typeof o[k] !== 'boolean') throw new ContractError(k);
  return o[k] as boolean;
};
const arr = (o: Json, k: string): unknown[] => {
  if (!Array.isArray(o[k])) throw new ContractError(k);
  return o[k] as unknown[];
};
const state = (o: Json, k: string): TaskState => {
  const v = o[k];
  if (typeof v !== 'string' || !(TASK_STATES as readonly string[]).includes(v))
    throw new ContractError(k);
  return v as TaskState;
};

export function parsePlanTask(raw: unknown): PlanTaskNow {
  if (!isObject(raw)) throw new ContractError('plan task');
  const source = raw.source === 'custom' ? 'custom' : 'sanity';
  return {
    taskRef: str(raw, 'task_ref'),
    source,
    title: strOrNull(raw, 'title'),
    label: strOrNull(raw, 'label'),
    state: state(raw, 'state'),
    waitingReason: strOrNull(raw, 'waiting_reason'),
    revision: int(raw, 'revision'),
    removed: bool(raw, 'removed'),
  };
}

function parseItem(raw: unknown): PlanDraftItem {
  if (!isObject(raw)) throw new ContractError('plan item');
  switch (raw.kind) {
    case 'existing':
      return { kind: 'existing', taskRef: str(raw, 'task_ref'), label: strOrNull(raw, 'label') };
    case 'new':
      return {
        kind: 'new',
        key: str(raw, 'key'),
        title: str(raw, 'title'),
        include: bool(raw, 'include'),
        confirmNew: raw.confirm_new === true,
        candidates: Array.isArray(raw.candidates)
          ? raw.candidates.filter((c): c is string => typeof c === 'string')
          : [],
      };
    case 'remove_plan':
      return { kind: 'remove_plan', planId: str(raw, 'plan_id'), expectedRevision: int(raw, 'expected_revision') };
    case 'remove_task':
      return {
        kind: 'remove_task',
        taskRef: str(raw, 'task_ref'),
        title: str(raw, 'title'),
        expectedRevision: int(raw, 'expected_revision'),
      };
    case 'keep_task':
      return { kind: 'keep_task', taskRef: str(raw, 'task_ref'), title: str(raw, 'title') };
  }
  throw new ContractError('plan item kind');
}

function parseContext(raw: unknown): PlanContext | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) throw new ContractError('plan context');
  const p = raw.profile;
  const profile = isObject(p)
    ? {
        city: strOrNull(p, 'city'),
        province: strOrNull(p, 'province'),
        arrivalDate: strOrNull(p, 'arrival_date'),
      }
    : null;
  const existing = Array.isArray(raw.existing)
    ? raw.existing.map(e => {
        if (!isObject(e)) throw new ContractError('plan context existing');
        return { taskRef: str(e, 'task_ref'), available: bool(e, 'available') };
      })
    : [];
  const matches: PlanContext['matches'] = {};
  if (isObject(raw.matches)) {
    for (const [key, list] of Object.entries(raw.matches)) {
      if (!Array.isArray(list)) throw new ContractError('plan context matches');
      matches[key] = list.map(m => {
        if (!isObject(m)) throw new ContractError('plan context match');
        return { taskRef: str(m, 'task_ref'), title: strOrNull(m, 'title') };
      });
    }
  }
  return { profile, existing, matches };
}

const OUTCOMES: readonly PlanResultOutcome[] = [
  'reused',
  'created',
  'failed',
  'needs_review',
  'excluded',
  'removed',
  'already_removed',
  'kept',
];

export function parsePlanReceipt(raw: unknown): PlanReceipt {
  if (!isObject(raw)) throw new ContractError('plan receipt');
  const kind = raw.kind;
  if (kind !== 'plan' && kind !== 'plan_retry' && kind !== 'plan_undo')
    throw new ContractError('plan receipt kind');
  const status = raw.status === 'partial' ? 'partial' : raw.status === 'applied' ? 'applied' : null;
  if (!status) throw new ContractError('plan receipt status');
  return {
    operationId: str(raw, 'operation_id'),
    createdAt: str(raw, 'created_at'),
    kind,
    planId: strOrNull(raw, 'plan_id'),
    status,
    results: arr(raw, 'results').map(r => {
      if (!isObject(r) || !(OUTCOMES as readonly unknown[]).includes(r.outcome))
        throw new ContractError('plan result');
      return {
        key: strOrNull(r, 'key'),
        taskRef: strOrNull(r, 'task_ref'),
        title: strOrNull(r, 'title'),
        label: strOrNull(r, 'label'),
        outcome: r.outcome as PlanResultOutcome,
        reason: strOrNull(r, 'reason'),
        itemOperationId: strOrNull(r, 'item_operation_id'),
        planProposalId: strOrNull(r, 'plan_proposal_id'),
      };
    }),
    retryable: Array.isArray(raw.retryable)
      ? raw.retryable.filter((k): k is string => typeof k === 'string')
      : [],
    retryOf: strOrNull(raw, 'retry_of'),
    planProposalId: strOrNull(raw, 'plan_proposal_id'),
    undoneBy: strOrNull(raw, 'undone_by'),
    undoable: raw.undoable === true,
    removalCount: typeof raw.removal_count === 'number' ? raw.removal_count : 0,
  };
}

const sourceOf = (raw: unknown) =>
  isObject(raw)
    ? {
        conversationId: str(raw, 'conversation_id'),
        messageId:
          raw.message_id === undefined || raw.message_id === null
            ? null
            : int(raw, 'message_id'),
      }
    : null;

const REVIEW_REASONS = ['edited', 'context_changed', 'restored'] as const;

export function parsePlanProposal(raw: unknown): PlanProposal {
  if (!isObject(raw)) throw new ContractError('plan proposal');
  const status = raw.status;
  if (status !== 'draft' && status !== 'applied' && status !== 'cancelled')
    throw new ContractError('plan proposal status');
  const kind = raw.kind === 'undo' || raw.kind === 'plan' || raw.kind === 'retry' ? raw.kind : null;
  if (!kind) throw new ContractError('plan proposal kind');
  const reason = raw.review_reason ?? null;
  if (reason !== null && !(REVIEW_REASONS as readonly unknown[]).includes(reason))
    throw new ContractError('plan proposal review_reason');
  const rawItems = arr(raw, 'items');
  return {
    id: str(raw, 'plan_proposal_id'),
    revision: int(raw, 'proposal_revision'),
    status,
    kind,
    goal: str(raw, 'goal'),
    items: rawItems.map(parseItem),
    rawItems,
    context: parseContext(raw.context),
    previousContext: parseContext(raw.previous_context),
    reviewReason: reason as PlanProposal['reviewReason'],
    source: sourceOf(raw.source),
    undoOf: strOrNull(raw, 'undo_of'),
    retryOf: strOrNull(raw, 'retry_of'),
    changeCount: int(raw, 'change_count'),
    unresolved: Array.isArray(raw.unresolved)
      ? raw.unresolved.filter((k): k is string => typeof k === 'string')
      : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map(parsePlanTask) : [],
    planId: strOrNull(raw, 'plan_id'),
    receipt:
      raw.receipt === null || raw.receipt === undefined ? null : parsePlanReceipt(raw.receipt),
  };
}

export function parsePlanView(raw: unknown): PlanView {
  if (!isObject(raw)) throw new ContractError('plan');
  return {
    planId: str(raw, 'plan_id'),
    goal: str(raw, 'goal'),
    revision: int(raw, 'revision'),
    removed: bool(raw, 'removed'),
    context: parseContext(raw.context),
    source: sourceOf(raw.source),
    proposalId: strOrNull(raw, 'proposal_id'),
    items: arr(raw, 'items').map(parsePlanTask),
    receipt:
      raw.receipt === null || raw.receipt === undefined ? null : parsePlanReceipt(raw.receipt),
    // `review` (the latest review only) is the earlier single-review shape: read it only
    // from a service that does not send `reviews`.
    reviews: Array.isArray(raw.reviews)
      ? raw.reviews.map(parsePlanProposal)
      : raw.review === null || raw.review === undefined
        ? []
        : [parsePlanProposal(raw.review)],
    updatedAt: str(raw, 'updated_at'),
  };
}

export function parsePlanReply(raw: unknown): PlanApplyReply {
  if (!isObject(raw)) throw new ContractError('plan reply');
  const receipt = parsePlanReceipt(raw.receipt);
  return {
    status: receipt.status,
    replayed: raw.replayed === true,
    operationId: str(raw, 'operation_id'),
    receipt,
    plan: raw.plan === null || raw.plan === undefined ? null : parsePlanView(raw.plan),
  };
}

/** The draft as an edit sends it: the server rebuilds titles from the original draft. */
export function draftEditItems(items: PlanDraftItem[]): Record<string, unknown>[] {
  return items.flatMap((i): Record<string, unknown>[] => {
    if (i.kind === 'existing') return [{ kind: 'existing', task_ref: i.taskRef }];
    if (i.kind === 'new')
      return [
        { kind: 'new', key: i.key, include: i.include, ...(i.confirmNew ? { confirm_new: true } : {}) },
      ];
    return [];
  });
}

/** An item of a suggested plan as the answer gave it (rag-query `actionProposal`). */
export type SuggestedPlanItem =
  | { kind: 'existing'; task_ref: string; label?: string }
  | { kind: 'new'; title: string; candidates?: string[] };

/**
 * The plan an answer suggests, allowlisted fields only. A suggestion is not
 * authorization: the action service prepares the reviewable draft and checks every
 * reference again.
 */
export function parseSuggestedPlan(
  raw: unknown
): { goal: string; items: SuggestedPlanItem[] } | null {
  if (!isObject(raw) || raw.type !== 'plan' || raw.version !== 1) return null;
  if (typeof raw.goal !== 'string' || !raw.goal.trim() || raw.goal.length > PLAN_GOAL_MAX)
    return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 12)
    return null;
  const items: SuggestedPlanItem[] = [];
  for (const i of raw.items) {
    if (!isObject(i)) return null;
    if (i.kind === 'existing' && typeof i.task_ref === 'string') {
      items.push({
        kind: 'existing',
        task_ref: i.task_ref,
        ...(typeof i.label === 'string' && i.label.trim() ? { label: i.label.trim() } : {}),
      });
    } else if (i.kind === 'new' && typeof i.title === 'string' && i.title.trim()) {
      const candidates = Array.isArray(i.candidates)
        ? i.candidates.filter((c): c is string => typeof c === 'string')
        : [];
      items.push({ kind: 'new', title: i.title.trim(), ...(candidates.length ? { candidates } : {}) });
    } else {
      return null;
    }
  }
  return { goal: raw.goal.trim(), items };
}
