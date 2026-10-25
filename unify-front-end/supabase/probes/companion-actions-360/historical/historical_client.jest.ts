/**
 * Probe #360: an IMMUTABLE historical mobile client against the disposable local stack.
 *
 * historical_test.ts copies this file into a detached checkout of a released commit
 * (v1.6.0, or the shipped OTA source) as __probe360__-<run id>/historicalClient.test.ts and runs
 * that checkout's own Jest. Every call goes through the snapshot's own lib/supabase
 * (its own supabase-js version, its own auth client) and its own services/checklist
 * modules. Nothing of the snapshot is mocked except expo-secure-store, the device
 * keychain the session is stored in.
 *
 * Env: PROBE_PHASE, PROBE_OUT (JSON result path), PROBE_CARRY (JSON account file),
 *      PROBE_API_URL, PROBE_ANON_KEY, PROBE_SERVICE_ROLE_KEY,
 *      EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (set to the local stack by the orchestrator).
 */
import * as fs from 'fs';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

const API_URL = process.env.PROBE_API_URL!;
const PHASE = process.env.PROBE_PHASE!;
const PASSWORD = 'probe-password-1';

/** Optional module: the snapshot may predate it (v1.6.0 has no dismissal service). */
function optional(alias: string, file: string): any {
  return fs.existsSync(`${process.cwd()}/${file}`) ? require(alias) : null;
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const key = process.env.PROBE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function createAccount(label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@probe.invalid`;
  const r = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (r.status !== 200) throw new Error(`createUser ${r.status}`);
  return email;
}

async function actions(jwt: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/functions/v1/companion-actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: process.env.PROBE_ANON_KEY!, authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ contract_version: 1, client: { platform: 'ios', app_version: 'probe' }, ...body }),
  });
  return { status: res.status, json: await res.json() };
}
const applyOps = (jwt: string, operations: unknown[], authorization: unknown = { kind: 'ui_control' }) =>
  actions(jwt, { action: 'apply', operation_id: crypto.randomUUID(), authorization, operations });

describe(`historical client, phase ${PHASE}`, () => {
  // The snapshot's own modules, loaded after the env points at the local stack.
  const { supabase } = require('@/lib/supabase');
  const completion = require('@/services/checklist/setChecklistItemCompletion');
  const dismissal = optional('@/services/checklist/setChecklistItemDismissed', 'services/checklist/setChecklistItemDismissed.ts');
  const { getUserTasks } = require('@/services/checklist/getUserTasks');
  const { deleteUserTasks } = require('@/services/checklist/deleteUserTasks');
  const { ensureUserTasksForChecklist } = require('@/services/checklist/ensureUserTasksForChecklist');
  const custom = require('@/services/checklist/customChecklistTasks');
  const order = require('@/services/checklist/checklistTaskOrder');
  const out: Record<string, unknown> = { phase: PHASE, hasDismissalModule: !!dismissal };

  afterAll(() => {
    fs.writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 2));
  });

  async function signIn(email: string): Promise<{ id: string; jwt: string }> {
    await supabase.auth.signOut().catch(() => {});
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
    return { id: data.user.id, jwt: data.session.access_token };
  }

  const tasksView = async (uid: string) =>
    ((await getUserTasks(uid)) as any[])
      .filter(r => r.sanity_checklist_id)
      .map(r => ({ id: r.sanity_checklist_id, completed: r.completed, hasCompletedAt: r.completed_at != null }))
      .sort((a, b) => a.id.localeCompare(b.id));
  const customView = async (uid: string) =>
    ((await custom.getCustomChecklistTasks(uid)) as any[]).map(t => ({ title: t.title, completed: t.completed })).sort((a, b) => a.title.localeCompare(b.title));

  it('talks only to the local stack', () => {
    const url = String((supabase as any).supabaseUrl ?? '');
    expect(url.startsWith('http://127.0.0.1:')).toBe(true);
    out.clientUrlIsLocal = true;
    out.supabaseJsVersion = require('@supabase/supabase-js/package.json').version;
  });

  it('runs the legacy checklist scenario through the snapshot services', async () => {
    const me = await signIn(await createAccount(`hist-${PHASE}`));
    const uid = me.id;
    const steps: Record<string, unknown> = {};
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        const v = await fn();
        steps[name] = v === undefined ? 'ok' : v;
      } catch (e: any) {
        steps[name] = `error: ${e?.message ?? e}`;
      }
    };
    await step('complete', () => completion.setChecklistItemCompletion(uid, 's1', true));
    await step('afterComplete', () => tasksView(uid));
    await step('uncheck', () => completion.setChecklistItemCompletion(uid, 's1', false));
    await step('afterUncheck', () => tasksView(uid));
    if (dismissal) {
      await step('dismiss', () => dismissal.setChecklistItemDismissed(uid, 's2', true));
      await step('undismiss', () => dismissal.setChecklistItemDismissed(uid, 's2', false));
    }
    await step('ensure', async () => {
      await ensureUserTasksForChecklist(uid, [{ _id: 's1' }, { _id: 's3' }, { _id: 's4' }] as any, await getUserTasks(uid));
    });
    await step('afterEnsure', () => tasksView(uid));
    await step('deleteAll', async () => {
      const before = (await getUserTasks(uid)).length;
      await deleteUserTasks(uid);
      return { before, after: (await getUserTasks(uid)).length };
    });
    let customId = 0;
    await step('createCustom', async () => {
      const t = await custom.createCustomChecklistTask({ userId: uid, priority: 'Do soon', title: 'Phone plan' });
      customId = t.id;
      return { title: t.title, description: t.description, completed: t.completed };
    });
    await step('completeCustom', () => custom.setCustomChecklistTaskCompletion({ userId: uid, customTaskId: customId, completed: true }));
    await step('customList', () => customView(uid));
    await step('uncheckCustom', () => custom.setCustomChecklistTaskCompletion({ userId: uid, customTaskId: customId, completed: false }));
    await step('deleteCustom', () => custom.deleteCustomChecklistTask({ userId: uid, customTaskId: customId }));
    await step('customAfterDelete', () => customView(uid));
    await step('order', async () => {
      await order.upsertChecklistTaskOrder(uid, 'Do now', ['sanity:s1', 'custom:1']);
      return order.getChecklistTaskOrders(uid);
    });
    out.scenario = steps;
  });

  it('reads the account it seeded in the baseline phase', async () => {
    let carry: { email: string };
    if (PHASE === 'baseline') {
      carry = { email: await createAccount('hist-carry') };
      fs.writeFileSync(process.env.PROBE_CARRY!, JSON.stringify(carry));
      const me = await signIn(carry.email);
      await completion.setChecklistItemCompletion(me.id, 'carry-done', true);
      await ensureUserTasksForChecklist(me.id, [{ _id: 'carry-open' }] as any, []);
      await custom.createCustomChecklistTask({ userId: me.id, priority: 'Do now', title: 'Carry custom' });
    } else {
      carry = JSON.parse(fs.readFileSync(process.env.PROBE_CARRY!, 'utf8'));
    }
    const me = await signIn(carry.email);
    out.carry = { tasks: await tasksView(me.id), customs: await customView(me.id) };
  });

  // Only when the candidate is applied: old client writes meet rich state written by the new contract.
  const migrated = PHASE === 'up' || PHASE === 'upagain';
  (migrated ? it : it.skip)('old-client writes meet rich state from the action service', async () => {
    const me = await signIn(await createAccount(`hist-mix-${PHASE}`));
    const read = async () => (await actions(me.jwt, { action: 'read' })).json.tasks as any[];
    const state = async (ref: string) => (await read()).find(t => t.task_ref === ref);
    const mix: Record<string, unknown> = {};

    // a) Waiting, then the old client completes it.
    await applyOps(me.jwt, [{ type: 'task.set_state', task_ref: 'sanity:mix-a', state: 'waiting', waiting_reason: 'Letter', expected_revision: 0 }]);
    await completion.setChecklistItemCompletion(me.id, 'mix-a', true);
    const a = await state('sanity:mix-a');
    mix.waitingThenOldComplete = [a.state, a.waiting_reason];

    // b) In progress, then the old client unchecks it (v1.6.0: DELETE; later: UPDATE completed=false).
    await applyOps(me.jwt, [{ type: 'task.set_state', task_ref: 'sanity:mix-b', state: 'in_progress', expected_revision: 0 }]);
    await completion.setChecklistItemCompletion(me.id, 'mix-b', false);
    mix.inProgressThenOldUncheck = (await state('sanity:mix-b')).state;

    // c) Completed through the contract, then the old client unchecks it.
    await applyOps(me.jwt, [{ type: 'task.set_state', task_ref: 'sanity:mix-c', state: 'completed', expected_revision: 0 }]);
    await completion.setChecklistItemCompletion(me.id, 'mix-c', false);
    mix.completedThenOldUncheck = (await state('sanity:mix-c')).state;
    mix.completedThenOldUncheckLegacyView = (await tasksView(me.id)).find(t => t.id === 'mix-c');

    // d) A custom task removed through the contract is hidden from the old list.
    const created = await applyOps(me.jwt, [{ type: 'task.create_custom', title: 'Removed by new client', priority: 'Do soon' }]);
    const ref = created.json.results[0].task_ref;
    const kept = await applyOps(me.jwt, [{ type: 'task.create_custom', title: 'Kept', priority: 'Do soon' }]);
    const keptRef = kept.json.results[0].task_ref;
    await applyOps(me.jwt, [{ type: 'task.remove', task_ref: ref, expected_revision: 1 }], { kind: 'ui_control', removal_confirmed: true });
    mix.oldListAfterNewRemoval = await customView(me.id);

    // e) A reminder on a custom task, then the old client deletes the task.
    const remindAt = new Date(Date.now() + 86400000).toISOString();
    const rem = await applyOps(me.jwt, [{ type: 'reminder.schedule', task_ref: keptRef, remind_at: remindAt, time_zone: 'America/Toronto', expected_revision: 1 }]);
    mix.reminderScheduled = rem.status;
    await custom.deleteCustomChecklistTask({ userId: me.id, customTaskId: Number(keptRef.split(':')[1]) });
    const reminders = await adminFetch(`/rest/v1/companion_task_reminders?select=status,cancelled_reason&user_id=eq.${me.id}`);
    mix.reminderAfterOldDelete = reminders.json;

    // f) The old client's own reads still work with the added columns.
    mix.oldReadsOk = Array.isArray(await getUserTasks(me.id)) && Array.isArray(await custom.getCustomChecklistTasks(me.id));
    out.mixed = mix;
  });
});
