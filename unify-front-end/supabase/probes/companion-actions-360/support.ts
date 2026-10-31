// Test support for the #360 probe. Talks to the local stack only.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3';

const env = (k: string) => {
  const v = Deno.env.get(`PROBE_${k}`);
  if (!v) throw new Error(`PROBE_${k} missing: run via ./run.sh`);
  return v;
};

export const API_URL = env('API_URL');
export const ANON_KEY = env('ANON_KEY');
export const SERVICE_ROLE_KEY = env('SERVICE_ROLE_KEY');
export const DB_URL = env('DB_URL');
if (!/127\.0\.0\.1|localhost/.test(API_URL) || !/127\.0\.0\.1|localhost/.test(DB_URL)) {
  throw new Error('probe refuses to run against a non-local stack');
}

export const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
export const sql = postgres(DB_URL, { max: 20, onnotice: () => {} });

export interface Account {
  id: string;
  email: string;
  jwt: string;
  client: SupabaseClient;
}

let counter = 0;
/** A synthetic account: created through the admin API, signed in with a password. */
export async function newAccount(label: string): Promise<Account> {
  const email = `${label}-${Date.now()}-${counter++}@probe.invalid`;
  const password = 'probe-password-1';
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error;
  return {
    id: created.data.user.id,
    email,
    jwt: signedIn.data.session.access_token,
    client,
  };
}

/** The public request boundary: POST /functions/v1/companion-actions. */
export async function call(
  who: Account | null,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API_URL}/functions/v1/companion-actions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      authorization: `Bearer ${who ? who.jwt : ANON_KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch { /* keep text */ }
  return { status: res.status, json };
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Applies candidate/up.sql or down.sql in one transaction. */
export async function applyCandidate(which: 'up' | 'down'): Promise<void> {
  // PROBE_CANDIDATE_UP / _DOWN substitute another file: a deliberately broken up.sql
  // (mutation_check.py) or an earlier candidate (red runs of a regression test).
  const override = Deno.env.get(which === 'up' ? 'PROBE_CANDIDATE_UP' : 'PROBE_CANDIDATE_DOWN');
  const text = override
    ? await Deno.readTextFile(override)
    : await Deno.readTextFile(new URL(`./candidate/${which}.sql`, import.meta.url));
  await sql.begin(tx => tx.unsafe(text));
  await waitForSchemaCache(which);
}

/**
 * PostgREST reloads its schema cache asynchronously after DDL. Wait until its OpenAPI
 * document agrees with the database, so the next request does not race the reload.
 */
export async function waitForSchemaCache(which: 'up' | 'down', timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, accept: 'application/openapi+json' },
    });
    const paths = Object.keys((await res.json()).paths ?? {});
    const seen = paths.includes('/companion_feature_gate') && paths.includes('/rpc/companion_apply_actions');
    if (which === 'up' ? seen : !paths.some(p => p.includes('companion_') && !p.includes('rollback_archive'))) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`PostgREST schema cache did not reflect '${which}' within ${timeoutMs}ms`);
}

export async function candidateApplied(): Promise<boolean> {
  const [r] = await sql`select to_regclass('public.companion_action_receipts') is not null as applied`;
  return r.applied;
}

/** Turns the feature on for the probe (the migration ships it off). */
export async function openGate(patch: Record<string, unknown> = {}): Promise<void> {
  await sql`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
    max_contract_version = 1, allowed_platforms = '{ios,android,web}'`;
  if (Object.keys(patch).length) await sql`update public.companion_feature_gate set ${sql(patch)}`;
}

export const CLIENT = { platform: 'ios', app_version: '9.9.9' };
const base = { contract_version: 1, client: CLIENT };

export const read = (who: Account) => call(who, { ...base, action: 'read' });
export const status = (who: Account, operation_id: string) =>
  call(who, { ...base, action: 'status', operation_id });
export const prepare = (who: Account, operations: unknown[]) =>
  call(who, { ...base, action: 'prepare', operations });
export const apply = (
  who: Account | null,
  operations: unknown[],
  opts: { operation_id?: string; authorization?: unknown; headers?: Record<string, string> } = {}
) =>
  call(
    who,
    {
      ...base,
      action: 'apply',
      operation_id: opts.operation_id ?? uuid(),
      authorization: opts.authorization ?? { kind: 'ui_control' },
      operations,
    },
    opts.headers
  );

export async function taskOf(who: Account, ref: string): Promise<any | undefined> {
  const r = await read(who);
  return r.json.tasks?.find((t: any) => t.task_ref === ref);
}

/** A custom task created through the boundary; returns its task_ref and revision. */
export async function makeCustom(who: Account, title = 'Phone plan'): Promise<{ ref: string; revision: number }> {
  const r = await apply(who, [{ type: 'task.create_custom', title, priority: 'Do soon' }]);
  if (r.status !== 200) throw new Error(`makeCustom failed: ${JSON.stringify(r.json)}`);
  const res = r.json.results[0];
  return { ref: res.task_ref, revision: res.after_revision };
}
export const customId = (ref: string) => Number(ref.split(':')[1]);

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Waits until `n` other backends are blocked on a lock inside companion_apply_actions.
 * Makes a held-lock interleaving deterministic: the test releases only once every
 * request is parked, instead of sleeping and hoping.
 */
export async function waitForBlockedApplies(n: number, timeoutMs = 2500): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < deadline) {
    const [r] = await sql`select count(*)::int n from pg_stat_activity
      where pid <> pg_backend_pid() and wait_event_type = 'Lock'
        and query ilike '%companion_apply_actions%'`;
    count = r.n;
    if (count >= n) return count;
    await sleep(50);
  }
  return count;
}

/** Holds a row lock (SELECT ... FOR UPDATE) from a separate connection until release() is called. */
export function holdRowLock(
  table: 'companion_proposals' | 'custom_checklist_tasks',
  id: string | number
): { ready: Promise<void>; release: () => Promise<void> } {
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  let markReady!: () => void;
  const ready = new Promise<void>(r => (markReady = r));
  const tx = sql.begin(async t => {
    await t`select 1 from ${t('public.' + table)} where id = ${String(id)} for update`;
    markReady();
    await held;
  });
  return { ready, release: async () => { release(); await tx; } };
}
export const holdProposalLock = (proposalId: string) => holdRowLock('companion_proposals', proposalId);
