// Regressions for the four defects the #360 review reproduced. Each test is
// written at the public boundary (HTTP) and was run red against the reviewed
// candidate (fb177a67) before the fix. Direct SQL is used only to hold a lock,
// count rows no public path exposes, and prove the table-level guard.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  apply, applyCandidate, candidateApplied, customId, holdProposalLock, makeCustom, newAccount,
  openGate, prepare, read, sql, status, taskOf, uuid, waitForBlockedApplies,
} from './support.ts';

if (!(await candidateApplied())) await applyCandidate('up');
await openGate();

const opts = { sanitizeOps: false, sanitizeResources: false };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

// ------------------------------------------------------------------ 1. proposals

Deno.test({ name: 'one approved proposal is consumed exactly once across different operation ids', ...opts, fn: async () => {
  const a = await newAccount('alice');
  // Operations that create rows: a double consume leaves two tasks, which revisions cannot mask.
  const ops = [{ type: 'task.create_custom', title: 'Proposed phone plan', priority: 'Do soon' }];
  const p = await prepare(a, ops);
  assertEquals(p.status, 200, JSON.stringify(p.json));
  const auth = { kind: 'approved_proposal', proposal_id: p.json.proposal_id, proposal_revision: p.json.proposal_revision };

  const lock = holdProposalLock(p.json.proposal_id);
  await lock.ready;
  let rs: { status: number; json: any }[];
  try {
    const both = Promise.all([
      apply(a, ops, { operation_id: uuid(), authorization: auth }),
      apply(a, ops, { operation_id: uuid(), authorization: auth }),
    ]);
    assertEquals(await waitForBlockedApplies(2), 2, 'both requests must be parked on the proposal before it is released');
    await lock.release();
    rs = await both;
  } finally {
    await lock.release().catch(() => {});
  }
  assertEquals(rs.map(r => r.status).sort(), [200, 403], JSON.stringify(rs));
  assertEquals((await read(a)).json.tasks.length, 1, 'the proposal created more than one task');
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(n, 1);
  const [prop] = await sql`select status from companion_proposals where id = ${p.json.proposal_id}`;
  assertEquals(prop.status, 'applied');
}});

Deno.test({ name: 'a failed apply leaves the proposal unconsumed and usable', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const x = await makeCustom(a, 'X');
  const ops = [{ type: 'task.set_state', task_ref: x.ref, state: 'in_progress', expected_revision: x.revision }];
  const p = await prepare(a, ops);
  const auth = { kind: 'approved_proposal', proposal_id: p.json.proposal_id, proposal_revision: p.json.proposal_revision };
  // A legacy write moves the revision on: the apply conflicts and must roll back the consume too.
  await a.client.from('custom_checklist_tasks').update({ title: 'X renamed' }).eq('id', customId(x.ref));
  assertEquals((await apply(a, ops, { authorization: auth })).status, 409);
  const [prop] = await sql`select status from companion_proposals where id = ${p.json.proposal_id}`;
  assertEquals(prop.status, 'draft');
}});

// ------------------------------------------------------------ 3. set_state shape

Deno.test({ name: 'set_state with a missing, null or invalid state is refused and writes nothing', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a, 'Finished');
  const done = await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'completed', expected_revision: revision }]);
  assertEquals(done.status, 200);
  const before = await taskOf(a, ref);
  const [{ n: receiptsBefore }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  const bad: Record<string, unknown>[] = [
    { type: 'task.set_state', task_ref: ref, expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: null, expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: '', expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: 5, expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: ['completed'], expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: { v: 'completed' }, expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: 'Completed', expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: 'waiting', waiting_reason: 7, expected_revision: before.revision },
    { type: 'task.set_state', task_ref: ref, state: 'waiting', waiting_reason: { a: 1 }, expected_revision: before.revision },
  ];
  for (const op of bad) {
    const opId = uuid();
    const r = await apply(a, [op], { operation_id: opId });
    assertEquals(r.status, 422, `${JSON.stringify(op)} -> ${JSON.stringify(r.json)}`);
    assertEquals((await status(a, opId)).json.status, 'not_applied');
  }
  const after = await taskOf(a, ref);
  assertEquals([after.state, after.revision], ['completed', before.revision], 'a refused request changed the task');
  const [{ n: receiptsAfter }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(receiptsAfter, receiptsBefore);
}});

Deno.test({ name: 'set_state with a missing or null state does not reopen a completed content-backed task', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const done = await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:sin-card', state: 'completed', expected_revision: 0 }]);
  assertEquals(done.status, 200, JSON.stringify(done.json));
  const before = await taskOf(a, 'sanity:sin-card');
  for (const op of [
    { type: 'task.set_state', task_ref: 'sanity:sin-card', expected_revision: before.revision },
    { type: 'task.set_state', task_ref: 'sanity:sin-card', state: null, expected_revision: before.revision },
  ]) {
    const opId = uuid();
    const r = await apply(a, [op], { operation_id: opId });
    assertEquals(r.status, 422, `${JSON.stringify(op)} -> ${r.status} ${JSON.stringify(r.json)}`);
    assertEquals((await status(a, opId)).json.status, 'not_applied');
  }
  const after = await taskOf(a, 'sanity:sin-card');
  assertEquals([after.state, after.revision], ['completed', before.revision], 'a refused request reopened the task');
  // The legacy client still reads it as completed.
  const legacy = await a.client.from('user_tasks').select('completed').eq('sanity_checklist_id', 'sin-card').single();
  assertEquals(legacy.data?.completed, true);
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(n, 1, 'only the completing request may have a receipt');
}});

Deno.test({ name: 'a content-backed task with no row is not created by an invalid state', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const r = await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:never-written', expected_revision: 0 }]);
  assertEquals(r.status, 422);
  assertEquals(await taskOf(a, 'sanity:never-written'), undefined);
}});

Deno.test({ name: 'other malformed operation fields are 422, never a 500, and write nothing', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a, 'Target');
  const base = { task_ref: ref, expected_revision: revision };
  const cases: Record<string, unknown>[] = [
    { type: 'task.create_custom', priority: 'Do now' },
    { type: 'task.create_custom', title: null, priority: 'Do now' },
    { type: 'task.create_custom', title: '   ', priority: 'Do now' },
    { type: 'task.create_custom', title: 'x', priority: 'Whenever' },
    { type: 'task.create_custom', title: 'x' },
    { type: 'task.create_custom', title: 'x', priority: 'Do now', description: 3 },
    { type: 'task.set_state', state: 'in_progress', task_ref: ref, expected_revision: 1.5 },
    { type: 'task.set_state', state: 'in_progress', task_ref: ref, expected_revision: -1 },
    { type: 'task.set_state', state: 'in_progress', task_ref: ref, expected_revision: 1e30 },
    { type: 'reminder.schedule', ...base },
    { type: 'reminder.schedule', ...base, remind_at: 'not a date', time_zone: 'UTC' },
    { type: 'reminder.schedule', ...base, remind_at: tomorrow() },
    { type: 'reminder.schedule', ...base, remind_at: tomorrow(), time_zone: null },
    { type: 'reminder.schedule', ...base, remind_at: 12345, time_zone: 'UTC' },
  ];
  for (const op of cases) {
    const r = await apply(a, [op]);
    assertEquals(r.status, 422, `${JSON.stringify(op)} -> ${r.status} ${JSON.stringify(r.json)}`);
  }
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(n, 1, 'only the setup create may have a receipt');
  assertEquals((await read(a)).json.tasks.length, 1);
  const [{ r }] = await sql`select count(*)::int r from companion_task_reminders where user_id = ${a.id}`;
  assertEquals(r, 0);
}});

Deno.test({ name: 'malformed authorization numbers are refused with 403, never a 500', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const ops = [{ type: 'task.create_custom', title: 'Auth shape', priority: 'Do now' }];
  const bads: unknown[] = [
    { kind: 'direct_command', message_id: 4294967297 },
    { kind: 'direct_command', message_id: 1.5 },
    { kind: 'direct_command', message_id: '7' },
    { kind: 'approved_proposal', proposal_id: uuid(), proposal_revision: 4294967297 },
    { kind: 'approved_proposal', proposal_id: uuid(), proposal_revision: 1.5 },
    { kind: 'approved_proposal', proposal_id: 'not-a-uuid', proposal_revision: 1 },
  ];
  for (const authorization of bads) {
    const r = await apply(a, ops, { authorization });
    assertEquals(r.status, 403, `${JSON.stringify(authorization)} -> ${r.status} ${JSON.stringify(r.json)}`);
  }
  assertEquals((await read(a)).json.tasks.length, 0);
}});

// ------------------------------------------------------- 4. canonical custom refs

Deno.test({ name: 'a zero-padded or overflowing custom reference is refused before anything is stored', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a, 'Canonical');
  const id = customId(ref);
  const aliases = [
    `custom:0${id}`, `custom:00${id}`, `custom:${'0'.repeat(14)}${id}`, 'custom:0', 'custom:00',
    `custom:+${id}`, `custom: ${id}`, `custom:${id} `, `custom:${id}.0`,
    `custom:${BigInt(id) + 2n ** 64n}`, 'custom:9223372036854775808', 'custom:99999999999999999999',
    `custom:${'9'.repeat(40)}`,
  ];
  for (const alias of aliases) {
    for (const op of [
      { type: 'task.set_state', task_ref: alias, state: 'completed', expected_revision: revision },
      { type: 'task.remove', task_ref: alias, expected_revision: revision },
      { type: 'task.restore', task_ref: alias, expected_revision: revision },
      { type: 'reminder.schedule', task_ref: alias, remind_at: tomorrow(), time_zone: 'UTC', expected_revision: revision },
    ]) {
      const r = await apply(a, [op], { authorization: { kind: 'ui_control', removal_confirmed: true } });
      assertEquals(r.status, 422, `${op.type} ${JSON.stringify(alias)} -> ${r.status} ${JSON.stringify(r.json)}`);
    }
    assertEquals((await prepare(a, [{ type: 'task.set_state', task_ref: alias, state: 'completed', expected_revision: revision }])).status, 422, `prepare ${alias}`);
  }
  const t = await taskOf(a, ref);
  assertEquals([t.state, t.revision, t.removed, t.reminders], ['not_started', revision, false, []]);
  const [{ r, p }] = await sql`select (select count(*)::int from companion_task_reminders where user_id = ${a.id}) r,
                                      (select count(*)::int from companion_proposals where user_id = ${a.id}) p`;
  assertEquals([r, p], [0, 0], 'an alias was persisted');
}});

Deno.test({ name: 'a reminder cannot hide under an alias and survive completion of the canonical task', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, revision } = await makeCustom(a, 'Reminded');
  const alias = `custom:0${customId(ref)}`;
  const s = await apply(a, [{ type: 'reminder.schedule', task_ref: alias, remind_at: tomorrow(), time_zone: 'UTC', expected_revision: revision }]);
  assertEquals(s.status, 422);
  const ok = await apply(a, [{ type: 'reminder.schedule', task_ref: ref, remind_at: tomorrow(), time_zone: 'UTC', expected_revision: revision }]);
  assertEquals(ok.status, 200, JSON.stringify(ok.json));
  const c = await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'completed', expected_revision: revision }]);
  assertEquals(c.status, 200, JSON.stringify(c.json));
  const rows = await sql`select task_ref, status from companion_task_reminders where user_id = ${a.id}`;
  assertEquals(rows.map(x => [x.task_ref, x.status]), [[ref, 'cancelled']]);
  assertEquals(rows.filter(x => x.status === 'pending').length, 0, 'a pending reminder survived completion');
}});

Deno.test({ name: 'a content-backed reference must be a published Sanity id; draft and padded spellings are refused', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const aliases = ['sanity:drafts.sin-card', 'sanity:versions.r1.sin-card', 'sanity: sin-card', 'sanity:sin-card ',
    'sanity:sin card', 'sanity:', 'sanity:.sin-card', `sanity:${'a'.repeat(129)}`, 'sanity:sin-card\n', 'Sanity:sin-card'];
  for (const alias of aliases) {
    const r = await apply(a, [{ type: 'task.set_state', task_ref: alias, state: 'completed', expected_revision: 0 }]);
    assertEquals(r.status, 422, `${JSON.stringify(alias)} -> ${r.status} ${JSON.stringify(r.json)}`);
  }
  const ok = await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:5f1c2b9e-0d7a-4c3e-9b1a-2e8f6d4c3b21', state: 'completed', expected_revision: 0 }]);
  assertEquals(ok.status, 200, JSON.stringify(ok.json));
  const rows = (await a.client.from('user_tasks').select('sanity_checklist_id')).data!;
  assertEquals(rows.map(r => r.sanity_checklist_id), ['5f1c2b9e-0d7a-4c3e-9b1a-2e8f6d4c3b21'], 'an alias created a row');
}});

Deno.test({ name: 'tables that hold a task reference reject non-canonical custom references', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const [plan] = await sql`insert into companion_plans (user_id, goal) values (${a.id}, 'Arrive') returning id`;
  const aliases = ['custom:044', 'custom:0', 'custom:00044', 'custom:9223372036854775808', 'custom:', 'custom:4a', 'other:1', 'sanity:', 'sanity:drafts.sin-card', 'sanity: sin-card'];
  for (const alias of aliases) {
    for (const [table, run] of [
      ['companion_task_reminders', () => sql`insert into companion_task_reminders (user_id, task_ref, remind_at, time_zone) values (${a.id}, ${alias}, now() + interval '1 day', 'UTC')`],
      ['companion_task_steps', () => sql`insert into companion_task_steps (user_id, task_ref, title) values (${a.id}, ${alias}, 'step')`],
      ['companion_plan_tasks', () => sql`insert into companion_plan_tasks (plan_id, task_ref) values (${plan.id}, ${alias})`],
    ] as const) {
      const err = await assertRejects(async () => { await run(); }, Error, undefined, `${table} accepted ${alias}`);
      assertEquals((err as any).code, '23514', `${table} ${alias}`);
    }
  }
  // Canonical references still go in.
  await sql`insert into companion_plan_tasks (plan_id, task_ref) values (${plan.id}, 'custom:44'), (${plan.id}, 'sanity:sin-card')`;
  const [{ n }] = await sql`select count(*)::int n from companion_plan_tasks where plan_id = ${plan.id}`;
  assertEquals(n, 2);
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
