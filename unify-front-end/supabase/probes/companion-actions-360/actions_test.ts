// Companion actions compatibility probe (#360). Every assertion goes through the
// public request boundary (HTTP) or the legacy client path (PostgREST with the
// user's JWT) against a real local Postgres + GoTrue + PostgREST + edge runtime.
// Direct SQL appears only for what no public path can show: row counts of
// receipts, lock holding, gate edits, and fixtures.
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  admin, apply, applyCandidate, call, candidateApplied, customId, holdRowLock, makeCustom, newAccount,
  openGate, prepare, read, sql, status, taskOf, uuid, waitForBlockedApplies,
} from './support.ts';

if (!(await candidateApplied())) await applyCandidate('up');
await openGate();

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: 'content-backed task: write then read round trip', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const w = await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:sin-card', state: 'in_progress', expected_revision: 0 }]);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  assertEquals(w.json.status, 'applied');
  const t = await taskOf(a, 'sanity:sin-card');
  assertEquals(t.state, 'in_progress');
  assertEquals(t.revision, 1);
  assertEquals(t.removed, false);
}});

Deno.test({ name: 'custom task: create, wait with reason, legacy client sees it as not completed', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a);
  const w = await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'waiting', waiting_reason: 'Waiting for SIN letter', expected_revision: revision }]);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  const t = await taskOf(a, ref);
  assertEquals([t.state, t.waiting_reason, t.title], ['waiting', 'Waiting for SIN letter', 'Phone plan']);
  // The mobile and web clients read custom tasks with select('*') / explicit columns.
  const legacy = await a.client.from('custom_checklist_tasks').select('*').eq('id', customId(ref)).single();
  assertEquals(legacy.data?.completed, false);
  assertEquals(legacy.data?.title, 'Phone plan');
}});

Deno.test({ name: 'account isolation across both task sources and every new table', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const b = await newAccount('bob');
  const { ref, revision } = await makeCustom(a, 'Alice private');
  await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:bank', state: 'in_progress', expected_revision: 0 }]);
  const aBank = await taskOf(a, 'sanity:bank');

  // Reads never cross accounts.
  assertEquals((await read(b)).json.tasks, []);
  // Writes against another account's custom task look like "not found" and change nothing.
  const cross = await apply(b, [{ type: 'task.set_state', task_ref: ref, state: 'completed', expected_revision: revision }]);
  assertEquals(cross.status, 404);
  assertEquals((await taskOf(a, ref)).state, 'not_started');
  // The same content-backed id is a different row per account.
  const own = await apply(b, [{ type: 'task.set_state', task_ref: 'sanity:bank', state: 'completed', expected_revision: 0 }]);
  assertEquals(own.status, 200);
  assertEquals((await taskOf(a, 'sanity:bank')).revision, aBank.revision);
  assertEquals((await taskOf(a, 'sanity:bank')).state, 'in_progress');
  // Operation identity is scoped to the account.
  const op = uuid();
  const ra = await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:x', state: 'in_progress', expected_revision: 0 }], { operation_id: op });
  assertEquals(ra.status, 200);
  assertEquals((await status(b, op)).json.status, 'not_applied');
  const rb = await apply(b, [{ type: 'task.set_state', task_ref: 'sanity:y', state: 'in_progress', expected_revision: 0 }], { operation_id: op });
  assertEquals([rb.status, rb.json.replayed], [200, false]);
  // No token, or only the project key: no identity.
  assertEquals((await apply(null, [{ type: 'task.create_custom', title: 'x', priority: 'Do now' }])).status, 401);
  // Direct table access as account B sees none of A's rows.
  assertEquals((await b.client.from('custom_checklist_tasks').select('id')).data, []);
  const bRows = (await b.client.from('user_tasks').select('user_id')).data!;
  assert(bRows.length > 0 && bRows.every(r => r.user_id === b.id), 'B sees only B rows');
  // Direct writes to service-only tables and direct RPC calls are refused.
  for (const table of ['companion_action_receipts', 'companion_proposals', 'companion_task_reminders', 'companion_task_steps', 'companion_plans', 'companion_feature_gate']) {
    const r = await b.client.from(table).insert({ user_id: b.id } as never);
    assert(r.error, `insert into ${table} must fail`);
  }
  const rpc = await b.client.rpc('companion_apply_actions', {
    p_user_id: a.id, p_operation_id: uuid(), p_contract_version: 1,
    p_authorization: { kind: 'ui_control' },
    p_operations: [{ type: 'task.set_state', task_ref: ref, state: 'completed', expected_revision: revision }],
  });
  assert(rpc.error, 'direct RPC must be denied');
  assertEquals((await taskOf(a, ref)).state, 'not_started');
}});

Deno.test({ name: 'same operation sent 10 times at once produces one task and one outcome', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Open bank account', priority: 'Do now' }];
  const rs = await Promise.all(Array.from({ length: 10 }, () => apply(a, ops, { operation_id: op })));
  assertEquals(rs.map(r => r.status), Array(10).fill(200), JSON.stringify(rs.find(r => r.status !== 200)));
  assertEquals(rs.filter(r => r.json.replayed === false).length, 1);
  assertEquals(new Set(rs.map(r => r.json.results[0].task_ref)).size, 1);
  assertEquals((await read(a)).json.tasks.length, 1);
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(n, 1);
}});

Deno.test({ name: 'same operation on 12 separate database connections at once: one outcome (no HTTP serialization)', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Raced', priority: 'Do now' }];
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    sql`select companion_apply_actions(${a.id}::uuid, ${op}::uuid, 1, ${sql.json({ kind: 'ui_control' })}, ${sql.json(ops)}) as r`
      .then(rows => ({ ok: true, r: rows[0].r })).catch(e => ({ ok: false, e: String(e) }))));
  assertEquals(results.filter(x => !x.ok), [], 'no caller may fail');
  assertEquals(results.filter(x => x.ok && (x as any).r.replayed === false).length, 1);
  assertEquals((await read(a)).json.tasks.length, 1);
}});

Deno.test({ name: 'duplicate arriving while the first attempt is still uncommitted waits, then replays (deterministic interleaving)', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Interleaved', priority: 'Do now' }];
  const call1 = (tx: typeof sql) => tx`select companion_apply_actions(${a.id}::uuid, ${op}::uuid, 1, ${sql.json({ kind: 'ui_control' })}, ${sql.json(ops)}) as r`;
  let commit!: () => void;
  const gate = new Promise<void>(r => (commit = r));
  let firstResult: any;
  const first = sql.begin(async tx => {
    firstResult = (await call1(tx as unknown as typeof sql))[0].r;   // executed, not committed
    await gate;
  });
  await new Promise(r => setTimeout(r, 300));
  const second = call1(sql).then(rows => ({ ok: true, r: rows[0].r })).catch(e => ({ ok: false, e: String(e) }));
  const early = await Promise.race([second.then(() => 'returned'), new Promise(r => setTimeout(() => r('blocked'), 600))]);
  assertEquals(early, 'blocked', 'the duplicate must wait for the first attempt');
  commit();
  await first;
  const s2: any = await second;
  assertEquals(s2.ok, true, JSON.stringify(s2));
  assertEquals([firstResult.replayed, s2.r.replayed], [false, true]);
  assertEquals(s2.r.results[0].task_ref, firstResult.results[0].task_ref);
  assertEquals((await read(a)).json.tasks.length, 1);
}});

Deno.test({ name: 'a stuck writer yields 503 operation_in_flight after the lock timeout; the retry then replays', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Slow', priority: 'Do now' }];
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  const holder = sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(companion_op_lock_key(${a.id}::uuid, ${op}::uuid))`;
    await held;
  });
  try {
    await new Promise(r => setTimeout(r, 300));
    const t0 = Date.now();
    // Own deadline: without a lock timeout the request would wait for the 2 min statement
    // timeout. That must fail this assertion, not hang the suite.
    const r = await Promise.race([
      apply(a, ops, { operation_id: op }),
      new Promise<'deadline'>(res => setTimeout(() => res('deadline'), 10_000)),
    ]);
    assert(r !== 'deadline', 'a stuck writer held the duplicate past 10 s: no lock timeout');
    assertEquals([r.status, r.json.error], [503, 'operation_in_flight']);
    assert(Date.now() - t0 >= 2500 && Date.now() - t0 < 8000, `waited ${Date.now() - t0}ms`);
  } finally {
    release();
    await holder.catch(() => {});
  }
  const retry = await apply(a, ops, { operation_id: op });
  assertEquals([retry.status, retry.json.replayed], [200, false]);
  assertEquals((await read(a)).json.tasks.length, 1);
}});

Deno.test({ name: 'competing writers on one revision: exactly one wins, the rest get a conflict', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a);
  const states = ['in_progress', 'waiting', 'completed', 'not_started', 'in_progress', 'waiting', 'completed', 'in_progress'];
  const rs = await Promise.all(states.map(state =>
    apply(a, [{ type: 'task.set_state', task_ref: ref, state, waiting_reason: 'x', expected_revision: revision }])));
  const ok = rs.filter(r => r.status === 200);
  const conflicts = rs.filter(r => r.status === 409);
  assertEquals([ok.length, conflicts.length], [1, 7], JSON.stringify(rs.map(r => r.status)));
  assertEquals(conflicts[0].json.error, 'revision_conflict');
  const t = await taskOf(a, ref);
  assertEquals(t.revision, revision + 1);
  assertEquals(t.state, ok[0].json.results[0].state);
}});

Deno.test({ name: 'two writers on one custom task revision, interleaved deterministically: the second sees the first and conflicts', ...opts, fn: async () => {
  // The fast race above can pass by luck (the edge runtime may serialize requests).
  // Here both requests are parked behind a held row lock, then released together.
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a);
  const lock = holdRowLock('custom_checklist_tasks', customId(ref));
  await lock.ready;
  let rs: { status: number; json: any }[];
  try {
    const both = Promise.all(['in_progress', 'completed'].map(state =>
      apply(a, [{ type: 'task.set_state', task_ref: ref, state, expected_revision: revision }])));
    assertEquals(await waitForBlockedApplies(2), 2, 'both requests must be parked on the task row before it is released');
    await lock.release();
    rs = await both;
  } finally {
    await lock.release().catch(() => {});
  }
  assertEquals(rs.map(r => r.status).sort(), [200, 409], JSON.stringify(rs.map(r => r.json)));
  assertEquals((await taskOf(a, ref)).revision, revision + 1, 'both writers changed the task');
}});

Deno.test({ name: 'response lost after commit: lookup finds the receipt, retry writes nothing more', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Get phone plan', priority: 'Do soon' }];
  let lost = false;
  try {
    const res = await fetch(`${Deno.env.get('PROBE_API_URL')}/functions/v1/companion-actions`, {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${a.jwt}`, apikey: Deno.env.get('PROBE_ANON_KEY')!, 'x-probe-drop-response': '1' },
      body: JSON.stringify({ contract_version: 1, client: { platform: 'ios' }, action: 'apply', operation_id: op, authorization: { kind: 'ui_control' }, operations: ops }),
    });
    await res.body?.cancel();
  } catch { lost = true; }
  assert(lost, 'the client must not receive the response');
  const s = await status(a, op);
  assertEquals(s.json.status, 'applied');
  const taskRef = s.json.results[0].task_ref;
  const retry = await apply(a, ops, { operation_id: op });
  assertEquals([retry.status, retry.json.replayed, retry.json.results[0].task_ref], [200, true, taskRef]);
  assertEquals((await read(a)).json.tasks.length, 1);
}});

Deno.test({ name: 'in-flight operation reads as pending, never as not applied; the waiting duplicate returns the one outcome', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Held', priority: 'Do now' }];
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  const holder = sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(companion_op_lock_key(${a.id}::uuid, ${op}::uuid))`;
    await held;
  });
  try {
    await new Promise(r => setTimeout(r, 300));
    assertEquals((await status(a, op)).json.status, 'pending');
    const waiting = apply(a, ops, { operation_id: op });
    const early = await Promise.race([waiting.then(() => 'returned'), new Promise(r => setTimeout(() => r('blocked'), 700))]);
    assertEquals(early, 'blocked');
    release();
    await holder;
    const done = await waiting;
    assertEquals([done.status, done.json.replayed], [200, false]);
    assertEquals((await status(a, op)).json.status, 'applied');
    assertEquals((await read(a)).json.tasks.length, 1);
  } finally {
    release();
    await holder.catch(() => {});
  }
}});

Deno.test({ name: 'revision conflict from a legacy client write is detected; nothing is written', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a);
  // Another client (legacy checkbox) completes the task.
  const legacy = await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', customId(ref)).eq('user_id', a.id);
  assertEquals(legacy.error, null);
  const stale = await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'waiting', waiting_reason: 'late', expected_revision: revision }]);
  assertEquals(stale.status, 409);
  assertEquals(stale.json.detail.actual, revision + 1);
  const t = await taskOf(a, ref);
  assertEquals([t.state, t.revision], ['completed', revision + 1]);
  const fresh = await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'in_progress', expected_revision: revision + 1 }]);
  assertEquals(fresh.status, 200);
}});

Deno.test({ name: 'approval binds to exact operations and revisions; unrelated edits do not invalidate it', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const b = await newAccount('bob');
  const x = await makeCustom(a, 'X');
  const y = await makeCustom(a, 'Y');
  const ops = [{ type: 'task.set_state', task_ref: x.ref, state: 'in_progress', expected_revision: x.revision }];
  const p = await prepare(a, ops);
  assertEquals(p.status, 200, JSON.stringify(p.json));
  const auth = { kind: 'approved_proposal', proposal_id: p.json.proposal_id, proposal_revision: p.json.proposal_revision };
  // Preparing wrote nothing.
  assertEquals((await taskOf(a, x.ref)).state, 'not_started');
  // Forged or mismatched evidence is refused.
  assertEquals((await apply(b, ops, { authorization: auth })).status, 403);
  const changed = [{ ...ops[0], state: 'completed' }];
  assertEquals((await apply(a, changed, { authorization: auth })).status, 403);
  assertEquals((await apply(a, ops, { authorization: { ...auth, proposal_revision: 2 } })).status, 403);
  assertEquals((await apply(a, ops, { authorization: { kind: 'approved_proposal', approved: true } })).status, 403);
  assertEquals((await apply(a, ops, { authorization: { kind: 'direct_command', approved: true } })).status, 403);
  assertEquals((await taskOf(a, x.ref)).state, 'not_started');
  // An unrelated edit (task Y) does not invalidate the approval.
  await apply(a, [{ type: 'task.set_state', task_ref: y.ref, state: 'waiting', waiting_reason: 'z', expected_revision: y.revision }]);
  const ok = await apply(a, ops, { authorization: auth });
  assertEquals(ok.status, 200, JSON.stringify(ok.json));
  // An approval is single use for a new operation identity.
  assertEquals((await apply(a, ops, { authorization: auth })).status, 403);
  // A relevant edit (task X) after preparing means the old approval cannot apply.
  const x2 = await makeCustom(a, 'X2');
  const ops2 = [{ type: 'task.set_state', task_ref: x2.ref, state: 'completed', expected_revision: x2.revision }];
  const p2 = await prepare(a, ops2);
  await a.client.from('custom_checklist_tasks').update({ title: 'X2 renamed' }).eq('id', customId(x2.ref));
  const stale = await apply(a, ops2, { authorization: { kind: 'approved_proposal', proposal_id: p2.json.proposal_id, proposal_revision: 1 } });
  assertEquals(stale.status, 409);
  assertEquals((await taskOf(a, x2.ref)).state, 'not_started');
}});

Deno.test({ name: 'direct command evidence must be the account\'s own user message', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const b = await newAccount('bob');
  const mk = async (who: typeof a, role: string) => {
    const c = await who.client.from('conversations').insert({ user_id: who.id }).select('id').single();
    const m = await who.client.from('messages').insert({ conversation_id: c.data!.id, role, content: 'mark my SIN task in progress' }).select('id').single();
    assert(m.data, JSON.stringify(m.error));
    return m.data.id as number;
  };
  const own = await mk(a, 'user');
  const assistant = await mk(a, 'assistant');
  const theirs = await mk(b, 'user');
  const ops = (n: string) => [{ type: 'task.set_state', task_ref: `sanity:${n}`, state: 'in_progress', expected_revision: 0 }];
  assertEquals((await apply(a, ops('a'), { authorization: { kind: 'direct_command', message_id: assistant } })).status, 403);
  assertEquals((await apply(a, ops('b'), { authorization: { kind: 'direct_command', message_id: theirs } })).status, 403);
  assertEquals((await apply(a, ops('c'), { authorization: { kind: 'direct_command', message_id: 999999999 } })).status, 403);
  assertEquals((await apply(a, ops('d'), { authorization: { kind: 'direct_command', message_id: own } })).status, 200);
}});

Deno.test({ name: 'related operations commit together or not at all', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const x = await makeCustom(a, 'X');
  const y = await makeCustom(a, 'Y');
  const op = uuid();
  const bad = [
    { type: 'task.set_state', task_ref: x.ref, state: 'completed', expected_revision: x.revision },
    { type: 'task.set_state', task_ref: y.ref, state: 'completed', expected_revision: y.revision + 5 },
  ];
  assertEquals((await apply(a, bad, { operation_id: op })).status, 409);
  assertEquals((await taskOf(a, x.ref)).state, 'not_started');
  assertEquals((await status(a, op)).json.status, 'not_applied');
  const badTz = [
    { type: 'task.set_state', task_ref: x.ref, state: 'completed', expected_revision: x.revision },
    { type: 'reminder.schedule', task_ref: y.ref, remind_at: new Date(Date.now() + 86400000).toISOString(), time_zone: 'Mars/Olympus', expected_revision: y.revision },
  ];
  assertEquals((await apply(a, badTz)).status, 422);
  assertEquals((await taskOf(a, x.ref)).state, 'not_started');
  const good = [bad[0], { ...bad[1], expected_revision: y.revision }];
  assertEquals((await apply(a, good, { operation_id: op })).status, 200);
  assertEquals([(await taskOf(a, x.ref)).state, (await taskOf(a, y.ref)).state], ['completed', 'completed']);
  // The operation id may not be reused for a different payload.
  assertEquals((await apply(a, bad, { operation_id: op })).status, 409);
}});

Deno.test({ name: 'completing a task stops its reminders in the same transaction; reopening does not restore them', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const sin = 'sanity:sin';
  await apply(a, [{ type: 'task.set_state', task_ref: sin, state: 'in_progress', expected_revision: 0 }]);
  const when = new Date(Date.now() + 7 * 86400000).toISOString();
  const s = await apply(a, [{ type: 'reminder.schedule', task_ref: sin, remind_at: when, time_zone: 'America/Vancouver', expected_revision: 1 }]);
  assertEquals(s.status, 200, JSON.stringify(s.json));
  assertEquals((await taskOf(a, sin)).reminders[0].time_zone, 'America/Vancouver');
  const c = await apply(a, [{ type: 'task.set_state', task_ref: sin, state: 'completed', expected_revision: 1 }]);
  assertEquals(c.status, 200);
  let t = await taskOf(a, sin);
  assertEquals([t.state, t.reminders[0].status], ['completed', 'cancelled']);
  const r = await apply(a, [{ type: 'task.set_state', task_ref: sin, state: 'in_progress', expected_revision: t.revision }]);
  assertEquals(r.status, 200);
  t = await taskOf(a, sin);
  assertEquals([t.state, t.reminders.map((x: any) => x.status)], ['in_progress', ['cancelled']]);
  const [row] = await sql`select cancelled_reason from companion_task_reminders where user_id = ${a.id}`;
  assertEquals(row.cancelled_reason, 'task_completed');
  // Reminders on completed or removed tasks are refused.
  const none = await apply(a, [{ type: 'task.set_state', task_ref: sin, state: 'completed', expected_revision: t.revision }]);
  assertEquals(none.status, 200);
  const late = await apply(a, [{ type: 'reminder.schedule', task_ref: sin, remind_at: when, time_zone: 'America/Vancouver', expected_revision: t.revision + 1 }]);
  assertEquals(late.status, 422);
}});

Deno.test({ name: 'removal needs confirmation, hides the task from old clients, is reversible, keeps reminders stopped', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a, 'Remove me');
  const when = new Date(Date.now() + 86400000).toISOString();
  await apply(a, [{ type: 'reminder.schedule', task_ref: ref, remind_at: when, time_zone: 'America/Toronto', expected_revision: revision }]);
  const rm = [{ type: 'task.remove', task_ref: ref, expected_revision: revision }];
  // A direct command, or a UI control without the confirmation flag, cannot remove.
  const m = await a.client.from('conversations').insert({ user_id: a.id }).select('id').single();
  const msg = await a.client.from('messages').insert({ conversation_id: m.data!.id, role: 'user', content: 'delete it' }).select('id').single();
  assertEquals((await apply(a, rm, { authorization: { kind: 'direct_command', message_id: msg.data!.id, removal_confirmed: true } })).status, 403);
  assertEquals((await apply(a, rm, { authorization: { kind: 'ui_control' } })).status, 403);
  assertEquals((await taskOf(a, ref)).removed, false);
  const ok = await apply(a, rm, { authorization: { kind: 'ui_control', removal_confirmed: true } });
  assertEquals(ok.status, 200, JSON.stringify(ok.json));
  // Old clients no longer see it; the action service still does, marked removed.
  assertEquals((await a.client.from('custom_checklist_tasks').select('id').eq('id', customId(ref))).data, []);
  const t = await taskOf(a, ref);
  assertEquals([t.removed, t.reminders[0].status], [true, 'cancelled']);
  // Undo: restore with the current revision. The old reminder stays cancelled.
  const back = await apply(a, [{ type: 'task.restore', task_ref: ref, expected_revision: t.revision }]);
  assertEquals(back.status, 200);
  assertEquals((await a.client.from('custom_checklist_tasks').select('id').eq('id', customId(ref))).data?.length, 1);
  assertEquals((await taskOf(a, ref)).reminders[0].status, 'cancelled');
  // A stale undo does not overwrite a newer edit.
  const stale = await apply(a, [{ type: 'task.restore', task_ref: ref, expected_revision: t.revision }]);
  assertEquals(stale.status, 409);
  // Content-backed removal maps to the existing dismissed_at column.
  const r1 = await apply(a, [{ type: 'task.remove', task_ref: 'sanity:ird', expected_revision: 0 }], { authorization: { kind: 'ui_control', removal_confirmed: true } });
  assertEquals(r1.status, 200);
  const [d] = (await a.client.from('user_tasks').select('dismissed_at').eq('sanity_checklist_id', 'ird')).data!;
  assert(d.dismissed_at);
}});

Deno.test({ name: 'contract validation and feature gating', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const ops = [{ type: 'task.create_custom', title: 'Gate', priority: 'Do now' }];
  assertEquals((await apply(a, [{ type: 'task.delete_everything' }])).status, 422);
  assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: 'custom:1', state: 'done', expected_revision: 1 }])).status, 422);
  assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: 'custom:1', state: 'completed' }])).status, 422);
  assertEquals((await call(a, { contract_version: 2, client: { platform: 'ios' }, action: 'read' })).status, 426);
  const v2 = await call(a, { contract_version: 2, client: { platform: 'ios' }, action: 'read' });
  assertEquals(v2.json.supported, { min: 1, max: 1 });
  try {
    await sql`update companion_feature_gate set allowed_platforms = '{web}'`;
    assertEquals((await apply(a, ops)).status, 403);
    await sql`update companion_feature_gate set allowed_platforms = '{ios,android,web}', enabled = false`;
    const off = await apply(a, ops);
    assertEquals([off.status, off.json.error], [403, 'feature_disabled']);
    // Legacy writes do not depend on the gate.
    const legacy = await a.client.from('custom_checklist_tasks').insert({ user_id: a.id, priority: 'Do now', title: 'Legacy while off' }).select('*').single();
    assertEquals(legacy.error, null);
    await sql`update companion_feature_gate set enabled = true`;
    assertEquals((await apply(a, ops)).status, 200);
  } finally {
    await openGate();
  }
}});

Deno.test({ name: 'legacy writes map onto rich state without destroying it', ...opts, fn: async () => {
  const a = await newAccount('alice');
  // Content-backed task in Waiting.
  await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:bank', state: 'waiting', waiting_reason: 'Branch appointment', expected_revision: 0 }]);
  // Legacy dismissal upsert + restore (what setChecklistItemDismissed sends).
  const upsert = (extra: Record<string, unknown>) => a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 'bank', ...extra }, { onConflict: 'user_id,sanity_checklist_id' });
  assertEquals((await upsert({ dismissed_at: new Date().toISOString() })).error, null);
  let t = await taskOf(a, 'sanity:bank');
  assertEquals([t.state, t.waiting_reason, t.removed], ['waiting', 'Branch appointment', true]);
  assertEquals((await upsert({ dismissed_at: null })).error, null);
  t = await taskOf(a, 'sanity:bank');
  assertEquals([t.state, t.removed], ['waiting', false]);
  // Legacy uncheck on an unfinished task changes nothing but the revision.
  const before = t.revision;
  assertEquals((await a.client.from('user_tasks').update({ completed: false, completed_at: null }).eq('user_id', a.id).eq('sanity_checklist_id', 'bank')).error, null);
  t = await taskOf(a, 'sanity:bank');
  assertEquals([t.state, t.waiting_reason, t.revision > before], ['waiting', 'Branch appointment', true]);
  // Legacy completion wins: the task is completed and the waiting detail is cleared.
  assertEquals((await upsert({ completed: true, completed_at: new Date().toISOString(), task_id: null })).error, null);
  t = await taskOf(a, 'sanity:bank');
  assertEquals([t.state, t.waiting_reason], ['completed', null]);
  // Legacy uncheck of a completed task: Not started.
  await a.client.from('user_tasks').update({ completed: false, completed_at: null }).eq('user_id', a.id).eq('sanity_checklist_id', 'bank');
  assertEquals((await taskOf(a, 'sanity:bank')).state, 'not_started');

  // Custom task: legacy completion while In progress; legacy hard delete cleans dependents.
  const c = await makeCustom(a, 'Custom');
  await apply(a, [{ type: 'task.set_state', task_ref: c.ref, state: 'in_progress', expected_revision: c.revision }]);
  const id = customId(c.ref);
  const when = new Date(Date.now() + 86400000).toISOString();
  await apply(a, [{ type: 'reminder.schedule', task_ref: c.ref, remind_at: when, time_zone: 'UTC', expected_revision: c.revision + 1 }]);
  const [plan] = await sql`insert into companion_plans (user_id, goal) values (${a.id}, 'Arrive') returning id`;
  await sql`insert into companion_plan_tasks (plan_id, task_ref) values (${plan.id}, ${c.ref})`;
  await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id).eq('user_id', a.id);
  let ct = await taskOf(a, c.ref);
  assertEquals([ct.state, ct.reminders[0].status], ['completed', 'cancelled']);
  const del = await a.client.from('custom_checklist_tasks').delete().eq('id', id).eq('user_id', a.id);
  assertEquals(del.error, null);
  assertEquals(await taskOf(a, c.ref), undefined);
  const [{ n }] = await sql`select count(*)::int n from companion_plan_tasks where plan_id = ${plan.id}`;
  assertEquals(n, 0);
}});

Deno.test({ name: 'account deletion still cascades through the new tables', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const c = await makeCustom(a, 'Gone');
  await apply(a, [{ type: 'reminder.schedule', task_ref: c.ref, remind_at: new Date(Date.now() + 86400000).toISOString(), time_zone: 'UTC', expected_revision: c.revision }]);
  await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:sin', state: 'waiting', waiting_reason: 'x', expected_revision: 0 }]);
  const r = await a.client.rpc('delete_user');
  assertEquals(r.error, null);
  for (const table of ['companion_action_receipts', 'companion_task_reminders', 'custom_checklist_tasks', 'user_tasks']) {
    const [{ n }] = await sql`select count(*)::int n from ${sql(table)} where user_id = ${a.id}`;
    assertEquals(n, 0, table);
  }
}});

Deno.test({ name: 'receipt keeps authorization evidence and before/after revisions', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a);
  const op = uuid();
  await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'in_progress', expected_revision: revision }], { operation_id: op });
  const s = await status(a, op);
  assertEquals([s.json.results[0].before_revision, s.json.results[0].after_revision], [revision, revision + 1]);
  const [r] = await sql`select authorization_evidence, contract_version, request_hash from companion_action_receipts where user_id = ${a.id} and operation_id = ${op}`;
  assertEquals(r.authorization_evidence, { kind: 'ui_control' });
  assertEquals(r.contract_version, 1);
  assertEquals(r.request_hash.length, 64);
  assertNotEquals(r.request_hash, '');
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
