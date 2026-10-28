/**
 * Versioned client for the Companion task actions endpoint (mobile-app#361, #363, #365, #366).
 * Mirror of the web app's lib/companionActions/client.ts.
 * Each call names an outcome the interface can show truthfully:
 *   - a recorded result, or a definite refusal (nothing was written);
 *   - `unknown` when the request may have reached the server (network error,
 *     timeout, 5xx). The caller must look the operation up before any retry.
 * No method here calls the AI-generation quota or a model.
 */
import {
  type Authorization,
  type CommandResult,
  type CompensatingProposal,
  type CreateTaskOperation,
  type CurrentTaskValue,
  type EditDraft,
  type Operation,
  type StepCreateOperation,
  type StepProposal,
  type TaskProgress,
  type TaskProposal,
  type TaskReceipt,
  type TaskStep,
  TASK_ACTIONS_CONTRACT_VERSION,
  parseCommand,
  parseCurrent,
  parseProposal,
  parseReceipt,
  parseStep,
  parseStepProposal,
  parseTask,
  parseTaskProposal,
} from './contract';

export interface TransportReply {
  status: number;
  body: unknown;
}

/** Sends one JSON body to the endpoint. Rejects only when no HTTP reply arrived. */
export type Transport = (
  body: Record<string, unknown>
) => Promise<TransportReply>;

export type Unavailable = {
  kind: 'unavailable';
  reason:
    | 'feature_disabled'
    | 'unsupported_version'
    | 'platform_not_enabled'
    | 'service_unavailable';
};
export type Refused = {
  kind: 'refused';
  status: number;
  error: string;
  reason?: string;
};
export type Unknown = { kind: 'unknown' };
export type Unauthorized = { kind: 'unauthorized' };

export type ReadResult =
  /** steps: #366, the live steps of every task ([] from a service without steps). */
  | { kind: 'ok'; tasks: TaskProgress[]; steps: TaskStep[] }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type ApplyResult =
  | { kind: 'applied'; replayed: boolean; receipt: TaskReceipt }
  | {
      kind: 'conflict';
      taskRef?: string;
      /** #366: the step whose revision moved. */
      stepId?: string;
      expected?: number;
      actual?: number | null;
    }
  | { kind: 'in_flight' }
  /** #363: the draft's relevant context changed; nothing was written. Review this revision. */
  | { kind: 'needs_review'; proposal: TaskProposal | StepProposal }
  /** #363: this command message already authorized a write. */
  | { kind: 'command_used' }
  /** #363: a live task already has this title; nothing was written. */
  | { kind: 'needs_clarification' }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

/** A proposal request: the current proposal, or a definite answer that nothing changed. */
export type ProposalResult =
  | { kind: 'ok'; proposal: TaskProposal }
  /** The draft moved on (edited, applied, cancelled): this is its current state. */
  | { kind: 'changed'; proposal: TaskProposal }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

/** A step draft request (#366): the current draft, or a definite answer that nothing changed. */
export type StepProposalResult =
  | { kind: 'ok'; proposal: StepProposal }
  | { kind: 'changed'; proposal: StepProposal }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type InterpretResult =
  | { kind: 'ok'; command: CommandResult }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type ConversationActionsResult =
  | {
      kind: 'ok';
      proposals: TaskProposal[];
      /** #366: suggested-step drafts of this conversation. */
      stepProposals: StepProposal[];
      commands: {
        messageId: number;
        operationId: string;
        receipt: TaskReceipt;
      }[];
    }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type UndoResult =
  | { kind: 'applied'; replayed: boolean; receipt: TaskReceipt }
  | {
      kind: 'undo_conflict';
      current: CurrentTaskValue[];
      proposal: CompensatingProposal;
    }
  | { kind: 'already_undone' }
  | { kind: 'in_flight' }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type StatusResult =
  | { kind: 'applied'; receipt: TaskReceipt }
  | { kind: 'pending' }
  | { kind: 'not_applied' }
  | { kind: 'lookup_failed' }
  | Unavailable
  | Unauthorized;

export interface TaskActionClient {
  read(): Promise<ReadResult>;
  apply(
    operationId: string,
    operation: Operation,
    authorization?: Authorization
  ): Promise<ApplyResult>;
  undo(
    operationId: string,
    receiptOperationId: string,
    options?: { removalConfirmed?: boolean }
  ): Promise<UndoResult>;
  status(operationId: string): Promise<StatusResult>;
  /** Reads only: what the user's own saved message asks for (#363). */
  interpret(messageId: number): Promise<InterpretResult>;
  /**
   * A server-owned draft of one new task, or of one change to an existing task (#365).
   * Writes no task. `language`: of the task title the draft shows (display only).
   */
  prepare(
    operation: CreateTaskOperation | EditDraft,
    source: { conversationId: string; messageId?: number } | null,
    options?: { language?: string }
  ): Promise<ProposalResult>;
  proposal(proposalId: string): Promise<ProposalResult>;
  revise(
    proposalId: string,
    proposalRevision: number,
    operation: CreateTaskOperation
  ): Promise<ProposalResult>;
  cancel(proposalId: string, proposalRevision: number): Promise<ProposalResult>;
  conversationActions(
    conversationId: string
  ): Promise<ConversationActionsResult>;
  /** #366: a server-owned draft of suggested steps for one task. Writes no step. */
  prepareSteps(
    operation: StepCreateOperation,
    source: { conversationId: string; messageId?: number } | null
  ): Promise<StepProposalResult>;
  stepProposal(proposalId: string): Promise<StepProposalResult>;
  reviseSteps(
    proposalId: string,
    proposalRevision: number,
    operation: StepCreateOperation
  ): Promise<StepProposalResult>;
  cancelSteps(
    proposalId: string,
    proposalRevision: number
  ): Promise<StepProposalResult>;
}

type Json = Record<string, unknown>;
const asObject = (v: unknown): Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {};

function unavailable(reply: TransportReply): Unavailable | null {
  const error = asObject(reply.body).error;
  if (reply.status === 426)
    return { kind: 'unavailable', reason: 'unsupported_version' };
  if (reply.status === 403 && error === 'feature_disabled')
    return { kind: 'unavailable', reason: 'feature_disabled' };
  if (reply.status === 403 && error === 'platform_not_enabled') {
    return { kind: 'unavailable', reason: 'platform_not_enabled' };
  }
  if (reply.status === 503 && error === 'feature_unavailable') {
    return { kind: 'unavailable', reason: 'service_unavailable' };
  }
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

/** A reply that may hide a committed write: the outcome is not known. */
const isUnknownStatus = (status: number) =>
  status >= 500 || status === 408 || status === 0;

export function createTaskActionClient(opts: {
  transport: Transport;
  platform: 'ios' | 'android' | 'web';
  appVersion: string;
}): TaskActionClient {
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

  async function draftCall<P>(
    body: Json,
    parse: (raw: unknown) => P
  ): Promise<
    | { kind: 'ok'; proposal: P }
    | { kind: 'changed'; proposal: P }
    | Unavailable
    | Refused
    | Unknown
    | Unauthorized
  > {
    const reply = await send(body);
    if (!reply) return { kind: 'unknown' };
    if (reply.status === 401) return { kind: 'unauthorized' };
    const off = unavailable(reply);
    if (off) return off;
    const parsed = asObject(reply.body);
    if (reply.status === 200) return { kind: 'ok', proposal: parse(parsed.proposal) };
    if (reply.status === 409 && parsed.error === 'proposal_changed')
      return { kind: 'changed', proposal: parse(parsed.proposal) };
    return isUnknownStatus(reply.status) ? { kind: 'unknown' } : refused(reply);
  }
  const proposalCall = (body: Json): Promise<ProposalResult> =>
    draftCall(body, parseTaskProposal);
  const stepDraftCall = (body: Json): Promise<StepProposalResult> =>
    draftCall(body, parseStepProposal);
  const sourceOf = (source: { conversationId: string; messageId?: number } | null) =>
    source
      ? {
          source: {
            conversation_id: source.conversationId,
            ...(source.messageId !== undefined ? { message_id: source.messageId } : {}),
          },
        }
      : {};

  const client: TaskActionClient = {
    async read() {
      const reply = await send({ action: 'read' });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status !== 200)
        return isUnknownStatus(reply.status)
          ? { kind: 'unknown' }
          : refused(reply);
      const tasks = asObject(reply.body).tasks;
      if (!Array.isArray(tasks)) return { kind: 'unknown' };
      const steps = asObject(reply.body).steps;
      return {
        kind: 'ok',
        tasks: tasks.map(parseTask),
        steps: Array.isArray(steps) ? steps.map(parseStep) : [],
      };
    },

    async apply(
      operationId,
      operation,
      authorization = { kind: 'ui_control' }
    ) {
      const reply = await send({
        action: 'apply',
        operation_id: operationId,
        authorization,
        operations: [operation],
      });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      const body = asObject(reply.body);
      if (reply.status === 200) {
        return {
          kind: 'applied',
          replayed: body.replayed === true,
          receipt: parseReceipt(body.receipt),
        };
      }
      if (reply.status === 503 && body.error === 'operation_in_flight')
        return { kind: 'in_flight' };
      if (reply.status === 409 && body.error === 'revision_conflict') {
        const detail = asObject(body.detail);
        return {
          kind: 'conflict',
          taskRef:
            typeof detail.task_ref === 'string' ? detail.task_ref : undefined,
          stepId:
            typeof detail.step_id === 'string' ? detail.step_id : undefined,
          expected:
            typeof detail.expected === 'number' ? detail.expected : undefined,
          actual: typeof detail.actual === 'number' ? detail.actual : null,
        };
      }
      if (reply.status === 409 && body.error === 'needs_review')
        return {
          kind: 'needs_review',
          proposal:
            asObject(body.proposal).kind === 'step_create'
              ? parseStepProposal(body.proposal)
              : parseTaskProposal(body.proposal),
        };
      if (reply.status === 409 && body.error === 'command_already_used')
        return { kind: 'command_used' };
      if (reply.status === 409 && body.error === 'needs_clarification')
        return { kind: 'needs_clarification' };
      if (isUnknownStatus(reply.status)) return { kind: 'unknown' };
      return refused(reply);
    },

    async undo(operationId, receiptOperationId, options = {}) {
      const reply = await send({
        action: 'undo',
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
      if (reply.status === 200) {
        return {
          kind: 'applied',
          replayed: body.replayed === true,
          receipt: parseReceipt(body.receipt),
        };
      }
      if (reply.status === 409 && body.error === 'undo_conflict') {
        const current = Array.isArray(body.current)
          ? body.current.map(parseCurrent)
          : [];
        return {
          kind: 'undo_conflict',
          current,
          proposal: parseProposal(body.proposal),
        };
      }
      if (reply.status === 409 && body.error === 'already_undone')
        return { kind: 'already_undone' };
      if (reply.status === 503 && body.error === 'operation_in_flight')
        return { kind: 'in_flight' };
      if (isUnknownStatus(reply.status)) return { kind: 'unknown' };
      return refused(reply);
    },

    async interpret(messageId) {
      const reply = await send({ action: 'interpret', message_id: messageId });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status === 200)
        return {
          kind: 'ok',
          command: parseCommand(asObject(reply.body).command),
        };
      return isUnknownStatus(reply.status)
        ? { kind: 'unknown' }
        : refused(reply);
    },

    prepare(operation, source, options = {}) {
      return proposalCall({
        action: 'prepare',
        operation,
        ...(options.language ? { language: options.language } : {}),
        ...(source
          ? {
              source: {
                conversation_id: source.conversationId,
                ...(source.messageId !== undefined
                  ? { message_id: source.messageId }
                  : {}),
              },
            }
          : {}),
      });
    },

    proposal(proposalId) {
      return proposalCall({ action: 'proposal', proposal_id: proposalId });
    },

    revise(proposalId, proposalRevision, operation) {
      return proposalCall({
        action: 'revise',
        proposal_id: proposalId,
        proposal_revision: proposalRevision,
        operation,
      });
    },

    cancel(proposalId, proposalRevision) {
      return proposalCall({
        action: 'cancel',
        proposal_id: proposalId,
        proposal_revision: proposalRevision,
      });
    },

    async conversationActions(conversationId) {
      const reply = await send({
        action: 'conversation_actions',
        conversation_id: conversationId,
      });
      if (!reply) return { kind: 'unknown' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status !== 200)
        return isUnknownStatus(reply.status)
          ? { kind: 'unknown' }
          : refused(reply);
      const body = asObject(reply.body);
      if (!Array.isArray(body.proposals) || !Array.isArray(body.commands))
        return { kind: 'unknown' };
      const isSteps = (p: unknown) => asObject(p).kind === 'step_create';
      return {
        kind: 'ok',
        proposals: body.proposals.filter(p => !isSteps(p)).map(parseTaskProposal),
        stepProposals: body.proposals.filter(isSteps).map(parseStepProposal),
        commands: body.commands.map(c => {
          const o = asObject(c);
          if (
            typeof o.message_id !== 'number' ||
            typeof o.operation_id !== 'string'
          )
            throw new Error('command entry');
          return {
            messageId: o.message_id,
            operationId: o.operation_id,
            receipt: parseReceipt(o.receipt),
          };
        }),
      };
    },

    prepareSteps(operation, source) {
      return stepDraftCall({ action: 'prepare', operation, ...sourceOf(source) });
    },

    stepProposal(proposalId) {
      return stepDraftCall({ action: 'proposal', proposal_id: proposalId });
    },

    reviseSteps(proposalId, proposalRevision, operation) {
      return stepDraftCall({
        action: 'revise',
        proposal_id: proposalId,
        proposal_revision: proposalRevision,
        operation,
      });
    },

    cancelSteps(proposalId, proposalRevision) {
      return stepDraftCall({
        action: 'cancel',
        proposal_id: proposalId,
        proposal_revision: proposalRevision,
      });
    },

    async status(operationId) {
      const reply = await send({ action: 'status', operation_id: operationId });
      if (!reply) return { kind: 'lookup_failed' };
      if (reply.status === 401) return { kind: 'unauthorized' };
      const off = unavailable(reply);
      if (off) return off;
      if (reply.status !== 200) return { kind: 'lookup_failed' };
      const body = asObject(reply.body);
      if (body.status === 'applied')
        return { kind: 'applied', receipt: parseReceipt(body.receipt) };
      if (body.status === 'pending') return { kind: 'pending' };
      if (body.status === 'not_applied') return { kind: 'not_applied' };
      return { kind: 'lookup_failed' };
    },
  };

  // A reply that does not match the contract is never shown as a result: a write may
  // have committed, so it is an unknown outcome (or a failed lookup) and is looked up again.
  return {
    read: () => client.read().catch(() => ({ kind: 'unknown' }) as const),
    apply: (...args) =>
      client.apply(...args).catch(() => ({ kind: 'unknown' }) as const),
    undo: (...args) =>
      client.undo(...args).catch(() => ({ kind: 'unknown' }) as const),
    interpret: (...args) =>
      client.interpret(...args).catch(() => ({ kind: 'unknown' }) as const),
    prepare: (...args) =>
      client.prepare(...args).catch(() => ({ kind: 'unknown' }) as const),
    proposal: (...args) =>
      client.proposal(...args).catch(() => ({ kind: 'unknown' }) as const),
    revise: (...args) =>
      client.revise(...args).catch(() => ({ kind: 'unknown' }) as const),
    cancel: (...args) =>
      client.cancel(...args).catch(() => ({ kind: 'unknown' }) as const),
    conversationActions: (...args) =>
      client
        .conversationActions(...args)
        .catch(() => ({ kind: 'unknown' }) as const),
    prepareSteps: (...args) =>
      client.prepareSteps(...args).catch(() => ({ kind: 'unknown' }) as const),
    stepProposal: (...args) =>
      client.stepProposal(...args).catch(() => ({ kind: 'unknown' }) as const),
    reviseSteps: (...args) =>
      client.reviseSteps(...args).catch(() => ({ kind: 'unknown' }) as const),
    cancelSteps: (...args) =>
      client.cancelSteps(...args).catch(() => ({ kind: 'unknown' }) as const),
    status: (...args) =>
      client.status(...args).catch(() => ({ kind: 'lookup_failed' }) as const),
  };
}
