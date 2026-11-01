// Rollback and re-application (#360). Running down.sql then up.sql again must not
// lose the operation identity the first run recorded: a client that retries an
// operation after the round trip must get the original outcome, not a second write.
// Ends with the candidate applied, like every other file.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, applyCandidate, candidateApplied, customId, makeCustom, newAccount, openGate, prepare,
  read, sql, status, taskOf, uuid,
} from './support.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

async function roundTrip() {
  await applyCandidate('down');
  await applyCandidate('up');
  await openGate();
}

Deno.test({ name: 'create, roll back, re-apply, enable: status and retry still see the original outcome', ...opts, fn: async () => {
  if (!(await candidateApplied())) await applyCandidate('up');
  await openGate();
  const a = await newAccount('alice');
  const op = uuid();
  const ops = [{ type: 'task.create_custom', title: 'Get phone plan', priority: 'Do soon' }];
  const first = await apply(a, ops, { operation_id: op });
  assertEquals(first.status, 200, JSON.stringify(first.json));
  const ref = first.json.results[0].task_ref;

  await roundTrip();

  const s = await status(a, op);
  assertEquals(s.json.status, 'applied', `status after rollback and re-apply: ${JSON.stringify(s.json)}`);
  assertEquals(s.json.results[0].task_ref, ref);
  const retry = await apply(a, ops, { operation_id: op });
  assertEquals([retry.status, retry.json.replayed, retry.json.results[0].task_ref], [200, true, ref]);
  assertEquals((await read(a)).json.tasks.length, 1, 'the retry created a duplicate task');
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(n, 1);
}});

Deno.test({ name: 'rich state, reminders, removal and consumed approvals survive rollback and re-apply', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const wait = await makeCustom(a, 'Waiting task');
  await apply(a, [{ type: 'task.set_state', task_ref: wait.ref, state: 'waiting', waiting_reason: 'Letter', expected_revision: wait.revision }]);
  await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:bank', state: 'in_progress', expected_revision: 0 }]);
  const removed = await makeCustom(a, 'Removed task');
  await apply(a, [{ type: 'reminder.schedule', task_ref: wait.ref, remind_at: tomorrow(), time_zone: 'America/Vancouver', expected_revision: wait.revision + 1 }]);
  await apply(a, [{ type: 'task.remove', task_ref: removed.ref, expected_revision: removed.revision }], { authorization: { kind: 'ui_control', removal_confirmed: true } });
  // A consumed approval and an unused one.
  const ops = [{ type: 'task.create_custom', title: 'From proposal', priority: 'Do now' }];
  const used = await prepare(a, ops);
  const usedAuth = { kind: 'approved_proposal', proposal_id: used.json.proposal_id, proposal_revision: used.json.proposal_revision };
  assertEquals((await apply(a, ops, { authorization: usedAuth })).status, 200);
  const unused = await prepare(a, ops);
  const before = {
    wait: await taskOf(a, wait.ref), bank: await taskOf(a, 'sanity:bank'), removed: await taskOf(a, removed.ref),
  };
  const [steps] = await sql`insert into companion_plans (user_id, goal) values (${a.id}, 'Arrive') returning id`;
  await sql`insert into companion_plan_tasks (plan_id, task_ref) values (${steps.id}, ${wait.ref})`;
  await sql`insert into companion_task_steps (user_id, task_ref, title) values (${a.id}, ${wait.ref}, 'Call the bank')`;

  await roundTrip();
  await roundTrip();   // a second cycle must not duplicate anything

  const after = {
    wait: await taskOf(a, wait.ref), bank: await taskOf(a, 'sanity:bank'), removed: await taskOf(a, removed.ref),
  };
  // Each re-application moves every revision one step on (two round trips: two steps). The full
  // rollback stops the pending reminder (rollback reminder policy); the row itself is kept.
  // Nothing else changes.
  const rev = (t: any, by: number) => ({ ...t, revision: t.revision + by });
  assertEquals(before.wait.reminders.map((r: any) => r.status), ['pending']);
  const stoppedByRollback = (t: any) => ({ ...t, reminders: t.reminders.map((r: any) => ({ ...r, status: 'cancelled' })) });
  assertEquals(after, { wait: stoppedByRollback(rev(before.wait, 2)), bank: rev(before.bank, 2), removed: rev(before.removed, 2) },
    'task state changed over the rollback round trip, or revisions did not advance');
  assertEquals((await a.client.from('custom_checklist_tasks').select('id').eq('id', customId(removed.ref))).data, [], 'a removed task is visible to old clients again');
  assertEquals((await apply(a, ops, { authorization: usedAuth })).status, 403, 'a consumed approval became usable again');
  assertEquals((await apply(a, ops, { authorization: { kind: 'approved_proposal', proposal_id: unused.json.proposal_id, proposal_revision: unused.json.proposal_revision } })).status, 200);
  const [c] = await sql`select (select count(*)::int from companion_task_reminders where user_id = ${a.id}) reminders,
                               (select count(*)::int from companion_task_steps where user_id = ${a.id}) steps,
                               (select count(*)::int from companion_plan_tasks where plan_id = ${steps.id}) plan_tasks,
                               (select count(*)::int from companion_action_receipts where user_id = ${a.id}) receipts`;
  assertEquals({ ...c }, { reminders: 1, steps: 1, plan_tasks: 1, receipts: 8 });
}});

Deno.test({ name: 'rollback window: legacy writes made while rolled back are not overwritten by the restore', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const w = await makeCustom(a, 'Window');
  await apply(a, [{ type: 'task.set_state', task_ref: w.ref, state: 'waiting', waiting_reason: 'x', expected_revision: w.revision }]);
  const when = await taskOf(a, w.ref);
  await applyCandidate('down');
  // Old client completes the task while the feature is rolled back.
  const done = await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', customId(w.ref)).eq('user_id', a.id);
  assertEquals(done.error, null);
  await applyCandidate('up');
  await openGate();
  const t = await taskOf(a, w.ref);
  assertEquals([t.state, t.waiting_reason], ['completed', null], 'a restored waiting state contradicted a legacy completion');
  assert(t.revision > when.revision, 'a stale approval or expected_revision would still match');
}});

Deno.test({ name: 'rollback window: every revision held from before the rollback is stale after re-application', ...opts, fn: async () => {
  const a = await newAccount('alice');
  const plain = await makeCustom(a, 'Never touched');            // revision 1, no rich state
  const renamed = await makeCustom(a, 'Renamed while rolled back');
  await apply(a, [{ type: 'task.set_state', task_ref: 'sanity:untouched', state: 'in_progress', expected_revision: 0 }]);
  const bank = await taskOf(a, 'sanity:untouched');
  await applyCandidate('down');
  // A legacy edit that touches no completion or removal column.
  const edit = await a.client.from('custom_checklist_tasks').update({ title: 'New title' }).eq('id', customId(renamed.ref)).eq('user_id', a.id);
  assertEquals(edit.error, null);
  await applyCandidate('up');
  await openGate();
  for (const [ref, revision] of [[plain.ref, plain.revision], [renamed.ref, renamed.revision], ['sanity:untouched', bank.revision]] as const) {
    const r = await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'completed', expected_revision: revision }]);
    assertEquals(r.status, 409, `${ref} accepted a pre-rollback revision: ${JSON.stringify(r.json)}`);
  }
  assertEquals((await taskOf(a, renamed.ref)).title, 'New title');
}});

Deno.test({ name: 'rollback window: an account deleted while rolled back is neither restored nor kept in the archive', ...opts, fn: async () => {
  const a = await newAccount('doomed');
  await makeCustom(a, 'Gone');
  await applyCandidate('down');
  const r = await a.client.rpc('delete_user');
  assertEquals(r.error, null);
  await applyCandidate('up');
  await openGate();
  const [{ n }] = await sql`select count(*)::int n from companion_rollback_archive where row_data->>'user_id' = ${a.id}`;
  assertEquals(n, 0, 'archive kept a deleted account\'s data');
  const [{ m }] = await sql`select count(*)::int m from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(m, 0);
}});

// Spec review round 2: the restore ran before the triggers exist, so a legacy completion,
// dismissal or delete made while rolled back left its archived reminder pending and its
// plan reference in place. Re-application must keep every reminder row (history), never
// restart a stopped schedule, and drop plan references to deleted tasks. Since the rollback
// reminder policy (Spec review round 3), down.sql stops every pending reminder, the open
// task's included, so all of them read 'schema_rollback' instead of the reason the triggers
// would have given.
Deno.test({ name: 'rollback window: legacy completion, dismissal and delete stop restored reminders and drop deleted plan references', ...opts, fn: async () => {
  const a = await newAccount('window');
  const customDone = await makeCustom(a, 'Completed while rolled back');
  const customDelete = await makeCustom(a, 'Deleted while rolled back');
  const customOpen = await makeCustom(a, 'Still open');
  const customReopened = await makeCustom(a, 'Completed before, reopened while rolled back');
  const contentDone = 'sanity:window-content-done';
  const contentDismiss = 'sanity:window-content-dismiss';
  for (const ref of [contentDone, contentDismiss]) {
    assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'waiting', waiting_reason: 'Letter', expected_revision: 0 }])).status, 200);
  }
  const refs = [customDone.ref, contentDone, contentDismiss, customDelete.ref, customOpen.ref, customReopened.ref];
  const scheduleOp: Record<string, { op: string; ops: unknown[]; reminder: string }> = {};
  for (const ref of refs) {
    const op = uuid();
    const ops = [{ type: 'reminder.schedule', task_ref: ref, expected_revision: (await taskOf(a, ref)).revision, remind_at: tomorrow(), time_zone: 'America/Vancouver' }];
    const r = await apply(a, ops, { operation_id: op });
    assertEquals(r.status, 200, JSON.stringify(r.json));
    scheduleOp[ref] = { op, ops, reminder: r.json.results[0].reminder_id };
  }
  // Stopped before the rollback: completed through the service, so its reminder is cancelled.
  const reopened = await taskOf(a, customReopened.ref);
  assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: customReopened.ref, state: 'completed', expected_revision: reopened.revision }])).status, 200);
  const [stopped] = await sql`select status, cancelled_reason, cancelled_at from companion_task_reminders where id = ${scheduleOp[customReopened.ref].reminder}`;
  assertEquals([stopped.status, stopped.cancelled_reason], ['cancelled', 'task_completed']);
  const [plan] = await sql`insert into companion_plans (user_id, goal) values (${a.id}, 'Arrive') returning id`;
  for (const ref of [customDelete.ref, customOpen.ref, contentDismiss]) {
    await sql`insert into companion_plan_tasks (plan_id, task_ref) values (${plan.id}, ${ref})`;
  }

  await sql`update companion_feature_gate set enabled = false`;
  await applyCandidate('down');
  const now = new Date().toISOString();
  const writes = [
    await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: now }).eq('id', customId(customDone.ref)),
    await a.client.from('user_tasks').update({ completed: true, completed_at: now }).eq('sanity_checklist_id', 'window-content-done'),
    await a.client.from('user_tasks').update({ dismissed_at: now }).eq('sanity_checklist_id', 'window-content-dismiss'),
    await a.client.from('custom_checklist_tasks').delete().eq('id', customId(customDelete.ref)),
    await a.client.from('custom_checklist_tasks').update({ completed: false, completed_at: null }).eq('id', customId(customReopened.ref)),
  ];
  for (const w of writes) assertEquals(w.error, null);
  await applyCandidate('up');
  await openGate();

  // Public read: what the client shows for each task and its reminders.
  const shown: Record<string, unknown> = {};
  for (const ref of refs) {
    const t = await taskOf(a, ref);
    shown[ref] = t ? { state: t.state, removed: t.removed, reminders: t.reminders.map((r: any) => r.status) } : null;
  }
  assertEquals(shown, {
    [customDone.ref]: { state: 'completed', removed: false, reminders: ['cancelled'] },
    [contentDone]: { state: 'completed', removed: false, reminders: ['cancelled'] },
    [contentDismiss]: { state: 'waiting', removed: true, reminders: ['cancelled'] },
    [customDelete.ref]: null,
    [customOpen.ref]: { state: 'not_started', removed: false, reminders: ['cancelled'] },
    [customReopened.ref]: { state: 'not_started', removed: false, reminders: ['cancelled'] },
  }, 'a re-applied reminder contradicts a legacy write made while rolled back');

  // Stored dependent records, read as the account: every reminder row kept, with the reason.
  const stored = async () => (await a.client.from('companion_task_reminders')
    .select('id, task_ref, status, cancelled_reason, cancelled_at').order('task_ref')).data!;
  const rows = await stored();
  assertEquals(Object.fromEntries(rows.map((r) => [r.task_ref, [r.status, r.cancelled_reason]])), {
    [customDone.ref]: ['cancelled', 'schema_rollback'],
    [contentDone]: ['cancelled', 'schema_rollback'],
    [contentDismiss]: ['cancelled', 'schema_rollback'],
    [customDelete.ref]: ['cancelled', 'schema_rollback'],
    [customOpen.ref]: ['cancelled', 'schema_rollback'],
    [customReopened.ref]: ['cancelled', 'task_completed'],
  });
  const kept = rows.find((r) => r.task_ref === customReopened.ref)!;
  assertEquals(new Date(kept.cancelled_at).getTime(), new Date(stopped.cancelled_at).getTime(), 'the history of a schedule stopped before the rollback was rewritten');
  const links = (await a.client.from('companion_plan_tasks').select('task_ref').eq('plan_id', plan.id).order('task_ref')).data!.map((l) => l.task_ref);
  assertEquals(links, [customOpen.ref, contentDismiss].sort(), 'a plan still references a task deleted while rolled back, or lost a kept one');

  // Exact replay: retrying a schedule returns the original outcome and restarts nothing.
  for (const ref of [customDone.ref, customDelete.ref]) {
    const s = scheduleOp[ref];
    const retry = await apply(a, s.ops, { operation_id: s.op });
    assertEquals([retry.status, retry.json.replayed, retry.json.results?.[0]?.reminder_id], [200, true, s.reminder], `${ref}: ${JSON.stringify(retry.json)}`);
  }
  // A second round trip changes nothing that was already settled.
  await roundTrip();
  assertEquals(await stored(), rows, 'a second rollback round trip changed reminder history');
}});

// Spec review round 3 and the rollback reminder policy. The legacy schema keeps no event
// history, so completion followed by reopening (or dismissal followed by restoration) while
// rolled back looks exactly like an untouched open task. Policy: a full schema rollback stops
// every pending reminder before it is archived, with its own reason and time; reapplication
// restarts none; a new reminder needs a new user-authorized schedule. A gate-only toggle stops
// nothing.
const db = async () => (await sql`select clock_timestamp() t`)[0].t.getTime();
const storedReminders = async (a: Awaited<ReturnType<typeof newAccount>>) => (await a.client.from('companion_task_reminders')
  .select('id, task_ref, status, cancelled_reason, cancelled_at').order('created_at').order('id')).data!;

Deno.test({ name: 'full rollback stops every pending reminder; reopen, restore or an untouched task restarts none', ...opts, fn: async () => {
  if (!(await candidateApplied())) await applyCandidate('up');
  await openGate();
  const a = await newAccount('policy');
  const custom = await makeCustom(a, 'Completed, then reopened while rolled back');
  const untouched = await makeCustom(a, 'Untouched open task');
  const content = 'sanity:policy-content';
  const dismissed = 'sanity:policy-dismissed';
  for (const ref of [content, dismissed]) {
    assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: ref, state: 'not_started', expected_revision: 0 }])).status, 200);
  }
  const doneBefore = await makeCustom(a, 'Completed before the rollback');
  const sentBefore = await makeCustom(a, 'Reminder delivered before the rollback');
  const cases = [custom.ref, content, dismissed, untouched.ref];
  const schedule: Record<string, { op: string; ops: unknown[]; reminder: string }> = {};
  for (const ref of [...cases, doneBefore.ref, sentBefore.ref]) {
    const op = uuid();
    const ops = [{ type: 'reminder.schedule', task_ref: ref, expected_revision: (await taskOf(a, ref)).revision, remind_at: tomorrow(), time_zone: 'America/Vancouver' }];
    const r = await apply(a, ops, { operation_id: op });
    assertEquals(r.status, 200, JSON.stringify(r.json));
    schedule[ref] = { op, ops, reminder: r.json.results[0].reminder_id };
  }
  // History that exists before the rollback: one schedule stopped by completion, one delivered.
  assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: doneBefore.ref, state: 'completed', expected_revision: (await taskOf(a, doneBefore.ref)).revision }])).status, 200);
  await sql`update companion_task_reminders set status = 'sent' where id = ${schedule[sentBefore.ref].reminder}`;   // delivery worker stand-in
  const history = Object.fromEntries((await storedReminders(a))
    .filter((r) => [doneBefore.ref, sentBefore.ref].includes(r.task_ref)).map((r) => [r.task_ref, r]));
  assertEquals([history[doneBefore.ref].status, history[doneBefore.ref].cancelled_reason], ['cancelled', 'task_completed']);
  assertEquals([history[sentBefore.ref].status, history[sentBefore.ref].cancelled_reason, history[sentBefore.ref].cancelled_at], ['sent', null, null]);

  await sql`update companion_feature_gate set enabled = false`;
  const downStart = await db();
  await applyCandidate('down');
  const downEnd = await db();
  const archived = await sql`select row_data->>'task_ref' task_ref, row_data->>'status' status, row_data->>'cancelled_reason' reason
                               from companion_rollback_archive
                              where source = 'companion_task_reminders' and restored_at is null and row_data->>'user_id' = ${a.id}`;

  // The released OTA completion service, then reopening. Each request returns its row, so a
  // no-op cannot pass for a write.
  const when = new Date().toISOString();
  const customDone = await a.client.from('custom_checklist_tasks')
    .update({ completed: true, completed_at: when }).eq('id', customId(custom.ref)).eq('user_id', a.id).select('completed');
  assertEquals([customDone.status, customDone.error, customDone.data], [200, null, [{ completed: true }]]);
  const contentDone = await a.client.from('user_tasks').upsert({ user_id: a.id, task_id: null,
    sanity_checklist_id: content.slice(7), completed: true, completed_at: when },
    { onConflict: 'user_id,sanity_checklist_id' }).select('completed');
  assertEquals([contentDone.status, contentDone.error, contentDone.data], [200, null, [{ completed: true }]]);
  const remove = await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: dismissed.slice(7), dismissed_at: when },
    { onConflict: 'user_id,sanity_checklist_id' }).select('dismissed_at');
  assertEquals([remove.status, remove.error, remove.data?.length], [200, null, 1]);
  const customReopen = await a.client.from('custom_checklist_tasks')
    .update({ completed: false, completed_at: null }).eq('id', customId(custom.ref)).eq('user_id', a.id).select('completed');
  assertEquals([customReopen.status, customReopen.error, customReopen.data], [200, null, [{ completed: false }]]);
  const contentReopen = await a.client.from('user_tasks').update({ completed: false, completed_at: null })
    .eq('user_id', a.id).eq('sanity_checklist_id', content.slice(7)).select('completed');
  assertEquals([contentReopen.status, contentReopen.error, contentReopen.data], [200, null, [{ completed: false }]]);
  const restore = await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: dismissed.slice(7), dismissed_at: null },
    { onConflict: 'user_id,sanity_checklist_id' }).select('dismissed_at');
  assertEquals([restore.status, restore.error, restore.data], [200, null, [{ dismissed_at: null }]]);

  await applyCandidate('up');
  await openGate();

  // Public read: all four tasks are open, and every old schedule shows as stopped.
  const shown = async (refs: string[]) => {
    const tasks = (await read(a)).json.tasks;
    return Object.fromEntries(refs.map((ref) => {
      const t = tasks.find((x: any) => x.task_ref === ref);
      return [ref, { state: t.state, removed: t.removed, reminders: t.reminders.map((r: any) => r.status).sort() }];
    }));
  };
  assertEquals(await shown([...cases, doneBefore.ref, sentBefore.ref]), {
    ...Object.fromEntries(cases.map((ref) => [ref, { state: 'not_started', removed: false, reminders: ['cancelled'] }])),
    [doneBefore.ref]: { state: 'completed', removed: false, reminders: ['cancelled'] },
    [sentBefore.ref]: { state: 'not_started', removed: false, reminders: ['sent'] },
  }, 'reapplication restarted a schedule that the full rollback stopped');

  // Stored rows: one row per schedule, a distinct reason, the time of the rollback. History is exact.
  const rows = await storedReminders(a);
  assertEquals(rows.length, 6);
  const byRef = Object.fromEntries(rows.map((r) => [r.task_ref, r]));
  for (const ref of cases) {
    const r = byRef[ref];
    assertEquals([r.id, r.status, r.cancelled_reason], [schedule[ref].reminder, 'cancelled', 'schema_rollback'], ref);
    const t = new Date(r.cancelled_at).getTime();
    assert(t >= downStart && t <= downEnd, `${ref}: stopped at ${r.cancelled_at}, not during the rollback`);
  }
  assertEquals(byRef[doneBefore.ref], history[doneBefore.ref], 'a schedule stopped before the rollback lost its reason or time');
  assertEquals(byRef[sentBefore.ref], history[sentBefore.ref], 'a delivered reminder changed over the rollback');
  // The archive itself records the stop: down.sql archives no pending schedule.
  assertEquals(Object.fromEntries(archived.map((r) => [r.task_ref, [r.status, r.reason]])), {
    ...Object.fromEntries(cases.map((ref) => [ref, ['cancelled', 'schema_rollback']])),
    [doneBefore.ref]: ['cancelled', 'task_completed'],
    [sentBefore.ref]: ['sent', null],
  }, 'down.sql archived a pending schedule, or rewrote stopped history');

  // Exact replay of an old schedule returns its historical receipt and restarts nothing.
  for (const ref of cases) {
    const s = schedule[ref];
    const retry = await apply(a, s.ops, { operation_id: s.op });
    assertEquals([retry.status, retry.json.replayed, retry.json.results?.[0]?.reminder_id], [200, true, s.reminder], `${ref}: ${JSON.stringify(retry.json)}`);
  }
  assertEquals(await storedReminders(a), rows, 'replaying an old schedule changed or added a reminder');

  // A new, explicitly approved schedule works and is a new reminder.
  const ops = [{ type: 'reminder.schedule', task_ref: untouched.ref, expected_revision: (await taskOf(a, untouched.ref)).revision, remind_at: tomorrow(), time_zone: 'America/Toronto' }];
  const p = await prepare(a, ops);
  assertEquals(p.status, 200, JSON.stringify(p.json));
  const fresh = await apply(a, ops, { authorization: { kind: 'approved_proposal', proposal_id: p.json.proposal_id, proposal_revision: p.json.proposal_revision } });
  assertEquals(fresh.status, 200, JSON.stringify(fresh.json));
  const freshId = fresh.json.results[0].reminder_id;
  assert(freshId !== schedule[untouched.ref].reminder);
  assertEquals((await shown([untouched.ref]))[untouched.ref].reminders, ['cancelled', 'pending']);
  const [freshRow] = (await storedReminders(a)).filter((r) => r.id === freshId);
  assertEquals([freshRow.status, freshRow.cancelled_reason, freshRow.cancelled_at], ['pending', null, null]);

  // Repeated down/up: old rows stay exactly as they are; the new schedule is stopped by the
  // second rollback like any other; a third cycle changes nothing.
  const secondStart = await db();
  await roundTrip();
  const second = await storedReminders(a);
  assertEquals(second.filter((r) => r.id !== freshId), rows, 'a second rollback rewrote reminder history');
  const [stoppedFresh] = second.filter((r) => r.id === freshId);
  assertEquals([stoppedFresh.status, stoppedFresh.cancelled_reason], ['cancelled', 'schema_rollback']);
  assert(new Date(stoppedFresh.cancelled_at).getTime() >= secondStart);
  await roundTrip();
  assertEquals(await storedReminders(a), second, 'a third rollback cycle changed reminder history');
  assertEquals((await shown([untouched.ref]))[untouched.ref].reminders, ['cancelled', 'cancelled']);
}});

Deno.test({ name: 'an archive written by the earlier candidate, with pending reminders, restores them stopped', ...opts, fn: async () => {
  if (!(await candidateApplied())) await applyCandidate('up');
  await openGate();
  const a = await newAccount('older-archive');
  const open = await makeCustom(a, 'Open task');
  const done = await makeCustom(a, 'Completed task');
  for (const t of [open, done]) {
    assertEquals((await apply(a, [{ type: 'reminder.schedule', task_ref: t.ref, expected_revision: t.revision, remind_at: tomorrow(), time_zone: 'America/Vancouver' }])).status, 200);
  }
  assertEquals((await apply(a, [{ type: 'task.set_state', task_ref: done.ref, state: 'completed', expected_revision: done.revision }])).status, 200);
  const [stopped] = (await storedReminders(a)).filter((r) => r.task_ref === done.ref);
  await sql`update companion_feature_gate set enabled = false`;
  await applyCandidate('down');
  // The earlier down.sql (22f8c381) archived reminders as they were: the open one 'pending'.
  // Put this account's archive into that shape; on the earlier candidate it already is.
  await sql`update companion_rollback_archive
               set row_data = row_data || '{"status": "pending", "cancelled_reason": null, "cancelled_at": null}'::jsonb
             where source = 'companion_task_reminders' and restored_at is null
               and row_data->>'user_id' = ${a.id} and row_data->>'task_ref' = ${open.ref}`;
  const [arch] = await sql`select archived_at, row_data->>'status' status from companion_rollback_archive
                            where source = 'companion_task_reminders' and restored_at is null and row_data->>'task_ref' = ${open.ref}`;
  assertEquals(arch.status, 'pending');
  await applyCandidate('up');
  await openGate();
  const tasks = (await read(a)).json.tasks;
  assertEquals(tasks.find((t: any) => t.task_ref === open.ref).reminders.map((r: any) => r.status), ['cancelled'],
    'a pending reminder from an older archive came back as a live schedule');
  const rows = Object.fromEntries((await storedReminders(a)).map((r) => [r.task_ref, r]));
  assertEquals([rows[open.ref].status, rows[open.ref].cancelled_reason, new Date(rows[open.ref].cancelled_at).getTime()],
    ['cancelled', 'schema_rollback', arch.archived_at.getTime()], 'the older archive was not stopped at the time it was written');
  assertEquals(rows[done.ref], stopped, 'stopped history from the older archive was rewritten');
}});

Deno.test({ name: 'a gate-only disable and enable, without down.sql, stops no reminder', ...opts, fn: async () => {
  if (!(await candidateApplied())) await applyCandidate('up');
  await openGate();
  const a = await newAccount('gate-toggle');
  const t = await makeCustom(a, 'Open through a gate toggle');
  const r = await apply(a, [{ type: 'reminder.schedule', task_ref: t.ref, expected_revision: t.revision, remind_at: tomorrow(), time_zone: 'America/Vancouver' }]);
  assertEquals(r.status, 200, JSON.stringify(r.json));
  const before = await storedReminders(a);
  await sql`update companion_feature_gate set enabled = false`;
  assertEquals((await read(a)).status, 403, 'the gate did not close');
  await openGate();
  assertEquals((await taskOf(a, t.ref)).reminders.map((x: any) => x.status), ['pending']);
  assertEquals(await storedReminders(a), before, 'a gate toggle changed a reminder');
  assertEquals(before.map((x) => [x.status, x.cancelled_reason]), [['pending', null]]);
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
