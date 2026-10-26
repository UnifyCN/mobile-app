// Network stand-in for the mounted task-action tests (mobile-app#361, #363). It answers
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
  // #363 stand-in state: custom task titles, task drafts, saved messages, command uses.
  const titles = new Map<string, string>();
  const drafts = new Map<string, Body>();
  const messages = new Map<
    number,
    { role: string; text: string; conversation: string }
  >();
  const commandUses = new Map<number, string>();
  let profile: Body | null = {
    city: 'Vancouver',
    province: 'British Columbia',
    arrival_date: '2026-11-02',
  };
  let nextCustom = 500;
  let nextDraft = 1;

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
      ...(titles.has(ref) ? { title: titles.get(ref) } : {}),
      current: !receipt.undone_by && row.revision === receipt.after_revision,
    };
  }

  const applied = (receipt: Body, replayed = false): Reply => ({
    status: 200,
    body: {
      status: 'applied',
      replayed,
      receipt: current(receipt.task_ref, receipt),
    },
  });

  const draftView = (d: Body): Body => ({
    proposal_id: d.proposal_id,
    proposal_revision: d.proposal_revision,
    status: d.status,
    kind: 'task_create',
    operations: d.operations,
    context: d.context,
    previous_context: d.previous_context ?? null,
    review_reason: d.review_reason ?? null,
    source: d.source ?? null,
    receipt: d.receipt_operation_id
      ? current(
          byOperation.get(d.receipt_operation_id)!.task_ref,
          byOperation.get(d.receipt_operation_id)!
        )
      : null,
  });

  const contextNow = (title: string): Body => ({
    profile,
    same_title_tasks: [...titles.entries()]
      .filter(
        ([ref, t]) =>
          !rowOf(ref).removed && t.toLowerCase() === title.toLowerCase()
      )
      .map(([ref, t]) => ({
        task_ref: ref,
        revision: rowOf(ref).revision,
        title: t,
      })),
  });

  const resolveCommand = (text: string): Body => {
    const m = text.trim().match(/^(?:add|create)\s+(?:a\s+)?task\s*:\s*(.*)$/i);
    if (m) {
      const title = m[1].trim();
      return title
        ? { kind: 'create', title }
        : { kind: 'clarify', reason: 'missing_title' };
    }
    if (/^(?:add|create)\s+(?:a\s+)?task[.!?]?$/i.test(text.trim()))
      return { kind: 'clarify', reason: 'missing_title' };
    return { kind: 'none' };
  };

  function createTask(body: Body, op: Body): Reply {
    const ref = `custom:${nextCustom++}`;
    const row: Row = {
      state: 'not_started',
      reason: null,
      revision: 1,
      removed: false,
      receipts: [],
    };
    const receipt = receiptOf(ref, body, { ...row, revision: 0 }, row, {
      operation_type: 'task.create_custom',
    });
    row.receipts = [receipt];
    rows.set(ref, row);
    titles.set(ref, op.title);
    byOperation.set(body.operation_id, receipt);
    return applied(receipt);
  }

  function handleCreate(body: Body): Reply | null {
    if (body.action === 'interpret') {
      const m = messages.get(body.message_id);
      if (!m || m.role !== 'user')
        return { status: 404, body: { error: 'not_found' } };
      const r = resolveCommand(m.text);
      if (r.kind !== 'create') return { status: 200, body: { command: r } };
      return {
        status: 200,
        body: {
          command: {
            kind: 'create',
            operation: {
              type: 'task.create_custom',
              title: r.title,
              priority: 'Do soon',
            },
            same_title_tasks: contextNow(r.title).same_title_tasks,
          },
        },
      };
    }
    if (body.action === 'prepare') {
      const id = `7e1f1f6c-2222-4222-8222-${String(nextDraft++).padStart(12, '0')}`;
      const d: Body = {
        proposal_id: id,
        proposal_revision: 1,
        status: 'draft',
        operations: [body.operation],
        context: contextNow(body.operation.title),
        source: body.source ?? null,
      };
      drafts.set(id, d);
      return { status: 200, body: { proposal: draftView(d) } };
    }
    if (body.action === 'proposal') {
      const d = drafts.get(body.proposal_id);
      return d
        ? { status: 200, body: { proposal: draftView(d) } }
        : { status: 404, body: { error: 'not_found' } };
    }
    if (body.action === 'revise' || body.action === 'cancel') {
      const d = drafts.get(body.proposal_id);
      if (!d) return { status: 404, body: { error: 'not_found' } };
      if (
        d.status !== 'draft' ||
        d.proposal_revision !== body.proposal_revision
      )
        return {
          status: 409,
          body: { error: 'proposal_changed', proposal: draftView(d) },
        };
      if (body.action === 'cancel') d.status = 'cancelled';
      else {
        d.operations = [body.operation];
        d.proposal_revision += 1;
        d.review_reason = 'edited';
        d.context = contextNow(body.operation.title);
      }
      return { status: 200, body: { proposal: draftView(d) } };
    }
    if (body.action === 'conversation_actions') {
      return {
        status: 200,
        body: {
          proposals: [...drafts.values()]
            .filter(d => d.source?.conversation_id === body.conversation_id)
            .map(draftView),
          commands: [...commandUses.entries()]
            .filter(
              ([id]) => messages.get(id)?.conversation === body.conversation_id
            )
            .map(([message_id, operation_id]) => ({
              message_id,
              operation_id,
              receipt: current(
                byOperation.get(operation_id)!.task_ref,
                byOperation.get(operation_id)!
              ),
            })),
        },
      };
    }
    if (body.action === 'undo' && !byOperation.get(body.operation_id)) {
      const target = byOperation.get(body.receipt_operation_id);
      if (target?.operation_type !== 'task.create_custom' || target.undone_by)
        return null;
      if (body.authorization?.removal_confirmed !== true)
        return {
          status: 403,
          body: { error: 'forbidden', reason: 'removal_requires_confirmation' },
        };
      const ref = target.task_ref;
      const now = rowOf(ref);
      if (now.revision !== target.after_revision) {
        const proposal = {
          proposal_id: '7e1f1f6c-1111-4111-8111-000000000002',
          proposal_revision: 1,
          operations: [
            {
              type: 'task.remove_created',
              task_ref: ref,
              expected_revision: now.revision,
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
      return removeCreated(body, ref, now, target);
    }
    if (body.action !== 'apply' || byOperation.get(body.operation_id))
      return null;
    const op = body.operations?.[0];
    if (op?.type === 'task.remove_created') {
      const proposal = proposals.get(body.authorization?.proposal_id);
      if (
        !proposal ||
        proposal.used ||
        body.authorization?.removal_confirmed !== true
      )
        return { status: 403, body: { error: 'forbidden' } };
      const before = rowOf(op.task_ref);
      if (before.revision !== op.expected_revision)
        return {
          status: 409,
          body: {
            error: 'revision_conflict',
            detail: { task_ref: op.task_ref },
          },
        };
      proposal.used = true;
      return removeCreated(
        body,
        op.task_ref,
        before,
        byOperation.get(proposal.undo_of)
      );
    }
    if (op?.type !== 'task.create_custom') return null;
    if (body.authorization?.kind === 'direct_command') {
      const m = messages.get(body.authorization.message_id);
      const r = m && m.role === 'user' ? resolveCommand(m.text) : null;
      if (!r || r.kind !== 'create' || r.title !== op.title)
        return { status: 403, body: { error: 'forbidden' } };
      if (commandUses.has(body.authorization.message_id))
        return { status: 409, body: { error: 'command_already_used' } };
      const reply = createTask(body, op);
      commandUses.set(body.authorization.message_id, body.operation_id);
      return reply;
    }
    const d = drafts.get(body.authorization?.proposal_id);
    if (
      !d ||
      d.status !== 'draft' ||
      d.proposal_revision !== body.authorization.proposal_revision ||
      JSON.stringify(d.operations) !== JSON.stringify(body.operations)
    )
      return { status: 403, body: { error: 'forbidden' } };
    const now = contextNow(op.title);
    if (JSON.stringify(now) !== JSON.stringify(d.context)) {
      d.previous_context = d.context;
      d.context = now;
      d.proposal_revision += 1;
      d.review_reason = 'context_changed';
      return {
        status: 409,
        body: { error: 'needs_review', proposal: draftView(d) },
      };
    }
    d.status = 'applied';
    d.receipt_operation_id = body.operation_id;
    return createTask(body, op);
  }

  function removeCreated(
    body: Body,
    ref: string,
    before: Row,
    undoOf: Body | undefined
  ): Reply {
    const after: Row = {
      ...before,
      removed: true,
      revision: before.revision + 1,
    };
    const receipt = receiptOf(ref, body, before, after, {
      kind: 'undo',
      undo_of: undoOf?.operation_id ?? null,
      undoable: false,
      operation_type: 'task.remove_created',
    });
    if (undoOf) {
      undoOf.undone_by = body.operation_id;
      undoOf.undoable = false;
    }
    after.receipts = [...before.receipts, receipt];
    rows.set(ref, after);
    byOperation.set(body.operation_id, receipt);
    return applied(receipt);
  }

  function handle(body: Body): Reply {
    const created = handleCreate(body);
    if (created) return created;
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
            ...(titles.has(ref) ? { title: titles.get(ref) } : {}),
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
    /** Live custom tasks the stand-in holds, as the legacy Checklist read sees them. */
    customTasks: () =>
      [...titles.entries()]
        .filter(([ref]) => !rowOf(ref).removed)
        .map(([ref, title]) => ({ id: ref.slice(7), title })),
    /** A message the client saved; the stand-in reads it like the service does. */
    saveMessage(id: number, role: string, text: string, conversation: string) {
      messages.set(id, { role, text, conversation });
    },
    /** The profile changes on another platform. */
    setProfile(next: Body | null) {
      profile = next;
    },
    drafts: () => [...drafts.values()],
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
