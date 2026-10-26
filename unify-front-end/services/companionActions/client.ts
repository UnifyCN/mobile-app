/**
 * Versioned client for the Companion task actions endpoint (mobile-app#361).
 * Mirror of the web app's lib/companionActions/client.ts.
 * Each call names an outcome the interface can show truthfully:
 *   - a recorded result, or a definite refusal (nothing was written);
 *   - `unknown` when the request may have reached the server (network error,
 *     timeout, 5xx). The caller must look the operation up before any retry.
 * No method here calls the AI-generation quota or a model.
 */
import {
  type Authorization,
  type CompensatingProposal,
  type CurrentTaskValue,
  type SetStateOperation,
  type TaskProgress,
  type TaskReceipt,
  TASK_ACTIONS_CONTRACT_VERSION,
  parseCurrent,
  parseProposal,
  parseReceipt,
  parseTask,
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
  | { kind: 'ok'; tasks: TaskProgress[] }
  | Unavailable
  | Refused
  | Unknown
  | Unauthorized;

export type ApplyResult =
  | { kind: 'applied'; replayed: boolean; receipt: TaskReceipt }
  | {
      kind: 'conflict';
      taskRef?: string;
      expected?: number;
      actual?: number | null;
    }
  | { kind: 'in_flight' }
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
    operation: SetStateOperation,
    authorization?: Authorization
  ): Promise<ApplyResult>;
  undo(operationId: string, receiptOperationId: string): Promise<UndoResult>;
  status(operationId: string): Promise<StatusResult>;
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
      return { kind: 'ok', tasks: tasks.map(parseTask) };
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
          expected:
            typeof detail.expected === 'number' ? detail.expected : undefined,
          actual: typeof detail.actual === 'number' ? detail.actual : null,
        };
      }
      if (isUnknownStatus(reply.status)) return { kind: 'unknown' };
      return refused(reply);
    },

    async undo(operationId, receiptOperationId) {
      const reply = await send({
        action: 'undo',
        operation_id: operationId,
        receipt_operation_id: receiptOperationId,
        authorization: { kind: 'ui_control' },
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
    status: (...args) =>
      client.status(...args).catch(() => ({ kind: 'lookup_failed' }) as const),
  };
}
