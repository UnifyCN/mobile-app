// Network stand-in for the mounted task-action tests (mobile-app#361, #363, #366, #370). It answers
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
  // #366 stand-in state: steps by id, and suggested-step drafts.
  const steps = new Map<
    string,
    { task_ref: string; title: string; done: boolean; revision: number; removed: boolean; position: number }
  >();
  const stepDrafts = new Map<string, Body>();
  let nextStep = 1;

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

  const stepView = (id: string) => {
    const s = steps.get(id)!;
    return {
      step_id: id,
      task_ref: s.task_ref,
      title: s.title,
      done: s.done,
      position: s.position,
      revision: s.revision,
    };
  };
  const stepReceiptView = (r: Body): Body => ({
    ...r,
    current:
      !r.undone_by &&
      r.steps.every((x: Body) => steps.get(x.step_id)?.revision === x.after_revision),
    undoable: !r.undone_by && r.inverse !== null && r.kind === 'change',
  });
  const stepDraftView = (d: Body): Body => ({
    proposal_id: d.proposal_id,
    proposal_revision: d.proposal_revision,
    status: d.status,
    kind: 'step_create',
    operations: d.operations,
    context: { task_ref: d.operations[0].task_ref, existing_steps: [] },
    previous_context: null,
    review_reason: d.review_reason ?? null,
    source: d.source ?? null,
    receipt: d.receipt_operation_id
      ? stepReceiptView(byOperation.get(d.receipt_operation_id)!)
      : null,
  });

  /** Applies one step operation; a receipt with each step as saved and the inverse. */
  function applyStep(body: Body, op: Body, undoOf: Body | null): Reply {
    const parent = rowOf(op.task_ref ?? steps.get(op.step_id)?.task_ref ?? '');
    if (parent.state === 'completed')
      return { status: 422, body: { error: 'invalid_request', reason: 'task_completed' } };
    if (parent.removed)
      return { status: 422, body: { error: 'invalid_request', reason: 'task_removed' } };
    const saved: Body[] = [];
    let inverse: Body | null = null;
    if (op.type === 'step.create') {
      const ids: Body[] = [];
      for (const title of op.titles) {
        const id = `00000000-0000-4000-8000-${String(nextStep++).padStart(12, '0')}`;
        steps.set(id, { task_ref: op.task_ref, title, done: false, revision: 1, removed: false, position: nextStep });
        saved.push({ step_id: id, title, before_title: null, before_done: false, done: false, after_revision: 1 });
        ids.push({ step_id: id, expected_revision: 1 });
      }
      inverse = { type: 'step.remove_created', task_ref: op.task_ref, steps: ids };
    } else if (op.type === 'step.remove_created') {
      for (const x of op.steps) {
        const s = steps.get(x.step_id)!;
        s.removed = true;
        s.revision += 1;
        saved.push({ step_id: x.step_id, title: s.title, before_title: null, before_done: s.done, done: s.done, removed: true, after_revision: s.revision });
      }
    } else {
      const s = steps.get(op.step_id);
      if (!s) return { status: 404, body: { error: 'not_found', reason: 'step_not_found' } };
      if (s.revision !== op.expected_revision)
        return {
          status: 409,
          body: { error: 'revision_conflict', detail: { step_id: op.step_id, expected: op.expected_revision, actual: s.revision } },
        };
      const before = { ...s };
      if (op.type === 'step.set_done') s.done = op.done;
      if (op.type === 'step.update') s.title = op.title;
      if (op.type === 'step.remove') s.removed = true;
      if (op.type === 'step.restore') s.removed = false;
      s.revision += 1;
      saved.push({
        step_id: op.step_id, title: s.title, before_title: before.title, before_done: before.done, done: s.done,
        ...(op.type === 'step.remove' ? { removed: true } : {}), after_revision: s.revision,
      });
      inverse =
        op.type === 'step.set_done' ? { type: 'step.set_done', step_id: op.step_id, done: before.done }
        : op.type === 'step.update' ? { type: 'step.update', step_id: op.step_id, title: before.title }
        : op.type === 'step.remove' ? { type: 'step.restore', step_id: op.step_id }
        : null;
    }
    const receipt: Body = {
      operation_id: body.operation_id,
      created_at: '2026-10-27T18:00:00.000Z',
      kind: undoOf ? 'undo' : 'change',
      operation_type: op.type,
      undo_of: undoOf?.operation_id ?? null,
      task_ref: op.task_ref ?? steps.get(saved[0].step_id)!.task_ref,
      before_state: parent.state,
      after_state: parent.state,
      before_revision: 0,
      after_revision: 1,
      undone_by: null,
      steps: saved,
      inverse: undoOf ? null : inverse,
    };
    if (undoOf) undoOf.undone_by = body.operation_id;
    byOperation.set(body.operation_id, receipt);
    return { status: 200, body: { status: 'applied', replayed: false, receipt: stepReceiptView(receipt) } };
  }

  function handleSteps(body: Body): Reply | null {
    const op = body.operations?.[0] ?? body.operation;
    if (body.action === 'apply' && op?.type?.startsWith('step.')) {
      const replay = byOperation.get(body.operation_id);
      if (replay)
        return { status: 200, body: { status: 'applied', replayed: true, receipt: stepReceiptView(replay) } };
      if ((op.type === 'step.remove' || op.type === 'step.remove_created') && body.authorization?.removal_confirmed !== true)
        return { status: 403, body: { error: 'forbidden', reason: 'removal_requires_confirmation' } };
      let undoOf: Body | null = null;
      if (body.authorization?.kind === 'approved_proposal') {
        const d = stepDrafts.get(body.authorization.proposal_id);
        const p = proposals.get(body.authorization.proposal_id);
        if (d) {
          if (d.status !== 'draft' || d.proposal_revision !== body.authorization.proposal_revision ||
              JSON.stringify(d.operations[0]) !== JSON.stringify(op))
            return { status: 403, body: { error: 'forbidden', reason: 'invalid_authorization' } };
          d.status = 'applied';
          d.receipt_operation_id = body.operation_id;
        } else if (p && !p.used) {
          p.used = true;
          undoOf = byOperation.get(p.undo_of) ?? null;
        } else {
          return { status: 403, body: { error: 'forbidden', reason: 'invalid_authorization' } };
        }
      }
      return applyStep(body, op, undoOf);
    }
    if (body.action === 'undo') {
      const target = byOperation.get(body.receipt_operation_id);
      if (!target?.operation_type?.startsWith('step.')) return null;
      const replay = byOperation.get(body.operation_id);
      if (replay)
        return { status: 200, body: { status: 'applied', replayed: true, receipt: stepReceiptView(replay) } };
      if (target.undone_by) return { status: 409, body: { error: 'already_undone' } };
      const inv = target.inverse;
      if (!inv) return { status: 422, body: { error: 'invalid_request', reason: 'not_undoable' } };
      const removes = inv.type === 'step.remove_created';
      if (removes && body.authorization?.removal_confirmed !== true)
        return { status: 403, body: { error: 'forbidden', reason: 'removal_requires_confirmation' } };
      const stale = target.steps.some((x: Body) => steps.get(x.step_id)?.revision !== x.after_revision);
      if (stale) {
        const s = steps.get(target.steps[0].step_id)!;
        const proposal = {
          proposal_id: '7e1f1f6c-3666-4366-8366-000000000001',
          proposal_revision: 1,
          operations: [
            removes
              ? { type: 'step.remove_created', task_ref: inv.task_ref, steps: target.steps.map((x: Body) => ({ step_id: x.step_id, expected_revision: steps.get(x.step_id)!.revision })) }
              : { ...inv, expected_revision: s.revision },
          ],
        };
        proposals.set(proposal.proposal_id, { ...proposal, undo_of: target.operation_id });
        return { status: 409, body: { error: 'undo_conflict', receipt_operation_id: target.operation_id, current: [], proposal } };
      }
      const op = removes
        ? inv
        : { ...inv, expected_revision: steps.get(inv.step_id)!.revision };
      return applyStep(body, op, target);
    }
    if (body.action === 'status') {
      const done = byOperation.get(body.operation_id);
      if (done?.operation_type?.startsWith('step.'))
        return { status: 200, body: { status: 'applied', receipt: stepReceiptView(done) } };
      return null;
    }
    if (body.action === 'prepare' && op?.type === 'step.create') {
      const d: Body = {
        proposal_id: `5e1f1f6c-3666-4366-8366-${String(nextDraft++).padStart(12, '0')}`,
        proposal_revision: 1,
        status: 'draft',
        operations: [op],
        source: body.source ?? null,
      };
      stepDrafts.set(d.proposal_id, d);
      return { status: 200, body: { proposal: stepDraftView(d) } };
    }
    if (['proposal', 'revise', 'cancel'].includes(body.action) && stepDrafts.has(body.proposal_id)) {
      const d = stepDrafts.get(body.proposal_id)!;
      if (body.action === 'proposal') return { status: 200, body: { proposal: stepDraftView(d) } };
      if (d.status !== 'draft' || d.proposal_revision !== body.proposal_revision)
        return { status: 409, body: { error: 'proposal_changed', proposal: stepDraftView(d) } };
      if (body.action === 'cancel') d.status = 'cancelled';
      else {
        d.operations = [body.operation];
        d.proposal_revision += 1;
        d.review_reason = 'edited';
      }
      return { status: 200, body: { proposal: stepDraftView(d) } };
    }
    return null;
  }

  // #370 stand-in state: saved details, detail receipts and suggested-detail drafts.
  const details = new Map<
    string,
    { text: string; revision: number; removed: boolean; source: Body; created: number }
  >();
  const detailReceipts = new Map<string, Body>();
  const detailDrafts = new Map<string, Body>();
  const detailCommands = new Map<number, string>();
  let nextDetail = 1;

  const detailCurrent = (r: Body): Body => {
    const d = details.get(r.detail.detail_id);
    const undone = [...detailReceipts.values()].some(x => x.undo_of === r.operation_id);
    return {
      ...r,
      undone_by: undone ? 'undone' : null,
      current: !undone && !!d && d.revision === r.after_revision,
      undoable: r.kind === 'change' && !undone,
    };
  };
  const detailView = (id: string) => {
    const d = details.get(id)!;
    return {
      detail_id: id,
      text: d.text,
      scope: 'companion',
      revision: d.revision,
      source: d.source,
      created_at: `2026-10-27T10:00:0${d.created}.000Z`,
      updated_at: '2026-10-27T10:00:00.000Z',
    };
  };
  const detailDraftView = (d: Body): Body => ({
    proposal_id: d.proposal_id,
    proposal_revision: d.proposal_revision,
    status: d.status,
    kind: 'detail_create',
    operations: d.operations,
    context: {
      same_text_details: [...details.entries()]
        .filter(([, x]) => !x.removed && x.text.toLowerCase() === d.operations[0].text.toLowerCase())
        .map(([detail_id, x]) => ({ detail_id, text: x.text })),
    },
    review_reason: null,
    source: d.source ?? null,
    receipt: d.receipt_operation_id ? detailCurrent(detailReceipts.get(d.receipt_operation_id)!) : null,
  });
  const rememberOf = (text: string) => /^remember that (.+?)\.?$/i.exec(text.trim())?.[1] ?? null;

  /** Executes one detail operation, as the service would, and records its receipt. */
  function applyDetail(operationId: string, op: Body, auth: Body, undoOf: string | null): Reply {
    if (op.type === 'detail.remove' && auth.removal_confirmed !== true)
      return { status: 403, body: { error: 'forbidden', reason: 'removal_requires_confirmation' } };
    let id: string;
    let before: { text: string | null; revision: number };
    if (op.type === 'detail.create') {
      if ([...details.values()].some(x => !x.removed && x.text === op.text))
        return { status: 409, body: { error: 'detail_exists' } };
      id = `5d000000-0000-4000-8000-${String(nextDetail).padStart(12, '0')}`;
      details.set(id, {
        text: op.text,
        revision: 1,
        removed: false,
        source: { kind: auth.kind, conversation_id: null },
        created: nextDetail++,
      });
      before = { text: null, revision: 0 };
    } else {
      id = op.detail_id;
      const d = details.get(id);
      if (!d) return { status: 404, body: { error: 'not_found', reason: 'detail_not_found' } };
      if (d.revision !== op.expected_revision)
        return {
          status: 409,
          body: { error: 'revision_conflict', detail: { detail_id: id, expected: op.expected_revision, actual: d.revision } },
        };
      before = { text: d.text, revision: d.revision };
      if (op.type === 'detail.update') d.text = op.text;
      if (op.type === 'detail.remove') d.removed = true;
      if (op.type === 'detail.restore') d.removed = false;
      d.revision += 1;
    }
    const d = details.get(id)!;
    const receipt: Body = {
      operation_id: operationId,
      created_at: '2026-10-27T18:00:00.000Z',
      kind: undoOf ? 'undo' : 'change',
      operation_type: op.type,
      undo_of: undoOf,
      task_ref: null,
      before_state: null,
      after_state: null,
      before_revision: before.revision,
      after_revision: d.revision,
      detail: {
        detail_id: id,
        text: d.text,
        before_text: op.type === 'detail.update' ? before.text : null,
        removed: d.removed,
      },
      inverse:
        op.type === 'detail.update'
          ? { type: 'detail.update', detail_id: id, text: before.text, expected_revision: d.revision }
          : op.type === 'detail.remove'
            ? { type: 'detail.restore', detail_id: id, expected_revision: d.revision }
            : { type: 'detail.remove', detail_id: id, expected_revision: d.revision },
    };
    detailReceipts.set(operationId, receipt);
    return { status: 200, body: { status: 'applied', replayed: false, receipt: detailCurrent(receipt) } };
  }

  function handleDetails(body: Body): Reply | null {
    const op = body.operations?.[0] ?? body.operation;
    if (body.action === 'interpret') {
      const m = messages.get(body.message_id);
      const text = m?.role === 'user' ? rememberOf(m.text) : null;
      if (!text) return null;
      return {
        status: 200,
        body: {
          command: {
            kind: 'remember',
            operation: { type: 'detail.create', text },
            same_text_details: [...details.entries()]
              .filter(([, x]) => !x.removed && x.text === text)
              .map(([detail_id, x]) => ({ detail_id, text: x.text })),
          },
        },
      };
    }
    if (body.action === 'apply' && op?.type?.startsWith('detail.')) {
      const replay = detailReceipts.get(body.operation_id);
      if (replay) return { status: 200, body: { status: 'applied', replayed: true, receipt: detailCurrent(replay) } };
      const auth = body.authorization ?? {};
      let undoOf: string | null = null;
      if (auth.kind === 'direct_command') {
        const m = messages.get(auth.message_id);
        if (!m || rememberOf(m.text) !== op.text || detailCommands.has(auth.message_id))
          return { status: 403, body: { error: 'forbidden' } };
      } else if (auth.kind === 'approved_proposal') {
        const d = detailDrafts.get(auth.proposal_id) ?? proposals.get(auth.proposal_id);
        if (!d || d.status !== 'draft' || d.proposal_revision !== auth.proposal_revision)
          return { status: 403, body: { error: 'forbidden' } };
        undoOf = d.undo_of ?? null;
      } else if (op.type === 'detail.create' || op.type === 'detail.restore') {
        return { status: 403, body: { error: 'forbidden' } };
      }
      const reply = applyDetail(body.operation_id, op, auth, null);
      if (reply.status === 200) {
        if (auth.kind === 'direct_command') detailCommands.set(auth.message_id, body.operation_id);
        if (auth.kind === 'approved_proposal') {
          const d = detailDrafts.get(auth.proposal_id) ?? proposals.get(auth.proposal_id)!;
          d.status = 'applied';
          d.receipt_operation_id = body.operation_id;
          if (undoOf) detailReceipts.get(body.operation_id)!.undo_of = undoOf;
        }
      }
      return reply;
    }
    if (body.action === 'undo' && detailReceipts.has(body.receipt_operation_id)) {
      const replay = detailReceipts.get(body.operation_id);
      if (replay) return { status: 200, body: { status: 'applied', replayed: true, receipt: detailCurrent(replay) } };
      const target = detailReceipts.get(body.receipt_operation_id)!;
      const inv = target.inverse;
      if (inv.type === 'detail.remove' && body.authorization?.removal_confirmed !== true)
        return { status: 403, body: { error: 'forbidden', reason: 'removal_requires_confirmation' } };
      if ([...detailReceipts.values()].some(x => x.undo_of === target.operation_id))
        return { status: 409, body: { error: 'already_undone' } };
      const d = details.get(inv.detail_id)!;
      if (d.revision !== inv.expected_revision) {
        const id = `7e1f1f6c-3333-4333-8333-${String(nextDraft++).padStart(12, '0')}`;
        const comp: Body = {
          proposal_id: id,
          proposal_revision: 1,
          status: 'draft',
          operations: [{ ...inv, expected_revision: d.revision }],
          undo_of: target.operation_id,
        };
        proposals.set(id, comp);
        return {
          status: 409,
          body: {
            error: 'undo_conflict',
            current: [],
            proposal: { proposal_id: id, proposal_revision: 1, operations: comp.operations },
          },
        };
      }
      return applyDetail(body.operation_id, inv, body.authorization ?? {}, target.operation_id);
    }
    if (body.action === 'status' && detailReceipts.has(body.operation_id))
      return { status: 200, body: { status: 'applied', receipt: detailCurrent(detailReceipts.get(body.operation_id)!) } };
    if (body.action === 'prepare' && op?.type === 'detail.create') {
      const id = `7e1f1f6c-4444-4444-8444-${String(nextDraft++).padStart(12, '0')}`;
      const d: Body = { proposal_id: id, proposal_revision: 1, status: 'draft', operations: [op], source: body.source };
      detailDrafts.set(id, d);
      return { status: 200, body: { proposal: detailDraftView(d) } };
    }
    if ((body.action === 'proposal' || body.action === 'cancel') && detailDrafts.has(body.proposal_id)) {
      const d = detailDrafts.get(body.proposal_id)!;
      if (body.action === 'proposal') return { status: 200, body: { proposal: detailDraftView(d) } };
      if (d.status !== 'draft' || d.proposal_revision !== body.proposal_revision)
        return { status: 409, body: { error: 'proposal_changed', proposal: detailDraftView(d) } };
      d.status = 'cancelled';
      return { status: 200, body: { proposal: detailDraftView(d) } };
    }
    return null;
  }

  function withDetails(body: Body, reply: Reply): Reply {
    if (reply.status !== 200) return reply;
    if (body.action === 'read')
      (reply.body as Body).details = [...details.keys()].filter(id => !details.get(id)!.removed).map(detailView);
    if (body.action === 'conversation_actions') {
      const b = reply.body as Body;
      b.detail_proposals = [...detailDrafts.values()]
        .filter(d => d.source?.conversation_id === body.conversation_id)
        .map(detailDraftView);
      b.detail_commands = [...detailCommands.entries()]
        .filter(([id]) => messages.get(id)?.conversation === body.conversation_id)
        .map(([message_id, operation_id]) => ({
          message_id,
          operation_id,
          receipt: detailCurrent(detailReceipts.get(operation_id)!),
        }));
    }
    return reply;
  }

  function handle(body: Body): Reply {
    const detailReply = handleDetails(body);
    if (detailReply) return detailReply;
    return withDetails(body, handleOthers(body));
  }

  function handleOthers(body: Body): Reply {
    const stepReply = handleSteps(body);
    if (stepReply) return stepReply;
    const created = handleCreate(body);
    if (created) {
      // #366: a conversation also lists its suggested-step drafts.
      if (body.action === 'conversation_actions' && created.status === 200)
        (created.body as Body).proposals.push(
          ...[...stepDrafts.values()]
            .filter(d => d.source?.conversation_id === body.conversation_id)
            .map(stepDraftView)
        );
      return created;
    }
    if (body.action === 'read') {
      return {
        status: 200,
        body: {
          contract_version: 1,
          steps: [...steps.keys()].filter(id => !steps.get(id)!.removed).map(stepView),
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
    /** #370: every detail the stand-in holds, removed ones included. */
    details: () => [...details.entries()].map(([detail_id, d]) => ({ detail_id, ...d })),
    detailDrafts: () => [...detailDrafts.values()],
    /** #370: another platform edits a detail: its revision moves on. */
    editDetailElsewhere(detailId: string, text: string) {
      const d = details.get(detailId)!;
      d.text = text;
      d.revision += 1;
    },
    /** #366: every step the stand-in holds, removed ones included. */
    steps: () => [...steps.entries()].map(([id, s]) => ({ step_id: id, ...s })),
    stepDrafts: () => [...stepDrafts.values()],
    /** #366: suggested steps prepared earlier for a conversation message. */
    seedStepDraft(source: Body, op: Body) {
      return (handle({ action: 'prepare', operation: op, source }).body as Body).proposal;
    },
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
