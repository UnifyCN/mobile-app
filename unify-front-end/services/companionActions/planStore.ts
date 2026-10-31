/**
 * Approve, lookup, retry and Undo flow of settlement plans (mobile-app#364).
 * Framework-free so mobile and web share the same rules (mirror of the web app's
 * lib/companionActions/planStore.ts), the same as the task store:
 *   - one operation identity per user intent, reused for every retry and lookup;
 *   - an outcome that may hide a committed write is looked up, never retried blind;
 *   - "pending" and "lookup failed" stay visibly unresolved and allow only a lookup;
 *   - "not applied" allows a retry with the same identity; the server re-checks it;
 *   - Undo names one plan receipt; a conflict keeps newer edits and offers a reviewed change.
 * State lives per account and per key (`plan-proposal:<id>` for an approval,
 * `plan-receipt:<operation id>` for its retry and Undo), outside any panel, so closing
 * a panel neither cancels nor forgets a write. Sign-out or account change drops it.
 */
import type { PlanApplyResult, PlanClient, PlanStatusResult, PlanUndoResult } from './planClient';
import type { PlanApplyReply, PlanProposal } from './planContract';

export interface PlanWrite {
  operationId: string;
  kind: 'apply' | 'retry' | 'undo';
  proposal?: Pick<PlanProposal, 'id' | 'revision' | 'rawItems'>;
  receiptOperationId?: string;
  removalConfirmed?: boolean;
}

export type PlanPhase =
  | { phase: 'idle' }
  | { phase: 'saving'; write: PlanWrite }
  | { phase: 'saved'; reply: PlanApplyReply }
  | { phase: 'refused'; reason: string }
  | { phase: 'checking'; write: PlanWrite }
  | { phase: 'pending'; write: PlanWrite }
  | { phase: 'lookup_failed'; write: PlanWrite }
  | { phase: 'not_applied'; write: PlanWrite }
  /** Relevant context changed (or the draft was approved elsewhere): nothing was written. */
  | { phase: 'needs_review'; proposal: PlanProposal }
  | { phase: 'changed'; proposal: PlanProposal }
  | {
      phase: 'undo_review';
      current: { taskRef: string; title: string | null; state: string }[];
      proposal: PlanProposal;
    }
  | { phase: 'already_undone' }
  | { phase: 'unavailable' }
  | { phase: 'signed_out' };

/** Allowlisted, content-free result for analytics. */
export interface PlanResultEvent {
  action: 'approve_plan' | 'retry_plan' | 'undo_plan' | 'approve_plan_compensation' | 'lookup';
  outcome:
    | 'applied'
    | 'partial'
    | 'replayed'
    | 'needs_review'
    | 'undo_conflict'
    | 'already_undone'
    | 'refused'
    | 'unknown'
    | 'pending'
    | 'not_applied'
    | 'lookup_failed'
    | 'unavailable';
  changeCount?: number;
}

export interface PlanStoreDeps {
  client: PlanClient;
  newOperationId: () => string;
  /** Called after anything that may have changed saved plans or tasks: re-read them. */
  onChanged: () => void;
  onResult?: (event: PlanResultEvent) => void;
}

type Listener = () => void;
const IDLE: PlanPhase = { phase: 'idle' };
const UNRESOLVED = new Set(['saving', 'checking', 'pending', 'lookup_failed', 'not_applied']);

export const isPlanUnresolved = (p: PlanPhase) => UNRESOLVED.has(p.phase);
export const proposalKey = (id: string) => `plan-proposal:${id}`;
export const receiptKey = (operationId: string) => `plan-receipt:${operationId}`;

export class PlanStore {
  private phases = new Map<string, PlanPhase>();
  private listeners = new Set<Listener>();

  constructor(private deps: PlanStoreDeps) {}

  setDeps(deps: PlanStoreDeps) {
    this.deps = deps;
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(key: string): PlanPhase {
    return this.phases.get(key) ?? IDLE;
  }

  private set(key: string, phase: PlanPhase) {
    this.phases.set(key, phase);
    for (const l of this.listeners) l();
  }

  dismiss(key: string) {
    if (!isPlanUnresolved(this.get(key))) this.set(key, IDLE);
  }

  /** Approval of the displayed draft revision (or of a reviewed compensating change). */
  approve(proposal: PlanProposal, options: { removalConfirmed?: boolean } = {}) {
    const key = proposalKey(proposal.id);
    if (isPlanUnresolved(this.get(key))) return Promise.resolve();
    // A removal needs the user's explicit confirmation; without it nothing is sent.
    if (proposal.kind === 'undo' && proposal.changeCount > 0 && options.removalConfirmed !== true)
      return Promise.resolve();
    return this.run(key, {
      operationId: this.deps.newOperationId(),
      kind: 'apply',
      proposal: { id: proposal.id, revision: proposal.revision, rawItems: proposal.rawItems },
      removalConfirmed: options.removalConfirmed === true,
    });
  }

  /** Retry of the failed additions of one plan receipt. */
  retryFailed(receiptOperationId: string) {
    const key = receiptKey(receiptOperationId);
    if (isPlanUnresolved(this.get(key))) return Promise.resolve();
    return this.run(key, { operationId: this.deps.newOperationId(), kind: 'retry', receiptOperationId });
  }

  /** Undo of one plan receipt. Removing the tasks it added needs the user's confirmation. */
  undo(receiptOperationId: string, options: { removalConfirmed?: boolean } = {}) {
    const key = receiptKey(receiptOperationId);
    if (isPlanUnresolved(this.get(key))) return Promise.resolve();
    return this.run(key, {
      operationId: this.deps.newOperationId(),
      kind: 'undo',
      receiptOperationId,
      removalConfirmed: options.removalConfirmed === true,
    });
  }

  /** Same identity, same payload. Allowed only after a confirmed "not applied". */
  retrySame(key: string) {
    const p = this.get(key);
    if (p.phase !== 'not_applied') return Promise.resolve();
    return this.run(key, p.write);
  }

  /** A saved draft edit is a new revision: an earlier not-applied approval can no longer apply. */
  supersedeNotApplied(key: string) {
    if (this.get(key).phase === 'not_applied') this.set(key, IDLE);
  }

  checkAgain(key: string) {
    const p = this.get(key);
    if (p.phase !== 'pending' && p.phase !== 'lookup_failed') return Promise.resolve();
    return this.lookup(key, p.write);
  }

  private actionOf(write: PlanWrite): PlanResultEvent['action'] {
    if (write.kind === 'retry') return 'retry_plan';
    if (write.kind === 'undo') return 'undo_plan';
    return write.removalConfirmed ? 'approve_plan_compensation' : 'approve_plan';
  }

  private async run(key: string, write: PlanWrite) {
    this.set(key, { phase: 'saving', write });
    const action = this.actionOf(write);
    // Every request of one operation, its lookup included, goes through the client it
    // started with, so it stays bound to that client's account and session.
    const { client } = this.deps;
    const result: PlanApplyResult | PlanUndoResult =
      write.kind === 'undo'
        ? await client.undo(write.operationId, write.receiptOperationId!, {
            removalConfirmed: write.removalConfirmed,
          })
        : write.kind === 'retry'
          ? await client.retry(write.operationId, write.receiptOperationId!)
          : await client.apply(write.operationId, write.proposal!, {
              removalConfirmed: write.removalConfirmed,
            });
    const report = (outcome: PlanResultEvent['outcome'], changeCount?: number) =>
      this.deps.onResult?.({ action, outcome, ...(changeCount === undefined ? {} : { changeCount }) });

    switch (result.kind) {
      case 'applied':
        this.set(key, { phase: 'saved', reply: result.reply });
        report(
          result.reply.replayed ? 'replayed' : result.reply.status === 'partial' ? 'partial' : 'applied',
          result.reply.receipt.results.filter(r => r.outcome === 'created' || r.outcome === 'removed').length
        );
        this.deps.onChanged();
        return;
      case 'needs_review':
        this.set(key, { phase: 'needs_review', proposal: result.proposal });
        report('needs_review');
        this.deps.onChanged();
        return;
      case 'changed':
        this.set(key, { phase: 'changed', proposal: result.proposal });
        report('refused');
        this.deps.onChanged();
        return;
      case 'undo_conflict':
        this.set(key, { phase: 'undo_review', current: result.current, proposal: result.proposal });
        report('undo_conflict');
        this.deps.onChanged();
        return;
      case 'already_undone':
        this.set(key, { phase: 'already_undone' });
        report('already_undone');
        this.deps.onChanged();
        return;
      case 'unknown':
      case 'in_flight':
        report('unknown');
        await this.lookup(key, write, client);
        return;
      case 'unavailable':
        this.set(key, { phase: 'unavailable' });
        report('unavailable');
        return;
      case 'unauthorized':
        this.set(key, { phase: 'signed_out' });
        report('refused');
        return;
      case 'refused':
        this.set(key, { phase: 'refused', reason: result.reason ?? result.error });
        report('refused');
        this.deps.onChanged();
        return;
    }
  }

  private async lookup(key: string, write: PlanWrite, client = this.deps.client) {
    this.set(key, { phase: 'checking', write });
    const result: PlanStatusResult = await client.status(write.operationId);
    const report = (outcome: PlanResultEvent['outcome']) => this.deps.onResult?.({ action: 'lookup', outcome });
    switch (result.kind) {
      case 'applied':
        this.set(key, { phase: 'saved', reply: result.reply });
        report(result.reply.status === 'partial' ? 'partial' : 'applied');
        this.deps.onChanged();
        return;
      case 'pending':
        this.set(key, { phase: 'pending', write });
        report('pending');
        return;
      case 'not_applied':
        this.set(key, { phase: 'not_applied', write });
        report('not_applied');
        this.deps.onChanged();
        return;
      case 'lookup_failed':
      case 'unavailable':
        // The gate may have closed after the write was sent: the outcome is still unknown.
        this.set(key, { phase: 'lookup_failed', write });
        report('lookup_failed');
        return;
      case 'unauthorized':
        this.set(key, { phase: 'signed_out' });
        report('lookup_failed');
        return;
    }
  }
}

const stores = new Map<string, PlanStore>();

/** The plan store of one signed-in account. Another account never sees it. */
export function planStoreFor(accountId: string, deps: PlanStoreDeps): PlanStore {
  let store = stores.get(accountId);
  if (!store) {
    store = new PlanStore(deps);
    stores.set(accountId, store);
  } else {
    store.setDeps(deps);
  }
  return store;
}

/** Drop every account's unresolved plan writes and messages except `keepAccountId`. */
export function clearPlanStores(keepAccountId?: string | null) {
  for (const id of [...stores.keys()]) {
    if (id !== keepAccountId) stores.delete(id);
  }
}
