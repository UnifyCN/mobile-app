/**
 * Client side of the Companion actions contract, version 1 (mobile-app#361, #363, #365).
 * The server is supabase/functions/companion-actions in the web repo. Responses are
 * checked here: unknown fields are ignored, a missing or mistyped field is a
 * contract error. Mirror of the web app's lib/companionActions/contract.ts.
 */

export const TASK_ACTIONS_CONTRACT_VERSION = 1;

export const TASK_STATES = [
  'not_started',
  'in_progress',
  'waiting',
  'completed',
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const WAITING_REASON_MAX = 500;
/** Longest task title the action service stores (#363). */
export const TITLE_MAX = 200;
/** Longest custom task description an edit stores (#365). */
export const DESCRIPTION_MAX = 2000;

export type OperationType =
  | 'task.set_state'
  | 'task.create_custom'
  | 'task.remove_created'
  | 'task.edit_details';

/** A field an edit changes (#365). */
export type EditField = 'title' | 'description' | 'priority';

/** One changed field of an edit, as the receipt recorded it (history). */
export interface FieldChange {
  field: EditField;
  before: string;
  after: string;
}

/** Durable record of one saved change. Historical once `current` is false. */
export interface TaskReceipt {
  operationId: string;
  createdAt: string;
  kind: 'change' | 'undo';
  /** What the receipt did: a state change, an added task (#363), or its removal by Undo. */
  operationType: OperationType;
  /**
   * The title recorded with an added or removed task, or the title a task had after an
   * edit (#365); null for a state change.
   */
  title: string | null;
  /** #365: each field an edit changed, with the values before and after. */
  changes: FieldChange[];
  undoOf: string | null;
  taskRef: string;
  beforeState: TaskState;
  afterState: TaskState;
  afterRevision: number;
  undoneBy: string | null;
  /** The task is still at the revision this receipt produced. */
  current: boolean;
  undoable: boolean;
}

export interface TaskProgress {
  taskRef: string;
  state: TaskState;
  waitingReason: string | null;
  revision: number;
  removed: boolean;
  lastReceipt: TaskReceipt | null;
}

export interface CurrentTaskValue {
  taskRef: string;
  state: TaskState;
  waitingReason: string | null;
  revision: number;
  removed: boolean;
}

export interface SetStateOperation {
  type: 'task.set_state';
  task_ref: string;
  state: TaskState;
  expected_revision: number;
  waiting_reason?: string;
}

export type Priority =
  | 'Do now'
  | 'Do soon'
  | 'Explore and connect'
  | 'Optional / later';

/** Add one custom Checklist task (#363). Only by an approved draft or a clear command. */
export interface CreateTaskOperation {
  type: 'task.create_custom';
  title: string;
  priority: Priority;
}

/** The inverse of an added task: removes it. Only as an Undo's reviewed change. */
export interface RemoveCreatedOperation {
  type: 'task.remove_created';
  task_ref: string;
  expected_revision: number;
}

/**
 * Title, description or priority of one custom task (#365). Only by an approved draft,
 * a clear command or a reviewed Undo. A published task's are shared content.
 */
export interface EditDetailsOperation {
  type: 'task.edit_details';
  task_ref: string;
  expected_revision: number;
  title?: string;
  description?: string;
  priority?: Priority;
}

export type Operation =
  | SetStateOperation
  | CreateTaskOperation
  | RemoveCreatedOperation
  | EditDetailsOperation;

/** An edit for review: the action service binds it to the task's current revision (#365). */
export type EditDraft =
  | Omit<SetStateOperation, 'expected_revision'>
  | Omit<EditDetailsOperation, 'expected_revision'>;

export interface CompensatingProposal {
  proposalId: string;
  proposalRevision: number;
  operations: (
    | SetStateOperation
    | RemoveCreatedOperation
    | EditDetailsOperation
  )[];
}

/** removal_confirmed: the user confirmed a removal in the interface (every removal needs it). */
export type Authorization =
  | { kind: 'ui_control'; removal_confirmed?: true }
  | {
      kind: 'approved_proposal';
      proposal_id: string;
      proposal_revision: number;
      removal_confirmed?: true;
    }
  /** The user's own saved message that the action service resolved to one clear command. */
  | { kind: 'direct_command'; message_id: number };

/** Profile values a task draft was prepared against (the server reads them). */
export interface ProposalProfile {
  city: string | null;
  province: string | null;
  arrivalDate: string | null;
}

export interface ProposalContext {
  profile: ProposalProfile | null;
  /** Live tasks with the same title: shown, never merged. */
  sameTitleTasks: { taskRef: string; title: string }[];
}

interface ProposalBase {
  proposalId: string;
  proposalRevision: number;
  status: 'draft' | 'applied' | 'cancelled';
  reviewReason: 'edited' | 'context_changed' | 'restored' | null;
  source: { conversationId: string; messageId: number | null } | null;
  receipt: TaskReceipt | null;
}

/** A server-owned draft of one new task (#363). Approval binds to its revision. */
export interface TaskCreateProposal extends ProposalBase {
  kind: 'task_create';
  operation: CreateTaskOperation;
  context: ProposalContext | null;
  /** With reviewReason "context_changed": what the earlier revision was reviewed against. */
  previousContext: ProposalContext | null;
}

/** The values of one task an edit draft was prepared against (#365). */
export interface TaskSnapshot {
  taskRef: string;
  revision: number;
  removed: boolean;
  state: TaskState;
  waitingReason: string | null;
  /** A custom task's own values; for a published task only its shown title (or null). */
  title: string | null;
  description: string | null;
  priority: Priority | null;
}

/**
 * A server-owned draft of one change to an existing task (#365). Approval binds to its
 * revision and to the values of the fields it changes.
 */
export interface TaskEditProposal extends ProposalBase {
  kind: 'task_edit';
  operation: SetStateOperation | EditDetailsOperation;
  /** The values the change is from. */
  task: TaskSnapshot | null;
  /** With reviewReason "context_changed": the values the earlier revision was from. */
  previousTask: TaskSnapshot | null;
}

export type TaskProposal = TaskCreateProposal | TaskEditProposal;

/** Why a command was not clear enough to make a change (nothing was written). */
export type ClarifyReason =
  | 'missing_title'
  | 'multiple'
  | 'too_long'
  /** #365 edits */
  | 'missing_value'
  | 'invalid_value'
  | 'task_not_found'
  | 'task_ambiguous'
  | 'shared_task_field'
  | 'no_change'
  | 'tasks_unavailable'
  | 'value_too_long'
  | 'multiple_changes';

export type CommandResult =
  | {
      kind: 'create';
      operation: CreateTaskOperation;
      sameTitleTasks: { taskRef: string; title: string }[];
    }
  /** #365: exactly one change to exactly one named task, at its current revision. */
  | {
      kind: 'edit';
      operation: SetStateOperation | EditDetailsOperation;
      target: { taskRef: string; title: string };
    }
  | {
      kind: 'clarify';
      reason: ClarifyReason;
      candidates: { taskRef: string; title: string }[];
    }
  | { kind: 'none' };

export class ContractError extends Error {
  constructor(where: string) {
    super(`companion-actions contract: unexpected ${where}`);
    this.name = 'ContractError';
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (o: Json, k: string): string => {
  if (typeof o[k] !== 'string') throw new ContractError(k);
  return o[k] as string;
};
const strOrNull = (o: Json, k: string): string | null => {
  if (o[k] === null || o[k] === undefined) return null;
  return str(o, k);
};
const int = (o: Json, k: string): number => {
  if (typeof o[k] !== 'number' || !Number.isInteger(o[k])) {
    throw new ContractError(k);
  }
  return o[k] as number;
};
const bool = (o: Json, k: string): boolean => {
  if (typeof o[k] !== 'boolean') throw new ContractError(k);
  return o[k] as boolean;
};
const state = (o: Json, k: string): TaskState => {
  const v = o[k];
  if (
    typeof v !== 'string' ||
    !(TASK_STATES as readonly string[]).includes(v)
  ) {
    throw new ContractError(k);
  }
  return v as TaskState;
};

const OPERATION_TYPES: readonly OperationType[] = [
  'task.set_state',
  'task.create_custom',
  'task.remove_created',
  'task.edit_details',
];
const EDIT_FIELDS: readonly EditField[] = ['title', 'description', 'priority'];

function parseChanges(raw: unknown): FieldChange[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ContractError('receipt.changes');
  return raw.map(c => {
    if (
      !isObject(c) ||
      !(EDIT_FIELDS as readonly unknown[]).includes(c.field)
    ) {
      throw new ContractError('receipt.changes');
    }
    return {
      field: c.field as EditField,
      before: str(c, 'before'),
      after: str(c, 'after'),
    };
  });
}

export function parseReceipt(raw: unknown): TaskReceipt {
  if (!isObject(raw)) throw new ContractError('receipt');
  const kind =
    raw.kind === 'undo' ? 'undo' : raw.kind === 'change' ? 'change' : null;
  if (!kind) throw new ContractError('receipt.kind');
  // Absent in #361 replies: a state change.
  const operationType =
    raw.operation_type === undefined ? 'task.set_state' : raw.operation_type;
  if (!(OPERATION_TYPES as readonly unknown[]).includes(operationType)) {
    throw new ContractError('receipt.operation_type');
  }
  return {
    operationId: str(raw, 'operation_id'),
    createdAt: str(raw, 'created_at'),
    kind,
    operationType: operationType as OperationType,
    title: strOrNull(raw, 'title'),
    changes: parseChanges(raw.changes),
    undoOf: strOrNull(raw, 'undo_of'),
    taskRef: str(raw, 'task_ref'),
    beforeState: state(raw, 'before_state'),
    afterState: state(raw, 'after_state'),
    afterRevision: int(raw, 'after_revision'),
    undoneBy: strOrNull(raw, 'undone_by'),
    current: bool(raw, 'current'),
    undoable: bool(raw, 'undoable'),
  };
}

export function parseTask(raw: unknown): TaskProgress {
  if (!isObject(raw)) throw new ContractError('task');
  return {
    taskRef: str(raw, 'task_ref'),
    state: state(raw, 'state'),
    waitingReason: strOrNull(raw, 'waiting_reason'),
    revision: int(raw, 'revision'),
    removed: bool(raw, 'removed'),
    lastReceipt:
      raw.last_receipt === null || raw.last_receipt === undefined
        ? null
        : parseReceipt(raw.last_receipt),
  };
}

export function parseCurrent(raw: unknown): CurrentTaskValue {
  if (!isObject(raw)) throw new ContractError('current');
  return {
    taskRef: str(raw, 'task_ref'),
    state: state(raw, 'state'),
    waitingReason: strOrNull(raw, 'waiting_reason'),
    revision: int(raw, 'revision'),
    removed: bool(raw, 'removed'),
  };
}

export function parseEditOperation(raw: unknown): EditDetailsOperation {
  if (!isObject(raw) || raw.type !== 'task.edit_details') {
    throw new ContractError('edit operation');
  }
  const op: EditDetailsOperation = {
    type: 'task.edit_details',
    task_ref: str(raw, 'task_ref'),
    expected_revision: int(raw, 'expected_revision'),
  };
  if (raw.title !== undefined) op.title = str(raw, 'title');
  if (raw.description !== undefined) op.description = str(raw, 'description');
  if (raw.priority !== undefined) op.priority = priorityOf(raw, 'priority');
  return op;
}

export function parseOperation(
  raw: unknown
): SetStateOperation | RemoveCreatedOperation | EditDetailsOperation {
  if (isObject(raw) && raw.type === 'task.edit_details') {
    return parseEditOperation(raw);
  }
  if (isObject(raw) && raw.type === 'task.remove_created') {
    return {
      type: 'task.remove_created',
      task_ref: str(raw, 'task_ref'),
      expected_revision: int(raw, 'expected_revision'),
    };
  }
  if (!isObject(raw) || raw.type !== 'task.set_state') {
    throw new ContractError('operation');
  }
  const op: SetStateOperation = {
    type: 'task.set_state',
    task_ref: str(raw, 'task_ref'),
    state: state(raw, 'state'),
    expected_revision: int(raw, 'expected_revision'),
  };
  if (raw.waiting_reason !== undefined) {
    op.waiting_reason = str(raw, 'waiting_reason');
  }
  return op;
}

export function parseProposal(raw: unknown): CompensatingProposal {
  if (!isObject(raw) || !Array.isArray(raw.operations)) {
    throw new ContractError('proposal');
  }
  return {
    proposalId: str(raw, 'proposal_id'),
    proposalRevision: int(raw, 'proposal_revision'),
    operations: raw.operations.map(parseOperation),
  };
}

/** The exact operation an explicit state control sends. */
export function setStateOperation(
  task: Pick<TaskProgress, 'taskRef' | 'revision'>,
  next: TaskState,
  waitingReason?: string
): SetStateOperation {
  const op: SetStateOperation = {
    type: 'task.set_state',
    task_ref: task.taskRef,
    state: next,
    expected_revision: task.revision,
  };
  const reason = waitingReason?.trim();
  if (next === 'waiting' && reason) op.waiting_reason = reason;
  return op;
}

export const PRIORITIES: readonly Priority[] = [
  'Do now',
  'Do soon',
  'Explore and connect',
  'Optional / later',
];

function priorityOf(o: Json, k: string): Priority {
  const v = str(o, k);
  if (!(PRIORITIES as readonly string[]).includes(v)) {
    throw new ContractError(k);
  }
  return v as Priority;
}

export function parseCreateOperation(raw: unknown): CreateTaskOperation {
  if (!isObject(raw) || raw.type !== 'task.create_custom') {
    throw new ContractError('create operation');
  }
  const priority = str(raw, 'priority');
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    throw new ContractError('priority');
  }
  return {
    type: 'task.create_custom',
    title: str(raw, 'title'),
    priority: priority as Priority,
  };
}

const sameTitle = (raw: unknown) =>
  Array.isArray(raw)
    ? raw.map(t => {
        if (!isObject(t)) throw new ContractError('same_title_tasks');
        return { taskRef: str(t, 'task_ref'), title: str(t, 'title') };
      })
    : [];

function parseContext(raw: unknown): ProposalContext | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) throw new ContractError('context');
  const p = raw.profile;
  let profile: ProposalProfile | null = null;
  if (isObject(p)) {
    profile = {
      city: strOrNull(p, 'city'),
      province: strOrNull(p, 'province'),
      arrivalDate: strOrNull(p, 'arrival_date'),
    };
  } else if (p !== null && p !== undefined) {
    throw new ContractError('context.profile');
  }
  return { profile, sameTitleTasks: sameTitle(raw.same_title_tasks) };
}

const REVIEW_REASONS = ['edited', 'context_changed', 'restored'] as const;

function parseSnapshot(raw: unknown): TaskSnapshot | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) throw new ContractError('context.task');
  return {
    taskRef: str(raw, 'task_ref'),
    revision: int(raw, 'revision'),
    removed: bool(raw, 'removed'),
    state: state(raw, 'state'),
    waitingReason: strOrNull(raw, 'waiting_reason'),
    title: strOrNull(raw, 'title'),
    description: strOrNull(raw, 'description'),
    priority:
      raw.priority === null || raw.priority === undefined
        ? null
        : priorityOf(raw, 'priority'),
  };
}

export function parseTaskProposal(raw: unknown): TaskProposal {
  if (!isObject(raw) || !Array.isArray(raw.operations)) {
    throw new ContractError('proposal');
  }
  const status = raw.status;
  if (status !== 'draft' && status !== 'applied' && status !== 'cancelled') {
    throw new ContractError('proposal.status');
  }
  const reason = raw.review_reason ?? null;
  if (
    reason !== null &&
    !(REVIEW_REASONS as readonly unknown[]).includes(reason)
  ) {
    throw new ContractError('proposal.review_reason');
  }
  const source = isObject(raw.source)
    ? {
        conversationId: str(raw.source, 'conversation_id'),
        messageId:
          raw.source.message_id === undefined || raw.source.message_id === null
            ? null
            : int(raw.source, 'message_id'),
      }
    : null;
  const base: ProposalBase = {
    proposalId: str(raw, 'proposal_id'),
    proposalRevision: int(raw, 'proposal_revision'),
    status,
    reviewReason: reason as TaskProposal['reviewReason'],
    source,
    receipt:
      raw.receipt === null || raw.receipt === undefined
        ? null
        : parseReceipt(raw.receipt),
  };
  if (raw.kind === 'task_edit') {
    const op = raw.operations[0];
    return {
      ...base,
      kind: 'task_edit',
      operation: isObject(op) && op.type === 'task.edit_details'
        ? parseEditOperation(op)
        : (parseOperation(op) as SetStateOperation),
      task: parseSnapshot(isObject(raw.context) ? raw.context.task : null),
      previousTask: parseSnapshot(
        isObject(raw.previous_context) ? raw.previous_context.task : null
      ),
    };
  }
  return {
    ...base,
    kind: 'task_create',
    operation: parseCreateOperation(raw.operations[0]),
    context: parseContext(raw.context),
    previousContext: parseContext(raw.previous_context),
  };
}

const CLARIFY_REASONS: readonly ClarifyReason[] = [
  'missing_title',
  'multiple',
  'too_long',
  'missing_value',
  'invalid_value',
  'task_not_found',
  'task_ambiguous',
  'shared_task_field',
  'no_change',
  'tasks_unavailable',
  'value_too_long',
  'multiple_changes',
];

export function parseCommand(raw: unknown): CommandResult {
  if (!isObject(raw)) throw new ContractError('command');
  if (raw.kind === 'none') return { kind: 'none' };
  if (raw.kind === 'clarify') {
    const reason = raw.reason;
    if (!(CLARIFY_REASONS as readonly unknown[]).includes(reason)) {
      throw new ContractError('command.reason');
    }
    return {
      kind: 'clarify',
      reason: reason as ClarifyReason,
      candidates: Array.isArray(raw.candidates)
        ? raw.candidates.map(c => {
            if (!isObject(c)) throw new ContractError('command.candidates');
            return { taskRef: str(c, 'task_ref'), title: str(c, 'title') };
          })
        : [],
    };
  }
  if (raw.kind === 'edit') {
    const op = raw.operation;
    if (!isObject(raw.target)) throw new ContractError('command.target');
    return {
      kind: 'edit',
      operation:
        isObject(op) && op.type === 'task.edit_details'
          ? parseEditOperation(op)
          : (parseOperation(op) as SetStateOperation),
      target: {
        taskRef: str(raw.target, 'task_ref'),
        title: str(raw.target, 'title'),
      },
    };
  }
  if (raw.kind === 'create') {
    return {
      kind: 'create',
      operation: parseCreateOperation(raw.operation),
      sameTitleTasks: sameTitle(raw.same_title_tasks),
    };
  }
  throw new ContractError('command.kind');
}

/** The exact operation a reviewed task title is added with. */
export function createTaskOperation(title: string): CreateTaskOperation {
  return {
    type: 'task.create_custom',
    title: title.trim(),
    priority: 'Do soon',
  };
}

/**
 * The task an answer suggests (rag-query `actionProposal`), allowlisted fields only.
 * A suggestion is not authorization: the action service prepares the reviewable draft.
 */
export function parseSuggestedTask(
  raw: unknown
): { type: 'task.create_custom'; title: string } | null {
  if (!isObject(raw)) return null;
  if (raw.type !== 'task.create_custom' || raw.version !== 1) return null;
  if (typeof raw.title !== 'string') return null;
  const title = raw.title.trim();
  return title && title.length <= TITLE_MAX
    ? { type: 'task.create_custom', title }
    : null;
}

/** A change to one listed task the answer suggests (#365), allowlisted fields only. */
export interface SuggestedEdit {
  type: 'task.edit';
  taskRef: string;
  field: 'state' | 'waiting' | 'title' | 'description' | 'priority';
  value: string;
}

const SUGGESTED_FIELDS: readonly SuggestedEdit['field'][] = [
  'state',
  'waiting',
  'title',
  'description',
  'priority',
];

/**
 * The edit an answer suggests (rag-query `actionProposal`, #365). Not authorization:
 * the action service prepares the reviewable draft, and only the user approves it.
 */
export function parseSuggestedEdit(raw: unknown): SuggestedEdit | null {
  if (!isObject(raw) || raw.type !== 'task.edit' || raw.version !== 1)
    return null;
  if (typeof raw.task_ref !== 'string' || typeof raw.value !== 'string')
    return null;
  if (!(SUGGESTED_FIELDS as readonly unknown[]).includes(raw.field)) return null;
  const value = raw.value.trim();
  if (raw.field !== 'description' && !value) return null;
  return {
    type: 'task.edit',
    taskRef: raw.task_ref,
    field: raw.field as SuggestedEdit['field'],
    value,
  };
}

/** The edit draft a suggestion asks the action service to prepare, or null. */
export function editDraftOf(s: SuggestedEdit): EditDraft | null {
  if (s.field === 'state') {
    return (TASK_STATES as readonly string[]).includes(s.value)
      ? { type: 'task.set_state', task_ref: s.taskRef, state: s.value as TaskState }
      : null;
  }
  if (s.field === 'waiting') {
    return {
      type: 'task.set_state',
      task_ref: s.taskRef,
      state: 'waiting',
      waiting_reason: s.value.slice(0, WAITING_REASON_MAX),
    };
  }
  if (s.field === 'priority') {
    return (PRIORITIES as readonly string[]).includes(s.value)
      ? { type: 'task.edit_details', task_ref: s.taskRef, priority: s.value as Priority }
      : null;
  }
  return { type: 'task.edit_details', task_ref: s.taskRef, [s.field]: s.value };
}
