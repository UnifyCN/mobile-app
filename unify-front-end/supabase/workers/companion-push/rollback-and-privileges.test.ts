import assert from 'node:assert/strict';
import postgres from 'npm:postgres@3.4.9';

const raw = Deno.env.get('COMPANION_PUSH_SQL_TEST_URL');
if (Deno.env.get('COMPANION_PUSH_SQL_TEST_LEASE') !== 'unify-companion-push-vercel-r2' || !raw)
  throw Error('owned_SQL_lease_required');
const address = new URL(raw);
if (address.hostname !== '127.0.0.1' || address.port !== '63621' || address.pathname !== '/postgres' || address.username !== 'postgres')
  throw Error('owned_local_SQL_database_required');

Deno.test('worker rollback and reapply preserve unknown intents and suppression identities and restore PUBLIC ACLs', async () => {
  const db = postgres(raw, { max: 1, onnotice: () => {} });
  const user = crypto.randomUUID(), reminder = crypto.randomUUID(), unknown = crypto.randomUUID(), suppressed = crypto.randomUUID();
  const attempt = crypto.randomUUID(), installation = crypto.randomUUID(), generation = crypto.randomUUID(), token = crypto.randomUUID();
  const migration = new URL('../../migrations/20261101042015_companion_push_worker_session_lock.sql', import.meta.url);
  const rollback = new URL('../../rollbacks/20261101042015_companion_push_worker_session_lock.down.sql', import.meta.url);
  const snapshot = async () => ({
    deliveries: [...await db`select to_jsonb(t) value from companion_push_private.deliveries t where user_id=${user} order by id`],
    attempts: [...await db`select to_jsonb(t) value from companion_push_private.attempts t where id=${attempt}`],
    events: [...await db`select to_jsonb(t) value from companion_push_private.events t where user_id=${user}`],
    enrollments: [...await db`select to_jsonb(t) value from companion_push_private.enrollments t where user_id=${user}`],
  });
  try {
    await db`insert into auth.users(id,is_anonymous) values(${user},false)`;
    await db`insert into companion_push_private.enrollments(installation_id,user_id,session_id,token_id,generation,enabled,locale,credential_hash,revoked_at)
      values(${installation},${user},${crypto.randomUUID()},null,${generation},false,'en',decode(repeat('00',32),'hex'),now())`;
    await db`insert into companion_push_private.deliveries(id,reminder_id,user_id,task_ref,installation_id,generation,token_id,state,attempt_count)
      values(${unknown},${reminder},${user},'custom:1',${installation},${generation},${token},'unknown',1),
        (${suppressed},${reminder},${user},'custom:1',${crypto.randomUUID()},${generation},${token},'suppressed',0)`;
    await db`insert into companion_push_private.attempts(id,delivery_id,number,outcome) values(${attempt},${unknown},1,'unknown')`;
    await db`insert into companion_push_private.events(reminder_id,user_id,reason) values(${reminder},${user},'local_suppression')`;
    const before = await snapshot();
    const acl = [...await db`select signature,added_api_roles from companion_push_private.worker_public_function_grants order by signature`];
    assert.ok(acl.some(r => r.signature === 'public.delete_user()'));
    assert.equal((await db`select has_function_privilege('anon','public.delete_user()','EXECUTE') allowed`)[0].allowed, true);
    await db.unsafe(await Deno.readTextFile(rollback));
    assert.equal((await db`select count(*)::int n from pg_roles where rolname='companion_push_worker'`)[0].n, 0);
    assert.deepEqual(await snapshot(), before);
    for (const row of acl) {
      assert.equal((await db`select exists(select 1 from pg_proc p,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid=${row.signature}::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') allowed`)[0].allowed, true);
    }
    await db.unsafe(await Deno.readTextFile(migration));
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual([...await db`select signature,added_api_roles from companion_push_private.worker_public_function_grants order by signature`], acl);
    assert.deepEqual((await db`select rolcanlogin,rolinherit,rolbypassrls from pg_roles where rolname='companion_push_worker'`)[0],
      { rolcanlogin: false, rolinherit: false, rolbypassrls: false });
    console.log('PASS: exact unknown, attempt, event and revoked-enrollment rows retained through rollback and reapply');
  } finally {
    await db`delete from auth.users where id=${user}`;
    await db.end();
  }
});

Deno.test('server rejects a DST gap and any wall/instant disagreement', async () => {
  const db = postgres(raw, { max: 1, onnotice: () => {} });
  const operation = { type: 'reminder.schedule', task_ref: 'custom:1', expected_revision: 0,
    remind_at: '2027-03-14T02:30:00-05:00', wall_time: '2027-03-14T02:30:00', time_zone: 'America/New_York' };
  try {
    await assert.rejects(db`select public.companion_validate_operations(${db.json([operation])}::jsonb)`, /wall_time_offset_mismatch/);
    await db`select public.companion_validate_operations(${db.json([{ ...operation,
      remind_at: '2027-03-14T03:30:00-04:00', wall_time: '2027-03-14T03:30:00' }])}::jsonb)`;
    await assert.rejects(db`select public.companion_validate_operations(${db.json([{ ...operation,
      remind_at: '2027-03-14T03:30:00-04:00', wall_time: '2027-03-14T04:30:00' }])}::jsonb)`, /wall_time_offset_mismatch/);
    console.log('PASS: local server is authoritative for the zone/instant/wall tuple; no hosted tzdata result claimed');
  } finally { await db.end(); }
});
