/**
 * Versioned client for the settlement plan actions (mobile-app#364). Mirror of the
 * web app's lib/companionActions/planClient.ts. Same rules as the task client:
 *   - a recorded result, or a definite refusal (nothing was written);
 *   - `unknown` when the request may have reached the server (network error,
 *     timeout, 5xx): the caller looks the operation up before any retry.
 * No method here calls the AI-generation quota or a model.
 */
import { TASK_ACTIONS_CONTRACT_VERSION } from './contract';
import type { Transport, TransportReply, Unavailable, Refused, Unknown, Unauthorized } from './client';
import {
  type PlanApplyReply,
  type PlanDraftItem,
  type PlanProposal,
  type PlanTaskNow,
  type PlanView,
  type SuggestedPlanItem,
  draftEditItems,
  parsePlanProposal,
  parsePlanReply,
  parsePlanTask,
  parsePlanView,
} from './planContract';

export type PlanProposalResult =
  | { kind: 'ok'; proposal: PlanProposal }
  /** The draft moved on (edited, approved, cancelled): this is its current state. */
  | { kind: 'changed'; proposal: PlanProposal }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type PlanApplyResult =
  | { kind: 'applied'; reply: PlanApplyReply }
  /** Relevant context changed since review: nothing was written. Review this revision. */
  | { kind: 'needs_review'; proposal: PlanProposal }
  /** Approved already by another tap: this is the saved draft and its receipt. */
  | { kind: 'changed'; proposal: PlanProposal }
  | { kind: 'in_flight' }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type PlanUndoResult =
  | { kind: 'applied'; reply: PlanApplyReply }
  | { kind: 'undo_conflict'; current: { taskRef: string; title: string | null; state: string }[]; proposal: PlanProposal }
  | { kind: 'already_undone' }
  | { kind: 'in_flight' }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type PlanStatusResult =
  | { kind: 'applied'; reply: PlanApplyReply }
  | { kind: 'pending' }
  | { kind: 'not_applied' }
  | { kind: 'lookup_failed' }
  | Unavailable
  | Unauthorized;

export type PlansResult =
  | { kind: 'ok'; plans: PlanView[]; drafts: PlanProposal[] }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type ConversationPlansResult =
  | { kind: 'ok'; proposals: PlanProposal[] }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export interface PlanClient {
  prepare(
    goal: string,
    items: SuggestedPlanItem[],
    source: { conversationId: string; messageId?: number } | null
  ): Promise<PlanProposalResult>;
  proposal(id: string): Promise<PlanProposalResult>;
  revise(id: string, revision: number, items: PlanDraftItem[]): Promise<PlanProposalResult>;
  cancel(id: string, revision: number): Promise<PlanProposalResult>;
  /** Approval of the displayed revision and its exact items. */
  apply(
    operationId: string,
    proposal: Pick<PlanProposal, 'id' | 'revision' | 'rawItems'>,
    options?: { removalConfirmed?: boolean }
  ): Promise<PlanApplyResult>;
  status(operationId: string): Promise<PlanStatusResult>;
  /** Retry of the failed additions of one plan receipt (their original identities). */
  retry(operationId: string, receiptOperationId: string): Promise<PlanApplyResult>;
  undo(
    operationId: string,
    receiptOperationId: string,
    options?: { removalConfirmed?: boolean }
  ): Promise<PlanUndoResult>;
  plans(): Promise<PlansResult>;
  conversationPlans(conversationId: string): Promise<ConversationPlansResult>;
}

type Json = Record<string, unknown>;
const asObject = (v: unknown): Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {};

function unavailable(reply: TransportReply): Unavailable | null {
  const error = asObject(reply.body).error;
  if (reply.status === 426) return { kind: 'unavailable', reason: 'unsupported_version' };
  if (reply.status === 403 && error === 'feature_disabled')
    return { kind: 'unavailable', reason: 'feature_disabled' };
  if (reply.status === 403 && error === 'platform_not_enabled')
    return { kind: 'unavailable', reason: 'platform_not_enabled' };
  if (reply.status === 503 && error === 'feature_unavailable')
    return { kind: 'unavailable', reason: 'service_unavailable' };
  return null;
}

function refused(reply: TransportReply): Refused {
  const body = asObject(reply.body);
  return {
    kind: 'refused',
    status: reply.status,
    error: typeof body.error === 'string' ? body.error : 'error',
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  };
}

const isUnknownStatus = (status: number) => status >= 500 || status === 408 || status === 0;

export function createPlanClient(opts: {
  transport: Transport;
  platform: 'ios' | 'android' | 'web';
  appVersion: string;
}): PlanClient {
  const envelope = () => ({
    contract_version: TASK_ACTIONS_CONTRACT_VERSION,
    client: { platform: opts.platform, app_version: opts.appVersion },
  });
  async function send(body: Json): Promise<TransportReply | null> {
    try {
      return await opts.transport({ ...envelope(), ...body });
    } catch {
      return null;
    }
  }

  async function proposalCall(body: Json): Promise<PlanProposalResult> {
    const reply = await send(body);
    if (!reply) return { kind: 'unknown' };
    if (reply.status === 401) return { kind: 'unauthorized' };
    const off = unavailable(reply);
    if (off) return off;
    const parsed = asObject(reply.body);
    if (reply.status === 200) return { kind: 'ok', proposal: parsePlanProposal(parsed.plan_proposal) };
    if (reply.status === 409 && parsed.error === 'proposal_changed')
      return { kind: 'changed', proposal: parsePlanProposal(parsed.plan_proposal) };
    return isUnknownStatus(reply.status) ? { kind: 'unknown' } : refused(reply);
  }

  async function writeCall(body: Json): Promise<PlanApplyResult> {
    const reply = await send(body);
    if (!reply) return { kind: 'unknown' };
    if (reply.status === 401) return { kind: 'unauthorized' };
    const off = unavailable(reply);
    if (off) return off;
    const parsed = asObject(reply.body);
    if (reply.status === 200) return { kind: 'applied', reply: parsePlanReply(parsed) };
    if (reply.status === 409 && parsed.error === 'needs_review')
      return { kind: 'needs_review', proposal: parsePlanProposal(parsed.plan_proposal) };
    if (reply.status === 409 && parsed.error === 'proposal_changed')
      return { kind: 'changed', proposal: parsePlanProposal(parsed.plan_proposal) };
    if (reply.status === 503 && parsed.error === 'operation_in_flight') return { kind: 'in_flight' };
    return isUnknownStatus(reply.status) ? { kind: 'unknown' } : refused(reply);
  }

  const client: PlanClient = {
    prepare(goal, items, source) {
      return proposalCall({
        action: 'plan_prepare',
        goal,
        items,
        ...(source
          ? {
              source: {
                conversation_id: source.conversationId,
                ...(source.messageId !== undefined ? { message_id: source.messageId } : {}),
              },
            }
          : {}),
      });
    },
    proposal: id => proposalCall({ action: 'plan_proposal', plan_proposal_id: id }),
    revise: (id, revision, items) =>
      proposalCall({ action: 'plan_revise', plan_proposal_id: id, proposal_revision: revision, items: draftEditItems(items) }),
    cancel: (id, revision) =>
      proposalCall({ action: 'plan_cancel', plan_proposal_id: id, proposal_revision: revision }),
    apply: (operationId, proposal, options = {}) =>
      writeCall({
        action: 'plan_apply',
        operation_id: operationId,
        authorization: {
          kind: 'approved_proposal',
          proposal_id: proposal.id,
          proposal_revision: proposal.revision,
          ...(options.removalConfirmed ? { removal_confirmed: true } : {}),
        },
        items: proposal.rawItems,
      }),
    retry: (operationId, receiptOperationId) =>
      writeCall({
        action: 'plan_retry',
        operation_id: operationId,
        receipt_operation_id: receiptOperationId,
        authorization: { kind: 'ui_control' },
      }),
    async undo(operationId, receiptOperationId, options = {}) {
      const reply = await send({
        action: 'plan_undo',
        operation_id: operationId,
        receipt_operation_id: receiptOperationId,
        authorization: options.removalConfirmed
          ? { kind: 'ui_control', removal_confirmed: true }
          : { kind: 'ui_control' },
      });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      const body = asObject(reply.body);
      if (reply.status === 200) return { kind: 'applied', reply: parsePlanReply(body) };
      if (reply.status === 409 && body.error === 'undo_conflict') {
        const current = Array.isArray(body.current)
          ? body.current.map(c => {
              const o = asObject(c);
              return {
                taskRef: String(o.task_ref ?? ''),
                title: typeof o.title === 'string' ? o.title : null,
                state: String(o.state ?? ''),
              };
            })
          : [];
        return { kind: 'undo_conflict', current, proposal: parsePlanProposal(body.plan_proposal) };
      }
      if (reply.status === 409 && body.error === 'already_undone') return { kind: 'already_undone' };
      if (reply.status === 503 && body.error === 'operation_in_flight') return { kind: 'in_flight' };
      return isUnknownStatus(reply.status) ? { kind: 'unknown' } : refused(reply);
    },
    async status(operationId) {
      const reply = await send({ action: 'plan_status', operation_id: operationId });
      if (!reply) return { kind: 'lookup_failed' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status !== 200) return { kind: 'lookup_failed' };
      const body = asObject(reply.body);
      if (body.status === 'applied' || body.status === 'partial')
        return { kind: 'applied', reply: parsePlanReply({ ...body, replayed: true }) };
      if (body.status === 'pending') return { kind: 'pending' };
      if (body.status === 'not_applied') return { kind: 'not_applied' };
      return { kind: 'lookup_failed' };
    },
    async plans() {
      const reply = await send({ action: 'plans' });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status !== 200) return isUnknownStatus(reply.status) ? { kind: 'unknown' } : refused(reply);
      const body = asObject(reply.body);
      if (!Array.isArray(body.plans) || !Array.isArray(body.drafts)) return { kind: 'unknown' };
      return { kind: 'ok', plans: body.plans.map(parsePlanView), drafts: body.drafts.map(parsePlanProposal) };
    },
    async conversationPlans(conversationId) {
      const reply = await send({ action: 'conversation_plans', conversation_id: conversationId });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status !== 200) return isUnknownStatus(reply.status) ? { kind: 'unknown' } : refused(reply);
      const body = asObject(reply.body);
      if (!Array.isArray(body.plan_proposals)) return { kind: 'unknown' };
      return { kind: 'ok', proposals: body.plan_proposals.map(parsePlanProposal) };
    },
  };

  // A reply that does not match the contract is never shown as a result: a write may
  // have committed, so it is an unknown outcome (or a failed lookup).
  const unknown = () => ({ kind: 'unknown' }) as const;
  return {
    prepare: (...a) => client.prepare(...a).catch(unknown),
    proposal: (...a) => client.proposal(...a).catch(unknown),
    revise: (...a) => client.revise(...a).catch(unknown),
    cancel: (...a) => client.cancel(...a).catch(unknown),
    apply: (...a) => client.apply(...a).catch(unknown),
    retry: (...a) => client.retry(...a).catch(unknown),
    undo: (...a) => client.undo(...a).catch(unknown),
    status: (...a) => client.status(...a).catch(() => ({ kind: 'lookup_failed' }) as const),
    plans: (...a) => client.plans(...a).catch(unknown),
    conversationPlans: (...a) => client.conversationPlans(...a).catch(unknown),
  };
}

/** Display title of a plan task: current custom title, the Checklist's title, or the label. */
export function planTaskTitle(task: PlanTaskNow, checklistTitle?: string | null): string | null {
  return task.title ?? checklistTitle ?? task.label ?? null;
}
