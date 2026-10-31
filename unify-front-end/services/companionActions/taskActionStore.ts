/**
 * Save, lookup and Undo flow for one task's explicit controls (mobile-app#361), and
 * for an added task from an approved draft or a clear command (#363).
 * Framework-free so mobile and web share the same rules (mirror of the web app's
 * lib/companionActions/taskActionStore.ts):
 *   - one operation identity per user intent, reused for every retry and lookup;
 *   - an outcome that may hide a committed write is looked up, never retried blind;
 *   - "pending" and "lookup failed" stay visibly unresolved and allow only another lookup;
 *   - "not applied" allows a retry with the same identity; the server re-checks it;
 *   - Undo names one receipt; a conflict keeps the newer edit and offers a reviewed change.
 * State lives per account and per task, outside any panel, so closing a panel does not
 * cancel or forget a write. Sign-out or an account change drops it (clearTaskActionStores).
 */
import type {
  ApplyResult,
  StatusResult,
  TaskActionClient,
  UndoResult,
} from './client';
import type { ProfileProposal } from './profile';
import {
  isRemoval,
  verifiedCompensationDetail,
  type Authorization,
  type CompensatingProposal,
  type CurrentDetailValue,
  type CurrentTaskValue,
  type DetailProposal,
  type Operation,
  type OperationType,
  type RemovalProposal,
  type SetStateOperation,
  type StepProposal,
  type TaskProposal,
  type TaskReceipt,
  type TaskState,
} from './contract';

export interface PendingWrite {
  operationId: string;
  kind: 'apply' | 'undo';
  operation?: Operation;
  authorization?: Authorization;
  receiptOperationId?: string;
  /** Undo of an added task: the user confirmed its removal (#363). */
  removalConfirmed?: boolean;
  /** The reviewed compensating change of a conflicting Undo. */
  compensation?: boolean;
}

export type TaskActionPhase =
  | { phase: 'profile_review'; proposal: ProfileProposal }
  | { phase: 'idle' }
  | { phase: 'saving'; write: PendingWrite }
  | { phase: 'saved'; receipt: TaskReceipt }
  | { phase: 'refused'; reason: string }
  | { phase: 'conflict' }
  | { phase: 'checking'; write: PendingWrite }
  | { phase: 'pending'; write: PendingWrite }
  | { phase: 'lookup_failed'; write: PendingWrite }
  | { phase: 'not_applied'; write: PendingWrite }
  | {
      phase: 'undo_review';
      receiptOperationId: string;
      current: CurrentTaskValue | null;
      /** #370: the detail the reviewed change acts on, as the service read it. */
      currentDetail: CurrentDetailValue | null;
      proposal: CompensatingProposal;
    }
  | { phase: 'already_undone' }
  /** #367: Undo of a removal changed nothing: the task is back already, or removed again later. */
  | { phase: 'undo_blocked'; reason: 'not_removed' | 'removed_again' }
  /** #363: the draft's relevant context changed; nothing was written. Review this revision. */
  | {
      phase: 'needs_review';
      proposal: TaskProposal | StepProposal | DetailProposal | RemovalProposal;
    }
  /** #370: a live saved detail already says this; nothing was written. */
  | { phase: 'detail_exists' }
  /** #363: this command already added its task, or a task with that title exists. */
  | { phase: 'command_used' }
  | { phase: 'needs_clarification' }
  | { phase: 'unavailable' }
  | { phase: 'signed_out' };

/** Allowlisted, content-free result for analytics. */
export interface TaskActionResultEvent {
  action:
    | 'set_state'
    | 'undo'
    | 'approve_compensation'
    | 'lookup'
    /** #363: an added task, from an approved draft or a clear command. */
    | 'approve_create'
    | 'command_create'
    /** #365: a change to an existing task, from an approved draft or a clear command. */
    | 'approve_edit'
    | 'command_edit'
    /** #366: a step control (add, edit, check, remove) or approved suggested steps. */
    | 'step_change'
    | 'approve_steps'
    /** #370: a saved-detail control (edit, remove), an approved draft or a remember command. */
    | 'detail_change'
    | 'approve_detail'
    | 'command_detail'
    /** #367: an approved removal review. */
    | 'approve_removal'
    | 'reminder_change';
  outcome:
    | 'applied'
    | 'replayed'
    | 'conflict'
    | 'undo_conflict'
    | 'already_undone'
    | 'refused'
    | 'unknown'
    | 'pending'
    | 'not_applied'
    | 'lookup_failed'
    | 'unavailable'
    | 'needs_review'
    | 'undo_blocked';
  toState?: TaskState;
  /** The registered operation type; never content. */
  operationType?: OperationType;
}

export interface TaskActionStoreDeps {
  client: TaskActionClient;
  newOperationId: () => string;
  /** Called after anything that may have changed saved progress: re-read it. */
  onChanged: () => void;
  onResult?: (event: TaskActionResultEvent) => void;
}

type Listener = () => void;
const IDLE: TaskActionPhase = { phase: 'idle' };
const UNRESOLVED = new Set([
  'saving',
  'checking',
  'pending',
  'lookup_failed',
  'not_applied',
]);

export function isUnresolved(p: TaskActionPhase): boolean {
  return UNRESOLVED.has(p.phase);
}

export class TaskActionStore {
  private phases = new Map<string, TaskActionPhase>();
  private drafts = new Map<string, string>();
  /** #367: a removal review asked for from outside the task panel (a card or a Checklist control). */
  private removalRequests = new Map<string, string | null>();
  private listeners = new Set<Listener>();

  constructor(private deps: TaskActionStoreDeps) {}

  /** Swap the transport-level dependencies without losing unresolved writes. */
  setDeps(deps: TaskActionStoreDeps) {
    this.deps = deps;
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(taskRef: string): TaskActionPhase {
    return this.phases.get(taskRef) ?? IDLE;
  }

  /** Unsaved waiting-reason text. Kept outside the panel so close, reopen and resize keep it. */
  draft(taskRef: string): string | undefined {
    return this.drafts.get(taskRef);
  }

  setDraft(taskRef: string, text: string | undefined) {
    if (text === undefined) this.drafts.delete(taskRef);
    else this.drafts.set(taskRef, text);
    for (const l of this.listeners) l();
  }

  /**
   * #367: ask the task panel of `taskRef` to open its removal review, on the review a
   * removal request in a conversation prepared (`proposalId`) or on a new one. Sends nothing.
   */
  requestRemoval(taskRef: string, proposalId: string | null = null) {
    this.removalRequests.set(taskRef, proposalId);
    for (const l of this.listeners) l();
  }

  /** The panel takes the request once: undefined when there is none. */
  takeRemovalRequest(taskRef: string): string | null | undefined {
    if (!this.removalRequests.has(taskRef)) return undefined;
    const proposalId = this.removalRequests.get(taskRef) ?? null;
    this.removalRequests.delete(taskRef);
    return proposalId;
  }

  hasRemovalRequest(taskRef: string): boolean {
    return this.removalRequests.has(taskRef);
  }

  private set(taskRef: string, phase: TaskActionPhase) {
    this.phases.set(taskRef, phase);
    for (const l of this.listeners) l();
  }

  /** Clear a finished message (saved, refused, conflict). Never clears an unresolved write. */
  dismiss(taskRef: string) {
    if (!isUnresolved(this.get(taskRef))) this.set(taskRef, IDLE);
  }

  setState(operation: SetStateOperation) {
    if (isUnresolved(this.get(operation.task_ref))) return Promise.resolve();
    return this.run(operation.task_ref, {
      operationId: this.deps.newOperationId(),
      kind: 'apply',
      operation,
    });
  }

  /**
   * One user intent on any registered operation (#363: an approved draft or a clear
   * command). `key` names where its state is shown: a task ref, `proposal:<id>` or
   * `command:<message id>`.
   */
  applyOperation(
    key: string,
    operation: Operation,
    authorization: Authorization
  ) {
    if (isUnresolved(this.get(key))) return Promise.resolve();
    return this.run(key, {
      operationId: this.deps.newOperationId(),
      kind: 'apply',
      operation,
      authorization,
    });
  }

  /** Undo of one receipt. An added task's Undo removes it: only after the user confirmed. */
  undo(
    taskRef: string,
    receiptOperationId: string,
    options: { removalConfirmed?: boolean } = {}
  ) {
    if (isUnresolved(this.get(taskRef))) return Promise.resolve();
    return this.run(taskRef, {
      operationId: this.deps.newOperationId(),
      kind: 'undo',
      receiptOperationId,
      removalConfirmed: options.removalConfirmed === true,
    });
  }

  /** Approve the reviewed compensating change of a conflicting Undo. */
  approveCompensation(
    taskRef: string,
    options: { removalConfirmed?: boolean } = {}
  ) {
    const p = this.get(taskRef);
    if (p.phase !== 'undo_review') return Promise.resolve();
    const op = p.proposal.operations[0];
    // A removal needs the user's explicit confirmation; without it nothing is sent.
    if (isRemoval(op) && options.removalConfirmed !== true)
      return Promise.resolve();
    // #370: a detail change is approved only for the current detail the service named.
    if (
      op.type.startsWith('detail.') &&
      !verifiedCompensationDetail(op, p.currentDetail)
    )
      return Promise.resolve();
    return this.run(taskRef, {
      operationId: this.deps.newOperationId(),
      kind: 'apply',
      operation: op,
      compensation: true,
      authorization: {
        kind: 'approved_proposal',
        proposal_id: p.proposal.proposalId,
        proposal_revision: p.proposal.proposalRevision,
        ...(isRemoval(op) ? { removal_confirmed: true as const } : {}),
      },
    });
  }

  /** Same identity, same payload. Allowed only after a confirmed "not applied". */
  retry(taskRef: string) {
    const p = this.get(taskRef);
    if (p.phase !== 'not_applied') return Promise.resolve();
    return this.run(taskRef, p.write);
  }

  /**
   * Drops a confirmed-not-applied write after the user saved a changed draft (#363):
   * the saved edit is a new revision, so the earlier approval can no longer apply and
   * the new title needs its own approval. An unknown outcome is never dropped.
   */
  supersedeNotApplied(taskRef: string) {
    if (this.get(taskRef).phase === 'not_applied') this.set(taskRef, IDLE);
  }

  checkAgain(taskRef: string) {
    const p = this.get(taskRef);
    if (p.phase !== 'pending' && p.phase !== 'lookup_failed')
      return Promise.resolve();
    return this.lookup(taskRef, p.write);
  }

  /** Keys with a shown state that start with `prefix` (#370: receipts of removed details). */
  keysWith(prefix: string): string[] {
    return [...this.phases.entries()]
      .filter(
        ([key, phase]) => key.startsWith(prefix) && phase.phase !== 'idle'
      )
      .map(([key]) => key);
  }

  private actionOf(write: PendingWrite): TaskActionResultEvent['action'] {
    if (write.kind === 'undo') return 'undo';
    if (write.operation?.type.startsWith('reminder.')) return 'reminder_change';
    if (write.operation?.type.startsWith('detail.'))
      return write.authorization?.kind === 'direct_command'
        ? 'command_detail'
        : write.operation.type === 'detail.create'
          ? 'approve_detail'
          : 'detail_change';
    if (write.operation?.type.startsWith('step.'))
      return write.operation.type === 'step.create' &&
        write.authorization?.kind === 'approved_proposal'
        ? 'approve_steps'
        : 'step_change';
    if (write.operation?.type === 'task.remove') return 'approve_removal';
    if (write.operation?.type === 'task.create_custom')
      return write.authorization?.kind === 'direct_command'
        ? 'command_create'
        : 'approve_create';
    // #365: a change an approved edit draft or a clear command authorized. A compensating
    // change of an Undo is a reviewed proposal too, but keeps its own action.
    if (write.authorization?.kind === 'direct_command') return 'command_edit';
    if (
      write.authorization?.kind === 'approved_proposal' &&
      write.authorization.proposal_id &&
      !write.compensation
    )
      return 'approve_edit';
    return write.authorization?.kind === 'approved_proposal'
      ? 'approve_compensation'
      : 'set_state';
  }

  private async run(taskRef: string, write: PendingWrite) {
    this.set(taskRef, { phase: 'saving', write });
    const action = this.actionOf(write);
    // Every request of one operation, its lookup included, goes through the
    // client it started with, so it stays bound to that client's account.
    const { client } = this.deps;
    const result: ApplyResult | UndoResult =
      write.kind === 'undo'
        ? await client.undo(write.operationId, write.receiptOperationId!, {
            removalConfirmed: write.removalConfirmed,
          })
        : await client.apply(
            write.operationId,
            write.operation!,
            write.authorization
          );
    const report = (outcome: TaskActionResultEvent['outcome']) =>
      this.deps.onResult?.({
        action,
        outcome,
        toState:
          write.operation?.type === 'task.set_state'
            ? write.operation.state
            : undefined,
        operationType: write.operation?.type,
      });

    switch (result.kind) {
      case 'profile_review':
        this.set(taskRef, { phase: 'profile_review', proposal: result.proposal });
        report('needs_review');
        this.deps.onChanged();
        return;
      case 'applied':
        this.set(taskRef, { phase: 'saved', receipt: result.receipt });
        report(result.replayed ? 'replayed' : 'applied');
        this.deps.onChanged();
        return;
      case 'conflict':
        this.set(taskRef, { phase: 'conflict' });
        report('conflict');
        this.deps.onChanged();
        return;
      case 'undo_conflict':
        this.set(taskRef, {
          phase: 'undo_review',
          receiptOperationId: write.receiptOperationId!,
          current:
            result.current.find(c => c.taskRef === taskRef) ??
            result.current[0] ??
            null,
          currentDetail: result.currentDetail,
          proposal: result.proposal,
        });
        report('undo_conflict');
        this.deps.onChanged();
        return;
      case 'already_undone':
        this.set(taskRef, { phase: 'already_undone' });
        report('already_undone');
        this.deps.onChanged();
        return;
      case 'undo_blocked':
        this.set(taskRef, { phase: 'undo_blocked', reason: result.reason });
        report('undo_blocked');
        this.deps.onChanged();
        return;
      case 'needs_review':
        this.set(taskRef, { phase: 'needs_review', proposal: result.proposal });
        report('needs_review');
        this.deps.onChanged();
        return;
      case 'command_used':
        this.set(taskRef, { phase: 'command_used' });
        report('refused');
        this.deps.onChanged();
        return;
      case 'needs_clarification':
        this.set(taskRef, { phase: 'needs_clarification' });
        report('refused');
        return;
      case 'detail_exists':
        this.set(taskRef, { phase: 'detail_exists' });
        report('refused');
        this.deps.onChanged();
        return;
      case 'unknown':
      case 'in_flight':
        report('unknown');
        await this.lookup(taskRef, write, client);
        return;
      case 'unavailable':
        this.set(taskRef, { phase: 'unavailable' });
        report('unavailable');
        return;
      case 'unauthorized':
        this.set(taskRef, { phase: 'signed_out' });
        report('refused');
        return;
      case 'refused':
        this.set(taskRef, {
          phase: 'refused',
          reason: result.reason ?? result.error,
        });
        report('refused');
        this.deps.onChanged();
        return;
    }
  }

  private async lookup(
    taskRef: string,
    write: PendingWrite,
    client = this.deps.client
  ) {
    this.set(taskRef, { phase: 'checking', write });
    const result: StatusResult = await client.status(write.operationId);
    const report = (outcome: TaskActionResultEvent['outcome']) =>
      this.deps.onResult?.({ action: 'lookup', outcome });
    switch (result.kind) {
      case 'applied':
        this.set(taskRef, { phase: 'saved', receipt: result.receipt });
        report('applied');
        this.deps.onChanged();
        return;
      case 'pending':
        this.set(taskRef, { phase: 'pending', write });
        report('pending');
        return;
      case 'not_applied':
        this.set(taskRef, { phase: 'not_applied', write });
        report('not_applied');
        this.deps.onChanged();
        return;
      case 'lookup_failed':
        this.set(taskRef, { phase: 'lookup_failed', write });
        report('lookup_failed');
        return;
      case 'unavailable':
        // The gate closed after the write was sent: the outcome is still unknown.
        this.set(taskRef, { phase: 'lookup_failed', write });
        report('unavailable');
        return;
      case 'unauthorized':
        this.set(taskRef, { phase: 'signed_out' });
        report('lookup_failed');
        return;
    }
  }
}

const stores = new Map<
  string,
  { sessionEpoch: number; store: TaskActionStore }
>();

/** A new account session replaces its private drafts, requests and results. */
export function taskActionStoreFor(
  accountId: string,
  deps: TaskActionStoreDeps & { sessionEpoch: number }
): TaskActionStore {
  let entry = stores.get(accountId);
  if (!entry || entry.sessionEpoch !== deps.sessionEpoch) {
    entry = { sessionEpoch: deps.sessionEpoch, store: new TaskActionStore(deps) };
    stores.set(accountId, entry);
  } else {
    entry.store.setDeps(deps);
  }
  return entry.store;
}

/** Drop every account's unresolved writes and messages except `keepAccountId`. */
export function clearTaskActionStores(keepAccountId?: string | null) {
  for (const id of [...stores.keys()]) {
    if (id !== keepAccountId) stores.delete(id);
  }
}
