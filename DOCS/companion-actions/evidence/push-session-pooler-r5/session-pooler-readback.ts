import assert from 'node:assert/strict';
import { connect } from 'file:///Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-33359ffe/unify-front-end/supabase/workers/companion-push/process.ts';

const url = Deno.env.get('COMPANION_PUSH_DATABASE_URL');
if (!url) throw Error('owned_session_url_required');
const db = connect(url);
const report: Record<string, unknown> = { provider_calls: 0, business_writes: 0 };
try {
  const [identity] = await db`select current_user, current_database(), current_setting('server_version_num')::integer as version`;
  assert.equal(identity.current_user, 'companion_push_worker');
  assert.equal(identity.current_database, 'postgres');
  assert.ok(identity.version >= 170000);
  report.identity = identity;
  report.session = await db.begin(async tx => {
    await tx`set local transaction_timeout = '2500ms'`;
    await tx`set local lock_timeout = '1000ms'`;
    const [a] = await tx`select pg_backend_pid() as pid, current_setting('transaction_timeout') as transaction_timeout, current_setting('lock_timeout') as lock_timeout`;
    const [b] = await tx`select pg_backend_pid() as pid, current_setting('transaction_timeout') as transaction_timeout`;
    assert.equal(a.pid, b.pid);
    assert.equal(a.transaction_timeout, '2500ms');
    assert.equal(b.transaction_timeout, '2500ms');
    assert.equal(a.lock_timeout, '1s');
    const [authority] = await tx`select companion_push_private.lock_session_authorized('00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid) as authorized`;
    assert.equal(authority.authorized, false);
    return { retained_backend: true, transaction_timeout: a.transaction_timeout, lock_timeout: a.lock_timeout, invalid_session_refused: true };
  });
  await assert.rejects(db`select id from auth.sessions limit 0`, (e: unknown) => (e as { code?: string }).code === '42501');
  await assert.rejects(db`update companion_push_private.settings set singleton=singleton where singleton`, (e: unknown) => (e as { code?: string }).code === '42501');
  const [counts] = await db`select (select count(*) from companion_push_private.deliveries) as deliveries,(select count(*) from companion_push_private.attempts) as attempts`;
  assert.equal(Number(counts.deliveries), 0);
  assert.equal(Number(counts.attempts), 0);
  report.authorization = { direct_auth_read_refused: true, settings_write_refused: true, deliveries: 0, attempts: 0 };
  report.pass = true;
} catch (error) {
  report.pass = false;
  const e = error as { name?: string; code?: string; message?: string };
  report.error = { name: e.name, code: e.code, message: e.message?.replaceAll(url, '[database URL withheld]') };
  Deno.exitCode = 1;
} finally {
  await db.end({ timeout: 1 });
  await Deno.writeTextFile(Deno.args[0], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, provider_calls: 0, business_writes: 0 }));
}
