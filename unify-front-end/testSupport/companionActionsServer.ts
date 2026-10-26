// Network stand-in for the mounted task-action tests (mobile-app#361). It answers
// the companion-actions request contract from a small in-memory record so the
// rendered client can be driven through real controls. It is not evidence of the
// server's behaviour: authorization, revisions, receipts and persistence are
// proven against the real endpoint and database in the web repo
// (supabase/tests/companion-actions) and by companionActionsLocalStack.test.tsx.

export type Body = Record<string, any>;
export type Reply = { status: number; body: unknown };

interface Row {
  state: string;
  reason: string | null;
  revision: number;
  removed: boolean;
  receipts: Body[];
}

let counter = 0;

export function receiptOf(
  ref: string,
  op: Body,
  before: Row,
  after: Row,
  over: Body = {}
): Body {
  return {
    operation_id: op.operation_id,
    created_at: '2026-10-25T18:00:00.000Z',
    kind: 'change',
    undo_of: null,
    task_ref: ref,
    before_state: before.state,
    after_state: after.state,
    before_revision: before.revision,
    after_revision: after.revision,
    undone_by: null,
    current: true,
    undoable: true,
    ...over,
  };
}

export function scriptedServer(
  initial: Record<string, Partial<Row>> = {},
  opts: { override?: (body: Body) => Reply | 'network-error' | undefined } = {}
) {
  const rows = new Map<string, Row>();
  for (const [ref, row] of Object.entries(initial)) {
    rows.set(ref, {
      state: 'not_started',
      reason: null,
      revision: 1,
      removed: false,
      receipts: [],
      ...row,
    });
  }
  const sent: Body[] = [];
  const byOperation = new Map<string, Body>();
  const proposals = new Map<string, Body>();

  const rowOf = (ref: string): Row =>
    rows.get(ref) ?? {
      state: 'not_started',
      reason: null,
      revision: 0,
      removed: false,
      receipts: [],
    };

  function current(ref: string, receipt: Body): Body {
    const row = rowOf(ref);
    const { before_reason: _hidden, ...visible } = receipt;
    return {
      ...visible,
      current: !receipt.undone_by && row.revision === receipt.after_revision,
    };
  }

  function handle(body: Body): Reply {
    if (body.action === 'read') {
      return {
        status: 200,
        body: {
          contract_version: 1,
          tasks: [...rows.entries()].map(([ref, row]) => ({
            task_ref: ref,
            source: ref.split(':')[0],
            state: row.state,
            waiting_reason: row.reason,
            revision: row.revision,
            removed: row.removed,
            state_updated_at: null,
            last_receipt: row.receipts.length
              ? current(ref, row.receipts[row.receipts.length - 1])
              : null,
          })),
        },
      };
    }
    if (body.action === 'status') {
      const done = byOperation.get(body.operation_id);
      if (!done) return { status: 200, body: { status: 'not_applied' } };
      return {
        status: 200,
        body: { status: 'applied', receipt: current(done.task_ref, done) },
      };
    }
    if (body.action === 'undo') {
      const replay = byOperation.get(body.operation_id);
      if (replay) {
        return {
          status: 200,
          body: {
            status: 'applied',
            replayed: true,
            receipt: current(replay.task_ref, replay),
          },
        };
      }
      const target = byOperation.get(body.receipt_operation_id);
      if (!target) return { status: 404, body: { error: 'not_found' } };
      if (target.undone_by)
        return { status: 409, body: { error: 'already_undone' } };
      const ref = target.task_ref;
      const now = rowOf(ref);
      if (now.revision !== target.after_revision) {
        // The newer edit stays; a reviewed compensating change is offered.
        const proposal = {
          proposal_id: '7e1f1f6c-1111-4111-8111-000000000001',
          proposal_revision: 1,
          operations: [
            {
              type: 'task.set_state',
              task_ref: ref,
              state: target.before_state,
              expected_revision: now.revision,
              ...(target.before_reason
                ? { waiting_reason: target.before_reason }
                : {}),
            },
          ],
        };
        proposals.set(proposal.proposal_id, {
          ...proposal,
          undo_of: target.operation_id,
        });
        return {
          status: 409,
          body: {
            error: 'undo_conflict',
            receipt_operation_id: target.operation_id,
            current: [
              {
                task_ref: ref,
                state: now.state,
                waiting_reason: now.reason,
                revision: now.revision,
                removed: now.removed,
              },
            ],
            proposal,
          },
        };
      }
      const after: Row = {
        ...now,
        state: target.before_state,
        reason: target.before_reason ?? null,
        revision: now.revision + 1,
      };
      const receipt = receiptOf(ref, body, now, after, {
        kind: 'undo',
        undo_of: target.operation_id,
        undoable: false,
      });
      target.undone_by = body.operation_id;
      target.undoable = false;
      after.receipts = [...now.receipts, receipt];
      rows.set(ref, after);
      byOperation.set(body.operation_id, receipt);
      return {
        status: 200,
        body: {
          status: 'applied',
          replayed: false,
          receipt: current(ref, receipt),
        },
      };
    }
    if (body.action === 'apply') {
      const replay = byOperation.get(body.operation_id);
      if (replay) {
        return {
          status: 200,
          body: {
            status: 'applied',
            replayed: true,
            receipt: current(replay.task_ref, replay),
          },
        };
      }
      const op = body.operations[0];
      let undoOf: Body | undefined;
      if (body.authorization?.kind === 'approved_proposal') {
        const proposal = proposals.get(body.authorization.proposal_id);
        if (!proposal || proposal.used)
          return { status: 403, body: { error: 'forbidden' } };
        proposal.used = true;
        undoOf = byOperation.get(proposal.undo_of);
      }
      const before = rowOf(op.task_ref);
      if (before.revision !== op.expected_revision) {
        return {
          status: 409,
          body: {
            error: 'revision_conflict',
            detail: {
              task_ref: op.task_ref,
              expected: op.expected_revision,
              actual: before.revision,
            },
          },
        };
      }
      const after: Row = {
        ...before,
        state: op.state,
        reason: op.state === 'waiting' ? (op.waiting_reason ?? null) : null,
        revision: before.revision + 1,
      };
      const receipt = receiptOf(op.task_ref, body, before, after, {
        before_reason: before.reason,
        ...(undoOf
          ? { kind: 'undo', undo_of: undoOf.operation_id, undoable: false }
          : {}),
      });
      if (undoOf) {
        undoOf.undone_by = body.operation_id;
        undoOf.undoable = false;
      }
      after.receipts = [...before.receipts, receipt];
      rows.set(op.task_ref, after);
      byOperation.set(body.operation_id, receipt);
      return {
        status: 200,
        body: {
          status: 'applied',
          replayed: false,
          receipt: current(op.task_ref, receipt),
        },
      };
    }
    return { status: 400, body: { error: 'invalid_action' } };
  }

  const fetchImpl = jest.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Body;
    sent.push(body);
    const scripted = opts.override?.(body);
    if (scripted === 'network-error')
      throw new TypeError('Network request failed');
    const reply = scripted ?? handle(body);
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      json: async () => reply.body,
      text: async () => JSON.stringify(reply.body),
    };
  });

  return {
    fetch: fetchImpl,
    /** Answers a request as the server would, without the network. */
    handle,
    sent,
    writes: () => sent.filter(b => b.action === 'apply' || b.action === 'undo'),
    row: (ref: string) => rows.get(ref),
    /** Another platform changes the task: the revision moves on. */
    editElsewhere(ref: string, state: string) {
      const before = rowOf(ref);
      rows.set(ref, {
        ...before,
        state,
        reason: null,
        revision: before.revision + 1,
      });
    },
    id: () => `scripted-${++counter}`,
  };
}
