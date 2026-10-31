// Mixed-version proof for the additive migration (#360): the legacy client
// operations (the exact PostgREST calls the mobile and web services make) must
// behave identically on the hosted-shape baseline, after candidate/up.sql, after
// candidate/down.sql, and after up again. Existing rows must survive each step.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { apply, applyCandidate, candidateApplied, newAccount, openGate, read, sql, taskOf, type Account } from './support.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const iso = () => new Date().toISOString();
const strip = (row: Record<string, unknown> | null | undefined, keep: string[]) =>
  row ? Object.fromEntries(keep.map(k => [k, row[k] ?? null])) : row;

/** The calls services/checklist/* make, in the shapes they send. */
async function legacyScenario(a: Account) {
  const out: Record<string, unknown> = {};
  const uc = a.client.from('user_tasks');
  // setChecklistItemCompletion(true): upsert
  out.complete = (await uc.upsert({ user_id: a.id, task_id: null, sanity_checklist_id: 's1', completed: true, completed_at: iso() }, { onConflict: 'user_id,sanity_checklist_id' })).error?.message ?? 'ok';
  // setChecklistItemCompletion(false): update
  out.uncheck = (await a.client.from('user_tasks').update({ completed: false, completed_at: null }).eq('user_id', a.id).eq('sanity_checklist_id', 's1')).error?.message ?? 'ok';
  // setChecklistItemDismissed(true / false): upsert
  out.dismiss = (await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 's2', dismissed_at: iso() }, { onConflict: 'user_id,sanity_checklist_id' })).error?.message ?? 'ok';
  out.undismiss = (await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 's2', dismissed_at: null }, { onConflict: 'user_id,sanity_checklist_id' })).error?.message ?? 'ok';
  // ensureUserTasksForChecklist: bulk insert of untouched rows
  out.ensure = (await a.client.from('user_tasks').insert([{ user_id: a.id, task_id: null, sanity_checklist_id: 's3', completed: false }, { user_id: a.id, task_id: null, sanity_checklist_id: 's4', completed: false }])).error?.message ?? 'ok';
  // getUserTasks: explicit column select, as the mobile service sends it
  const tasks = await a.client.from('user_tasks').select(`user_task_id, user_id, task_id, sanity_checklist_id, completed, completed_at, dismissed_at,
    task:personalized_checklist_tasks!user_tasks_task_id_fkey (id, persona, stage, priority, task_name, task_description, task_module)`).eq('user_id', a.id).order('sanity_checklist_id');
  if (tasks.error) throw new Error(`getUserTasks shape failed: ${tasks.error.message}`);
  out.userTasks = tasks.data?.map(r => strip(r, ['sanity_checklist_id', 'completed', 'dismissed_at']));
  out.userTasksCompletedAtShape = tasks.data?.map(r => (r.completed_at === null ? 'null' : 'set'));
  // deleteUserTasks: hosted has no delete policy, so this must remove nothing
  const probe = await a.client.from('user_tasks').select('user_task_id').eq('user_id', a.id);
  if (!probe.data) throw new Error(`user_tasks read failed: ${JSON.stringify(probe.error)}`);
  const countBefore = probe.data.length;
  await a.client.from('user_tasks').delete().eq('user_id', a.id);
  const countAfter = (await a.client.from('user_tasks').select('user_task_id').eq('user_id', a.id)).data!.length;
  out.deleteRemovedNothing = countBefore > 0 && countBefore === countAfter;
  // createCustomChecklistTask: insert + select('*') + single()
  const created = await a.client.from('custom_checklist_tasks').insert({ user_id: a.id, priority: 'Do soon', title: 'Phone plan', description: '' }).select('*').single();
  out.createCustom = created.error?.message ?? 'ok';
  // A refused insert must show up as a different result, not crash the scenario.
  if (!created.data) return out;
  const id = created.data.id;
  out.customShape = strip(created.data, ['priority', 'title', 'description', 'completed', 'completed_at']);
  out.customCompleteOk = (await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: iso() }).eq('id', id).eq('user_id', a.id)).error?.message ?? 'ok';
  out.customList = (await a.client.from('custom_checklist_tasks').select('*').eq('user_id', a.id).order('created_at', { ascending: false })).data?.map(r => strip(r, ['title', 'completed']));
  out.customUncheck = (await a.client.from('custom_checklist_tasks').update({ completed: false, completed_at: null }).eq('id', id).eq('user_id', a.id)).error?.message ?? 'ok';
  out.customDelete = (await a.client.from('custom_checklist_tasks').delete().eq('id', id).eq('user_id', a.id)).error?.message ?? 'ok';
  out.customAfterDelete = (await a.client.from('custom_checklist_tasks').select('id').eq('user_id', a.id)).data?.length;
  // Web addCustomTask sends description: null when the field is empty (services/checklist.ts).
  const webNull = await a.client.from('custom_checklist_tasks').insert({ user_id: a.id, priority: 'Do now', title: 'Web empty description', description: null });
  out.webNullDescription = webNull.error?.code ?? 'ok';
  // checklist_task_order is untouched by the candidate; one upsert to prove it.
  out.order = (await a.client.from('checklist_task_order').upsert({ user_id: a.id, priority: 'Do now', ordered_keys: ['sanity:s1', 'custom:1'] }, { onConflict: 'user_id,priority' })).error?.message ?? 'ok';
  return out;
}

async function seedLegacyRows(a: Account) {
  // Shapes seen on hosted: completed and open Sanity rows, old task_id rows with a
  // null sanity id, a completed custom task, an open custom task.
  const [pt] = await sql`insert into personalized_checklist_tasks (task_name) values ('legacy') returning id`;
  await sql`insert into user_tasks (user_id, sanity_checklist_id, completed, completed_at) values (${a.id}, 'seed-done', true, now()), (${a.id}, 'seed-open', false, null)`;
  await sql`insert into user_tasks (user_id, task_id, completed) values (${a.id}, ${pt.id}, true), (${a.id}, ${pt.id + 0}, false) on conflict do nothing`;
  await sql`insert into custom_checklist_tasks (user_id, priority, title, completed, completed_at) values (${a.id}, 'Do now', 'seed custom done', true, now()), (${a.id}, 'Do soon', 'seed custom open', false, null)`;
}

async function snapshot(a: Account) {
  const ut = await sql`select sanity_checklist_id, task_id is not null as has_task_id, completed, completed_at is not null as has_completed_at, dismissed_at is not null as dismissed from user_tasks where user_id = ${a.id} order by user_task_id`;
  const ct = await sql`select title, priority, completed, completed_at is not null as has_completed_at from custom_checklist_tasks where user_id = ${a.id} order by id`;
  return { ut: ut.map(r => ({ ...r })), ct: ct.map(r => ({ ...r })) };
}

async function freshSeededAccount(label: string) {
  const a = await newAccount(label);
  await seedLegacyRows(a);
  return a;
}

Deno.test({ name: 'candidate migration is additive: legacy client behaviour and existing rows are identical before, after, rolled back and re-applied', ...opts, fn: async () => {
  assert(!(await candidateApplied()), 'run.sh must reset to the baseline first');
  // One fresh, identically seeded account per phase: the scenario mutates state.
  const preexisting = await freshSeededAccount('pre');
  const baseline = await legacyScenario(await freshSeededAccount('baseline'));
  assertEquals((baseline as any).deleteRemovedNothing, true, 'baseline: hosted has no user_tasks delete policy, so deleteUserTasks removes nothing');

  // Up: rows that existed before the migration survive, byte for byte on legacy columns.
  const beforeUp = await snapshot(preexisting);
  await applyCandidate('up');
  await openGate();
  assertEquals(await snapshot(preexisting), beforeUp);
  assertEquals(await legacyScenario(await freshSeededAccount('up')), baseline);

  // Effective four-state mapping of pre-existing rows, with no backfill.
  const r = await read(preexisting);
  const byRef = (ref: string) => r.json.tasks.find((t: any) => t.task_ref === ref);
  assertEquals([byRef('sanity:seed-done').state, byRef('sanity:seed-open').state], ['completed', 'not_started']);
  assertEquals(r.json.tasks.filter((t: any) => t.source === 'sanity').length, 2, 'legacy task_id-only rows are not Checklist tasks');
  const customs = r.json.tasks.filter((t: any) => t.source === 'custom');
  assertEquals(customs.map((t: any) => [t.title, t.state]).sort(), [['seed custom done', 'completed'], ['seed custom open', 'not_started']].sort());

  // Extra columns that old clients receive with select('*') do not break them.
  const star = (await preexisting.client.from('custom_checklist_tasks').select('*').eq('user_id', preexisting.id)).data![0];
  for (const k of ['id', 'user_id', 'priority', 'title', 'description', 'completed', 'completed_at', 'created_at', 'updated_at']) assert(k in star, k);
  assert('removed_at' in star && 'revision' in star);

  // Rich state exists, then rollback.
  const w = await apply(preexisting, [{ type: 'task.set_state', task_ref: 'sanity:seed-open', state: 'waiting', waiting_reason: 'Letter', expected_revision: 1 }]);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  const c = await preexisting.client.from('custom_checklist_tasks').select('id,revision').eq('title', 'seed custom open').single();
  const rm = await apply(preexisting, [{ type: 'task.remove', task_ref: `custom:${c.data!.id}`, expected_revision: c.data!.revision }], { authorization: { kind: 'ui_control', removal_confirmed: true } });
  assertEquals(rm.status, 200, JSON.stringify(rm.json));
  const beforeDown = await snapshot(preexisting);
  await applyCandidate('down');
  assertEquals(await legacyScenario(await freshSeededAccount('down')), baseline);
  const afterDown = await snapshot(preexisting);
  // Completed flags and completed_at survive; the soft-removed custom task is gone for real.
  assertEquals(afterDown.ut.map(x => [x.sanity_checklist_id, x.completed, x.has_completed_at]), beforeDown.ut.map(x => [x.sanity_checklist_id, x.completed, x.has_completed_at]));
  assertEquals(afterDown.ct.map(x => x.title), ['seed custom done']);
  const [arch] = await sql`select count(*) filter (where source = 'user_tasks')::int tasks, count(*) filter (where source = 'custom_checklist_tasks')::int customs, count(*) filter (where source = 'companion_action_receipts')::int receipts from companion_rollback_archive`;
  assert(arch.tasks >= 1 && arch.customs >= 1 && arch.receipts >= 2, JSON.stringify(arch));
  for (const col of ['progress_state', 'revision', 'removed_at']) {
    const [x] = await sql`select count(*)::int n from information_schema.columns where table_name in ('user_tasks','custom_checklist_tasks') and column_name = ${col}`;
    assertEquals(x.n, 0, col);
  }
  const [pol] = await sql`select qual from pg_policies where policyname = 'Users can read own custom checklist tasks'`;
  assertEquals(pol.qual, '(auth.uid() = user_id)');

  // Up again from the rolled-back state.
  await applyCandidate('up');
  await openGate();
  assertEquals(await legacyScenario(await freshSeededAccount('upagain')), baseline);
}});

Deno.test({ name: 'candidate ships the feature off and API roles cannot execute the action SQL', ...opts, fn: async () => {
  if (await candidateApplied()) await applyCandidate('down');
  await applyCandidate('up');
  const [g] = await sql`select enabled, min_contract_version, max_contract_version from companion_feature_gate`;
  assertEquals([g.enabled, g.min_contract_version, g.max_contract_version], [false, 1, 1]);
  const fns = await sql`
    select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authed,
           has_function_privilege('service_role', p.oid, 'execute') svc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'companion\\_%'`;
  for (const f of fns) assertEquals([f.proname, f.anon, f.authed], [f.proname, false, false]);
  const entry = ['companion_action_status', 'companion_apply_actions', 'companion_prepare_proposal', 'companion_read_tasks'];
  for (const name of entry) assert(fns.find(f => f.proname === name)?.svc, `${name} must be executable by the service role`);
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
