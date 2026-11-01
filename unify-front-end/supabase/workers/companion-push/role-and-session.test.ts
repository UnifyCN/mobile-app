// Run only after root grants a separate local SQL lease. This file does not start
// a stack, install schema, schedule work, or contact a provider.
import assert from 'node:assert/strict';
import postgres from 'npm:postgres@3.4.9';
import { enqueue, recoverUnknown } from './worker.ts';

const lease = Deno.env.get('COMPANION_PUSH_SQL_TEST_LEASE');
const raw = Deno.env.get('COMPANION_PUSH_SQL_TEST_URL');
if (lease !== 'unify-companion-push-vercel-r2' || !raw) throw Error('separate_local_SQL_lease_required');
const address = new URL(raw);
if (address.protocol !== 'postgres:' || address.hostname !== '127.0.0.1' || address.port !== '63621' ||
  address.pathname !== '/postgres' || address.username !== 'postgres') throw Error('owned_local_SQL_database_required');

const admin = postgres(raw, { max: 6, connect_timeout: 2,
  connection: { statement_timeout: 5000, lock_timeout: 4000 }, onnotice: () => {} });
const user = crypto.randomUUID(), session = crypto.randomUUID(), installation = crypto.randomUUID();
const token = crypto.randomUUID(), reminder = crypto.randomUUID(), delivery = crypto.randomUUID(), attempt = crypto.randomUUID();
const generation = crypto.randomUUID();
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (await predicate()) return; await pause(10); }
  throw Error('expected_database_blocker_not_observed');
}
async function denied(work: () => PromiseLike<unknown>) {
  await assert.rejects(async () => await work(), (error: unknown) => (error as { code: string }).code === '42501');
}

Deno.test('exact worker login: allowed queries, denied queries, and concurrent Auth session locks', async () => {
  console.log('FALSIFIER: an allowed query fails, an ungranted query succeeds, or session deletion commits through the helper lock.');
  let worker: ReturnType<typeof postgres> | undefined;
  let saved: Record<string, unknown> | undefined;
  try {
    const [role] = await admin`select rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls
      from pg_roles where rolname='companion_push_worker'`;
    assert.ok(role, 'apply the new migration before the leased test');
    assert.deepEqual(Object.values(role), [false, false, false, false, false, false, false]);
    assert.equal((await admin`select pg_has_role('companion_push_worker','service_role','MEMBER') member`)[0].member, false);
    for (const table of ['companion_push_private.settings', 'companion_push_private.enrollments',
      'companion_push_private.deliveries', 'companion_push_private.budget', 'companion_push_private.events',
      'companion_push_private.attempts', 'companion_reminder_private.events', 'public.companion_task_reminders',
      'public.push_tokens', 'public.user_onboarding_profiles']) {
      assert.equal((await admin`select relrowsecurity enabled from pg_class
        where oid=${table}::regclass`)[0].enabled, true);
    }
    const [helper] = await admin`select pg_get_userbyid(proowner) owner,prosecdef,proconfig
      from pg_proc where oid='companion_push_private.lock_session_authorized(uuid,uuid)'::regprocedure`;
    assert.equal(helper.owner, 'postgres'); assert.equal(helper.prosecdef, true);
    assert.deepEqual(helper.proconfig, ['search_path=pg_catalog, pg_temp']);
    for (const principal of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await admin`select has_function_privilege(${principal},
        'companion_push_private.lock_session_authorized(uuid,uuid)','EXECUTE') allowed`)[0].allowed, false);
    }
    saved = (await admin`select to_jsonb(settings) value from companion_push_private.settings`)[0].value;
    assert.equal(saved!.dispatch_enabled, false, 'a leased SQL test requires dark settings');
    assert.equal(saved!.enrollment_enabled, false, 'a leased SQL test requires dark settings');
    await admin`update companion_push_private.settings set maximum_seconds=0,inactivity_seconds=0,
      policy_verified_at=clock_timestamp(),policy_valid_until=clock_timestamp()+interval '1 hour'`;
    await admin`insert into auth.users(id,is_anonymous) values(${user},false)`;
    await admin`insert into auth.sessions(id,user_id,created_at,refreshed_at)
      values(${session},${user},clock_timestamp(),clock_timestamp())`;
    await admin`insert into public.user_onboarding_profiles(id) values(${user}) on conflict do nothing`;
    const [task] = await admin`insert into public.custom_checklist_tasks(user_id,priority,title)
      values(${user},'Do now','Synthetic local SQL fixture') returning id`;
    const taskRef = 'custom:' + task.id;
    await admin`insert into public.push_tokens(id,user_id,token,platform) values(${token},${user},${'synthetic-r2-' + token},'ios')`;
    await admin`insert into companion_push_private.enrollments(installation_id,user_id,session_id,token_id,generation,enabled,locale,credential_hash)
      values(${installation},${user},${session},${token},${generation},true,'en',decode(repeat('00',32),'hex'))`;
    await admin`insert into public.companion_task_reminders(id,user_id,task_ref,remind_at,time_zone)
      values(${reminder},${user},${taskRef},clock_timestamp()+interval '1 day','UTC')`;
    await admin`insert into companion_reminder_private.events(reminder_id,user_id) values(${reminder},${user})`;
    const localPassword = 'synthetic-r2-' + crypto.randomUUID();
    await admin.unsafe("alter role companion_push_worker login password '" + localPassword + "'");
    const workerAddress = new URL(raw); workerAddress.username = 'companion_push_worker'; workerAddress.password = localPassword;
    worker = postgres(workerAddress.toString(), { max: 4, connect_timeout: 2,
      connection: { statement_timeout: 5000, lock_timeout: 4000 }, onnotice: () => {} });
    assert.equal((await worker`select current_user name`)[0].name, 'companion_push_worker');
    const w = worker;

    // regclass numeric IDs can bypass namespace lookup. A missing schema grant
    // alone does not remove PUBLIC nextval/setval authority.
    const sequences = await admin`select c.oid::text id from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where c.relkind='S'
      and n.nspname not in ('pg_catalog','information_schema')`;
    for (const sequence of sequences) {
      await denied(() => w`select nextval(${sequence.id}::oid::regclass)`);
      await denied(() => w`select setval(${sequence.id}::oid::regclass,1)`);
    }

    // A direct login can fabricate JWT settings. PUBLIC definer execution is
    // therefore real authority, even for a NOINHERIT role.
    await denied(() => w.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${user},true)`;
      await tx`select public.delete_user()`;
    }));
    const privileged = await admin`select n.nspname,p.proname from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where p.prosecdef and has_schema_privilege('companion_push_worker',n.oid,'USAGE')
      and has_function_privilege('companion_push_worker',p.oid,'EXECUTE')
      and p.oid not in ('companion_push_private.lock_session_authorized(uuid,uuid)'::regprocedure,
        'companion_push_private.session_authorized(uuid,uuid)'::regprocedure,
        'public.companion_step_parent(uuid,text)'::regprocedure)`;
    assert.deepEqual([...privileged], [], 'unexpected effective privileged function execution');

    await w.begin(async (tx) => {
      assert.equal((await tx`select * from companion_push_private.settings for share`).length, 1);
      assert.equal((await tx`select * from companion_reminder_private.events where reminder_id=${reminder} for update`).length, 1);
      assert.equal((await tx`select * from public.companion_task_reminders where id=${reminder} for update`).length, 1);
      assert.equal((await tx`select id,user_id,token from public.push_tokens where id=${token} for share`).length, 1);
      assert.equal((await tx`select * from public.user_onboarding_profiles where id=${user} for share`).length, 1);
      await tx`select public.companion_step_parent_lock(${user}::uuid,${taskRef})`;
      await tx`select public.companion_step_parent(${user}::uuid,${taskRef})`;
      assert.equal((await tx`select companion_push_private.lock_session_authorized(${session}::uuid,${user}::uuid) valid`)[0].valid, true);
      assert.equal((await tx`select companion_push_private.lock_session_authorized(${session}::uuid,${crypto.randomUUID()}::uuid) valid`)[0].valid, false);
      const [enrollment] = await tx`select n.*,p.token from companion_push_private.enrollments n
        join public.push_tokens p on p.id=n.token_id and p.user_id=n.user_id
        where n.installation_id=${installation} and n.user_id=${user} and n.generation=${generation}
        and n.token_id=${token} and n.enabled and n.revoked_at is null
        and companion_push_private.lock_session_authorized(n.session_id,n.user_id) for share of n,p`;
      assert.equal(enrollment.installation_id, installation);
    });
    assert.equal(await enqueue(w), 1); // Dark enqueue consumes the synthetic event only.
    await w`insert into companion_push_private.deliveries(id) values(${delivery})`.then(
      () => assert.fail('ungranted delivery id insert succeeded'),
      (error) => assert.equal(error.code, '42501'));
    await w`insert into companion_push_private.deliveries(reminder_id,user_id,task_ref,installation_id,generation,token_id,state)
      values(${reminder},${user},${taskRef},${installation},${generation},${token},'queued')`;
    const [d] = await w`select * from companion_push_private.deliveries where reminder_id=${reminder}`;
    await w`insert into companion_push_private.attempts(id,delivery_id,number) values(${attempt},${d.id},1)`;
    await w`update companion_push_private.deliveries set state='dispatching',attempt_count=1 where id=${d.id}`;
    await recoverUnknown(w, d.id);
    assert.equal((await w`select * from companion_push_private.deliveries where id=${d.id}`)[0].state, 'unknown');
    assert.equal((await w`select id,delivery_id,outcome from companion_push_private.attempts where id=${attempt}`)[0].outcome, 'unknown');
    await w`update companion_push_private.deliveries set state='ticket_accepted',ticket='synthetic-ticket',ticket_at=now(),
      receipt_check_at=now()+interval '15 minutes',next_attempt_at=now(),receipt=null where id=${d.id}`;
    await w`update companion_push_private.attempts set outcome='ticket_accepted',ticket='synthetic-ticket' where id=${attempt}`;
    await w`update companion_push_private.events set reason='local_test' where reminder_id=${reminder}`;
    await w`update companion_push_private.enrollments set enabled=false,revision=revision+1 where installation_id=${installation}`;
    await w.begin(async (tx) => {
      assert.equal((await tx`select * from companion_push_private.budget for update`).length, 1);
      await tx`update companion_push_private.budget set second_at=now(),minute_at=now(),sends_second=0,sends_minute=0,receipts_minute=0,blocked_until=now()`;
    });
    for (const table of ['auth.sessions', 'auth.users', 'companion_reminder_private.history', 'public.conversations']) {
      await denied(() => w.unsafe('select * from ' + table));
    }
    await denied(() => w`update companion_push_private.settings set dispatch_enabled=true`);
    await denied(() => w`delete from companion_push_private.deliveries`);
    await denied(() => w`truncate companion_push_private.deliveries`);
    // PUBLIC policies must not permit writes even with fabricated JWT settings.
    for (const claims of [{}, { sub: user, role: 'authenticated' }]) {
      for (const query of [
        'update companion_push_private.settings set singleton=singleton',
        `update companion_reminder_private.events set due_at=due_at where reminder_id='${reminder}'`,
        `update public.companion_task_reminders set created_at=created_at where id='${reminder}'`,
        `update public.push_tokens set updated_at=updated_at where id='${token}'`,
        `update public.user_onboarding_profiles set updated_at=updated_at where id='${user}'`,
      ]) await denied(() => w.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
        await tx`select set_config('request.jwt.claim.sub',${user},true)`;
        return await tx.unsafe(query);
      }));
    }

    // Session-lock first: observe the real DELETE backend blocked by this role.
    let release!: () => void, entered!: () => void, holder = 0;
    const held = new Promise<void>((resolve) => release = resolve);
    const ready = new Promise<void>((resolve) => entered = resolve);
    const locking = w.begin(async (tx) => {
      holder = (await tx`select pg_backend_pid() pid`)[0].pid;
      assert.equal((await tx`select companion_push_private.lock_session_authorized(${session}::uuid,${user}::uuid) valid`)[0].valid, true);
      entered(); await held;
    });
    await Promise.race([ready, locking]);
    const deletion = admin`delete from auth.sessions where id=${session}`.execute();
    try {
      await until(async () => (await admin`select 1 from pg_stat_activity where ${holder}::int=any(pg_blocking_pids(pid))`).length > 0);
      assert.equal((await admin`select count(*)::int n from auth.sessions where id=${session}`)[0].n, 1);
    } finally { release(); await locking; await deletion; }
    assert.equal((await w`select companion_push_private.lock_session_authorized(${session}::uuid,${user}::uuid) valid`)[0].valid, false);

    // Deletion first: the waiting helper must return false after DELETE commits.
    await admin`insert into auth.sessions(id,user_id,created_at) values(${session},${user},clock_timestamp())`;
    let unlock!: () => void, deleted!: () => void, deletingPid = 0;
    const gate = new Promise<void>((resolve) => unlock = resolve);
    const deleting = new Promise<void>((resolve) => deleted = resolve);
    const deletingTx = admin.begin(async (tx) => {
      deletingPid = (await tx`select pg_backend_pid() pid`)[0].pid;
      await tx`delete from auth.sessions where id=${session}`; deleted(); await gate;
    });
    await Promise.race([deleting, deletingTx]);
    const authorization = w`select companion_push_private.lock_session_authorized(${session}::uuid,${user}::uuid) valid`.execute();
    try { await until(async () => (await admin`select 1 from pg_stat_activity where ${deletingPid}::int=any(pg_blocking_pids(pid))`).length > 0); }
    finally { unlock(); await deletingTx; }
    assert.equal((await authorization)[0].valid, false);

    // A session expiry during lock contention must use the clock after the wait.
    await admin`insert into auth.sessions(id,user_id,created_at,not_after)
      values(${session},${user},clock_timestamp(),clock_timestamp()+interval '1 second')`;
    let expiredUnlock!: () => void, expiryEntered!: () => void, expiryPid = 0;
    const expiryGate = new Promise<void>((resolve) => expiredUnlock = resolve);
    const expiryReady = new Promise<void>((resolve) => expiryEntered = resolve);
    const expiryTx = admin.begin(async (tx) => {
      expiryPid = (await tx`select pg_backend_pid() pid`)[0].pid;
      await tx`select id from auth.sessions where id=${session} for update`; expiryEntered(); await expiryGate;
    });
    await Promise.race([expiryReady, expiryTx]);
    const expiredAuthorization = w`select companion_push_private.lock_session_authorized(${session}::uuid,${user}::uuid) valid`.execute();
    try {
      await until(async () => (await admin`select 1 from pg_stat_activity where ${expiryPid}::int=any(pg_blocking_pids(pid))`).length > 0);
      assert.equal((await admin`select not_after>clock_timestamp() valid from auth.sessions where id=${session}`)[0].valid, true);
      await until(async () => (await admin`select not_after<clock_timestamp() expired from auth.sessions where id=${session}`)[0].expired);
    } finally { expiredUnlock(); await expiryTx; }
    assert.equal((await expiredAuthorization)[0].valid, false);
    console.log('PASS: exact-login queries and three concurrent session-lock orders');
  } finally {
    await worker?.end({ timeout: 1 });
    await admin`alter role companion_push_worker nologin password null`;
    await admin`delete from companion_push_private.attempts where id=${attempt}`;
    await admin`delete from companion_push_private.events where reminder_id=${reminder}`;
    await admin`delete from auth.users where id=${user}`;
    if (saved) await admin`update companion_push_private.settings set maximum_seconds=${saved.maximum_seconds as number | null},
      inactivity_seconds=${saved.inactivity_seconds as number | null},policy_verified_at=${saved.policy_verified_at as string | null},
      policy_valid_until=${saved.policy_valid_until as string | null}`;
    await admin.end({ timeout: 1 });
  }
});
