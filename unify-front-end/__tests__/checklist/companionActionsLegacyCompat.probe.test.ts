/**
 * Probe #360: the REAL mobile checklist services (unchanged) run against the
 * disposable local Supabase stack with the candidate migration applied. Proves
 * that a client built before the Companion action contract keeps working, and
 * that its writes map onto richer state without destroying it.
 *
 * Skipped unless PROBE_JEST and the PROBE_* stack variables are set:
 *   cd supabase/probes/companion-actions-360 && ./run.sh      (resets, applies the migration)
 *   eval "$(supabase status --workdir . -o env | sed 's/^/export PROBE_/')"
 *   PROBE_JEST=1 npx jest __tests__/checklist/companionActionsLegacyCompat.probe.test.ts --watchAll=false
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { setChecklistItemCompletion } from '@/services/checklist/setChecklistItemCompletion';
import { setChecklistItemDismissed } from '@/services/checklist/setChecklistItemDismissed';
import { getUserTasks } from '@/services/checklist/getUserTasks';
import {
  createCustomChecklistTask,
  deleteCustomChecklistTask,
  getCustomChecklistTasks,
  setCustomChecklistTaskCompletion,
} from '@/services/checklist/customChecklistTasks';

jest.mock('@/lib/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, prop) => {
        const client = (globalThis as any).__probeClient as SupabaseClient;
        const value = (client as any)[prop];
        return typeof value === 'function' ? value.bind(client) : value;
      },
    }
  ),
}));

const API_URL = process.env.PROBE_API_URL;
const run = process.env.PROBE_JEST && API_URL ? describe : describe.skip;

async function actions(jwt: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/functions/v1/companion-actions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: process.env.PROBE_ANON_KEY!,
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      contract_version: 1,
      client: { platform: 'ios' },
      ...body,
    }),
  });
  return { status: res.status, json: await res.json() };
}

run('legacy mobile checklist services against the migrated stack', () => {
  let userId: string;
  let jwt: string;

  beforeAll(async () => {
    const admin = createClient(API_URL!, process.env.PROBE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const email = `jest-${Date.now()}@probe.invalid`;
    const created = await admin.auth.admin.createUser({
      email,
      password: 'probe-password-1',
      email_confirm: true,
    });
    userId = created.data.user!.id;
    const client = createClient(API_URL!, process.env.PROBE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const session = await client.auth.signInWithPassword({
      email,
      password: 'probe-password-1',
    });
    jwt = session.data.session!.access_token;
    (globalThis as any).__probeClient = client;
    await admin
      .from('companion_feature_gate')
      .update({ enabled: true, allowed_platforms: ['ios', 'android', 'web'] })
      .eq('singleton', true);
  });

  it('completes, unchecks, dismisses and restores a content-backed task without touching rich state', async () => {
    const wait = await actions(jwt, {
      action: 'apply',
      operation_id: crypto.randomUUID(),
      authorization: { kind: 'ui_control' },
      operations: [
        {
          type: 'task.set_state',
          task_ref: 'sanity:bank',
          state: 'waiting',
          waiting_reason: 'Branch appointment',
          expected_revision: 0,
        },
      ],
    });
    expect(wait.status).toBe(200);

    await setChecklistItemDismissed(userId, 'bank', true);
    await setChecklistItemDismissed(userId, 'bank', false);
    await setChecklistItemCompletion(userId, 'bank', false);
    const rows = await getUserTasks(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sanity_checklist_id: 'bank',
      completed: false,
      dismissed_at: null,
    });

    const read = await actions(jwt, { action: 'read' });
    const task = read.json.tasks.find((t: any) => t.task_ref === 'sanity:bank');
    expect(task).toMatchObject({
      state: 'waiting',
      waiting_reason: 'Branch appointment',
      removed: false,
    });

    await setChecklistItemCompletion(userId, 'bank', true);
    const after = await actions(jwt, { action: 'read' });
    expect(
      after.json.tasks.find((t: any) => t.task_ref === 'sanity:bank')
    ).toMatchObject({ state: 'completed', waiting_reason: null });
    expect((await getUserTasks(userId))[0].completed).toBe(true);
  });

  it('creates, completes, lists and deletes a custom task; a task removed by the action service is hidden from it', async () => {
    const created = await createCustomChecklistTask({
      userId,
      priority: 'Do soon',
      title: 'Get a phone plan',
    });
    await setCustomChecklistTaskCompletion({
      userId,
      customTaskId: created.id,
      completed: true,
    });
    expect((await getCustomChecklistTasks(userId)).map(t => t.completed)).toEqual([true]);

    const second = await createCustomChecklistTask({
      userId,
      priority: 'Do now',
      title: 'Remove from Companion',
    });
    const ref = `custom:${second.id}`;
    const read = await actions(jwt, { action: 'read' });
    const revision = read.json.tasks.find((t: any) => t.task_ref === ref).revision;
    const removed = await actions(jwt, {
      action: 'apply',
      operation_id: crypto.randomUUID(),
      authorization: { kind: 'ui_control', removal_confirmed: true },
      operations: [{ type: 'task.remove', task_ref: ref, expected_revision: revision }],
    });
    expect(removed.status).toBe(200);
    expect((await getCustomChecklistTasks(userId)).map(t => t.title)).toEqual([
      'Get a phone plan',
    ]);

    await deleteCustomChecklistTask({ userId, customTaskId: created.id });
    expect(await getCustomChecklistTasks(userId)).toEqual([]);
  });
});
