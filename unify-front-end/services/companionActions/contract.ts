/**
 * Client side of the Companion actions contract, version 1 (mobile-app#361, #363, #366).
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

export type OperationType =
  | 'task.set_state'
  | 'task.create_custom'
  | 'task.remove_created'
  | StepOperationType;

/** #366: one level of steps under one task. */
export type StepOperationType =
  | 'step.create'
  | 'step.update'
  | 'step.set_done'
  | 'step.remove'
  | 'step.restore'
  | 'step.remove_created';

/** Longest step text, and most steps one suggestion can add (#366). */
export const STEP_TITLE_MAX = 200;
export const STEP_SUGGESTION_MAX = 10;

/** A saved step of one task, as the action service reads it. */
export interface TaskStep {
  stepId: string;
  taskRef: string;
  title: string;
  done: boolean;
  position: number;
  revision: number;
}

/** One step as a receipt recorded it when it was saved (historical text). */
export interface ReceiptStep {
  stepId: string;
  /** The saved revision of this step, not its parent task. */
  afterRevision: number;
  title: string;
  /** The title before a rename; null otherwise. */
  beforeTitle: string | null;
  beforeDone: boolean;
  done: boolean;
  removed: boolean;
}

/** Durable record of one saved change. Historical once `current` is false. */
export interface TaskReceipt {
  operationId: string;
  createdAt: string;
  kind: 'change' | 'undo';
  /** What the receipt did: a state change, an added task (#363), or its removal by Undo. */
  operationType: OperationType;
  /** The current title of an added (or removed) task; null for a state change. */
  title: string | null;
  undoOf: string | null;
  taskRef: string;
  beforeState: TaskState;
  afterState: TaskState;
  afterRevision: number;
  undoneBy: string | null;
  /** The task is still at the revision this receipt produced. */
  current: boolean;
  undoable: boolean;
  /** #366: the steps a step receipt saved, with their text at that time; null otherwise. */
  steps: ReceiptStep[] | null;
  /** #366: a completion's step history: done of total when it was saved; null otherwise. */
  stepsDone: number | null;
  stepsTotal: number | null;
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

/** #366 step operations. A direct control adds exactly one step. */
export interface StepCreateOperation {
  type: 'step.create';
  task_ref: string;
  titles: string[];
}
export interface StepUpdateOperation {
  type: 'step.update';
  step_id: string;
  title: string;
  expected_revision: number;
}
export interface StepSetDoneOperation {
  type: 'step.set_done';
  step_id: string;
  done: boolean;
  expected_revision: number;
}
/** Every removal needs the user's confirmation (removal_confirmed). */
export interface StepRemoveOperation {
  type: 'step.remove';
  step_id: string;
  expected_revision: number;
}
export interface StepRestoreOperation {
  type: 'step.restore';
  step_id: string;
  expected_revision: number;
}
export interface StepRemoveCreatedOperation {
  type: 'step.remove_created';
  task_ref: string;
  steps: { step_id: string; expected_revision: number }[];
}
export type StepOperation =
  | StepCreateOperation
  | StepUpdateOperation
  | StepSetDoneOperation
  | StepRemoveOperation
  | StepRestoreOperation
  | StepRemoveCreatedOperation;

export type Operation =
  | SetStateOperation
  | CreateTaskOperation
  | RemoveCreatedOperation
  | StepOperation;

/** The reviewed change offered when an Undo meets a newer edit. */
export type CompensatingOperation =
  | SetStateOperation
  | RemoveCreatedOperation
  | Exclude<StepOperation, StepCreateOperation>;

export interface CompensatingProposal {
  proposalId: string;
  proposalRevision: number;
  operations: CompensatingOperation[];
}

/** An operation that removes something: it is sent only after the user confirmed. */
export const isRemoval = (op: Operation): boolean =>
  op.type === 'task.remove_created' ||
  op.type === 'step.remove' ||
  op.type === 'step.remove_created';

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

/** A server-owned draft of one new task (#363). Approval binds to its revision. */
export interface TaskProposal {
  proposalId: string;
  proposalRevision: number;
  status: 'draft' | 'applied' | 'cancelled';
  operation: CreateTaskOperation;
  context: ProposalContext | null;
  /** With reviewReason "context_changed": what the earlier revision was reviewed against. */
  previousContext: ProposalContext | null;
  reviewReason: 'edited' | 'context_changed' | 'restored' | null;
  source: { conversationId: string; messageId: number | null } | null;
  receipt: TaskReceipt | null;
}

export type CommandResult =
  | {
      kind: 'create';
      operation: CreateTaskOperation;
      sameTitleTasks: { taskRef: string; title: string }[];
    }
  | { kind: 'clarify'; reason: 'missing_title' | 'multiple' | 'too_long' }
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
  'step.create',
  'step.update',
  'step.set_done',
  'step.remove',
  'step.restore',
  'step.remove_created',
];

function parseReceiptSteps(raw: unknown): ReceiptStep[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new ContractError('receipt.steps');
  return raw.map(item => {
    if (!isObject(item)) throw new ContractError('receipt.steps');
    return {
      stepId: str(item, 'step_id'),
      afterRevision: int(item, 'after_revision'),
      title: str(item, 'title'),
      beforeTitle: strOrNull(item, 'before_title'),
      beforeDone: bool(item, 'before_done'),
      done: bool(item, 'done'),
      removed: item.removed === true,
    };
  });
}

const intOrNull = (o: Json, k: string): number | null =>
  o[k] === undefined || o[k] === null ? null : int(o, k);

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
    undoOf: strOrNull(raw, 'undo_of'),
    taskRef: str(raw, 'task_ref'),
    beforeState: state(raw, 'before_state'),
    afterState: state(raw, 'after_state'),
    afterRevision: int(raw, 'after_revision'),
    undoneBy: strOrNull(raw, 'undone_by'),
    current: bool(raw, 'current'),
    undoable: bool(raw, 'undoable'),
    steps: parseReceiptSteps(raw.steps),
    stepsDone: intOrNull(raw, 'steps_done'),
    stepsTotal: intOrNull(raw, 'steps_total'),
  };
}

export function parseStep(raw: unknown): TaskStep {
  if (!isObject(raw)) throw new ContractError('step');
  return {
    stepId: str(raw, 'step_id'),
    taskRef: str(raw, 'task_ref'),
    title: str(raw, 'title'),
    done: bool(raw, 'done'),
    position: int(raw, 'position'),
    revision: int(raw, 'revision'),
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

export function parseOperation(raw: unknown): CompensatingOperation {
  if (isObject(raw) && typeof raw.type === 'string' && raw.type.startsWith('step.')) {
    return parseStepOperation(raw) as CompensatingOperation;
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

function parseStepOperation(raw: Json): StepOperation {
  switch (raw.type) {
    case 'step.create':
      if (!Array.isArray(raw.titles) || raw.titles.some(t => typeof t !== 'string'))
        throw new ContractError('titles');
      return { type: 'step.create', task_ref: str(raw, 'task_ref'), titles: raw.titles as string[] };
    case 'step.update':
      return {
        type: 'step.update',
        step_id: str(raw, 'step_id'),
        title: str(raw, 'title'),
        expected_revision: int(raw, 'expected_revision'),
      };
    case 'step.set_done':
      return {
        type: 'step.set_done',
        step_id: str(raw, 'step_id'),
        done: bool(raw, 'done'),
        expected_revision: int(raw, 'expected_revision'),
      };
    case 'step.remove':
    case 'step.restore':
      return {
        type: raw.type,
        step_id: str(raw, 'step_id'),
        expected_revision: int(raw, 'expected_revision'),
      };
    case 'step.remove_created':
      if (!Array.isArray(raw.steps)) throw new ContractError('steps');
      return {
        type: 'step.remove_created',
        task_ref: str(raw, 'task_ref'),
        steps: raw.steps.map(s => {
          if (!isObject(s)) throw new ContractError('steps');
          return { step_id: str(s, 'step_id'), expected_revision: int(s, 'expected_revision') };
        }),
      };
    default:
      throw new ContractError('operation');
  }
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

const PRIORITIES: readonly Priority[] = [
  'Do now',
  'Do soon',
  'Explore and connect',
  'Optional / later',
];

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
  return {
    proposalId: str(raw, 'proposal_id'),
    proposalRevision: int(raw, 'proposal_revision'),
    status,
    operation: parseCreateOperation(raw.operations[0]),
    context: parseContext(raw.context),
    previousContext: parseContext(raw.previous_context),
    reviewReason: reason as TaskProposal['reviewReason'],
    source,
    receipt:
      raw.receipt === null || raw.receipt === undefined
        ? null
        : parseReceipt(raw.receipt),
  };
}

/** Suggested steps for one task (#366), a server-owned draft. Approval binds to its revision. */
export interface StepProposal {
  proposalId: string;
  proposalRevision: number;
  status: 'draft' | 'applied' | 'cancelled';
  operation: StepCreateOperation;
  /** Live steps of the task with one of the suggested titles (shown, never merged). */
  existingSteps: { stepId: string; title: string }[];
  reviewReason: 'edited' | 'context_changed' | 'restored' | null;
  source: { conversationId: string; messageId: number | null } | null;
  receipt: TaskReceipt | null;
}

export const isStepProposal = (p: TaskProposal | StepProposal): p is StepProposal =>
  'existingSteps' in p;

export function parseStepProposal(raw: unknown): StepProposal {
  if (!isObject(raw) || !Array.isArray(raw.operations) || raw.kind !== 'step_create') {
    throw new ContractError('step proposal');
  }
  const status = raw.status;
  if (status !== 'draft' && status !== 'applied' && status !== 'cancelled') {
    throw new ContractError('proposal.status');
  }
  const reason = raw.review_reason ?? null;
  if (reason !== null && !(REVIEW_REASONS as readonly unknown[]).includes(reason)) {
    throw new ContractError('proposal.review_reason');
  }
  const op = isObject(raw.operations[0]) ? parseStepOperation(raw.operations[0]) : null;
  if (!op || op.type !== 'step.create') throw new ContractError('step proposal operation');
  const context = isObject(raw.context) ? raw.context : {};
  const existing = Array.isArray(context.existing_steps) ? context.existing_steps : [];
  return {
    proposalId: str(raw, 'proposal_id'),
    proposalRevision: int(raw, 'proposal_revision'),
    status,
    operation: op,
    existingSteps: existing.map(e => {
      if (!isObject(e)) throw new ContractError('existing_steps');
      return { stepId: str(e, 'step_id'), title: str(e, 'title') };
    }),
    reviewReason: reason as StepProposal['reviewReason'],
    source: isObject(raw.source)
      ? {
          conversationId: str(raw.source, 'conversation_id'),
          messageId:
            raw.source.message_id === undefined || raw.source.message_id === null
              ? null
              : int(raw.source, 'message_id'),
        }
      : null,
    receipt: raw.receipt === null || raw.receipt === undefined ? null : parseReceipt(raw.receipt),
  };
}

/** The exact operations the explicit step controls send (#366). */
export const stepCreateOperation = (taskRef: string, title: string): StepCreateOperation => ({
  type: 'step.create',
  task_ref: taskRef,
  titles: [title.trim()],
});
export const stepUpdateOperation = (step: TaskStep, title: string): StepUpdateOperation => ({
  type: 'step.update',
  step_id: step.stepId,
  title: title.trim(),
  expected_revision: step.revision,
});
export const stepDoneOperation = (step: TaskStep, done: boolean): StepSetDoneOperation => ({
  type: 'step.set_done',
  step_id: step.stepId,
  done,
  expected_revision: step.revision,
});
export const stepRemoveOperation = (step: TaskStep): StepRemoveOperation => ({
  type: 'step.remove',
  step_id: step.stepId,
  expected_revision: step.revision,
});

/**
 * Steps an answer suggests (rag-query `actionProposal`, #366), allowlisted fields only.
 * A suggestion is not authorization: the action service prepares the reviewable draft.
 */
export function parseSuggestedSteps(
  raw: unknown
): { type: 'step.create'; taskRef: string; titles: string[] } | null {
  if (!isObject(raw) || raw.type !== 'step.create' || raw.version !== 1) return null;
  if (typeof raw.task_ref !== 'string' || !/^(sanity|custom):/.test(raw.task_ref)) return null;
  if (!Array.isArray(raw.titles) || raw.titles.length < 1 || raw.titles.length > STEP_SUGGESTION_MAX)
    return null;
  const titles: string[] = [];
  for (const t of raw.titles) {
    if (typeof t !== 'string') return null;
    const title = t.trim();
    if (!title || title.length > STEP_TITLE_MAX) return null;
    titles.push(title);
  }
  return { type: 'step.create', taskRef: raw.task_ref, titles };
}

export function parseCommand(raw: unknown): CommandResult {
  if (!isObject(raw)) throw new ContractError('command');
  if (raw.kind === 'none') return { kind: 'none' };
  if (raw.kind === 'clarify') {
    const reason = raw.reason;
    if (
      reason !== 'missing_title' &&
      reason !== 'multiple' &&
      reason !== 'too_long'
    ) {
      throw new ContractError('command.reason');
    }
    return { kind: 'clarify', reason };
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
