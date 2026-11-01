import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { configurationStatus } from './node-adapter.mjs';

const secret = 'synthetic-operator-secret-00000000000000000';
const request = (token = secret) => new Request('https://fixture.invalid/api/cron/companion-push', {
  headers: { authorization: `Bearer ${token}` },
});
const valid = {
  COMPANION_PUSH_ENABLED: 'true', COMPANION_PUSH_OPERATOR_SECRET: secret,
  COMPANION_PUSH_DATABASE_URL: 'postgres://companion_push_worker:synthetic@db.invalid/postgres?sslmode=verify-full',
};

test('configuration refuses missing, disabled, weak, and unauthorized inputs', () => {
  for (const env of [{}, { ...valid, COMPANION_PUSH_ENABLED: 'false' },
    { ...valid, COMPANION_PUSH_OPERATOR_SECRET: '' }, { ...valid, COMPANION_PUSH_OPERATOR_SECRET: 'short' }]) {
    assert.equal(configurationStatus(request(), 'cycle', env), 503);
  }
  for (const token of ['', 'undefined', 'service_role', secret + 'x', 'x'.repeat(2000)]) {
    assert.equal(configurationStatus(request(token), 'cycle', valid), 401);
  }
  assert.equal(configurationStatus(request(), 'cycle', valid), 200);
});

test('configuration requires the dedicated login and verified TLS and rejects all fixture overrides', () => {
  for (const url of ['', 'bad', 'https://fixture.invalid',
    valid.COMPANION_PUSH_DATABASE_URL.replace('companion_push_worker', 'postgres'),
    valid.COMPANION_PUSH_DATABASE_URL.replace('companion_push_worker', 'service_role'),
    valid.COMPANION_PUSH_DATABASE_URL.replace('verify-full', 'require'),
    valid.COMPANION_PUSH_DATABASE_URL + '&sslmode=require']) {
    assert.equal(configurationStatus(request(), 'cycle', { ...valid, COMPANION_PUSH_DATABASE_URL: url }), 503);
  }
  for (const key of ['COMPANION_PUSH_FIXTURE', 'COMPANION_PUSH_FIXTURE_URL', 'COMPANION_PUSH_FIXTURE_CONTENT_URL']) {
    assert.equal(configurationStatus(request(), 'cycle', { ...valid, [key]: 'false' }), 503);
  }
});

test('session pooler accepts only the dedicated tenant login on the verified session endpoint', () => {
  const pooler = 'postgres://companion_push_worker.wrbauxutkysljmsqojts:synthetic@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
  assert.equal(configurationStatus(request(), 'cycle', { ...valid, COMPANION_PUSH_DATABASE_URL: pooler }), 200);
  for (const url of [
    pooler.replace(':5432/', ':6543/'),
    pooler.replace(':5432/', '/'),
    pooler.replace('companion_push_worker.', 'postgres.'),
    pooler.replace('companion_push_worker.', 'service_role.'),
    pooler.replace('companion_push_worker.', 'companion_push_worker_admin.'),
    pooler.replace('wrbauxutkysljmsqojts', 'short'),
    pooler.replace('aws-0-us-west-1.pooler.supabase.com', 'db.wrbauxutkysljmsqojts.supabase.co'),
    pooler.replace('pooler.supabase.com', 'pooler.supabase.com.attacker.invalid'),
    pooler.replace('verify-full', 'require'),
    pooler + '&sslmode=require',
  ]) {
    assert.equal(configurationStatus(request(), 'cycle', { ...valid, COMPANION_PUSH_DATABASE_URL: url }), 503);
  }
});

test('readiness requires preview scope, an explicit flag, and the operator secret; it needs no database', () => {
  const env = { VERCEL_ENV: 'preview', COMPANION_PUSH_READINESS_ENABLED: 'true', COMPANION_PUSH_OPERATOR_SECRET: secret };
  assert.equal(configurationStatus(request(), 'readiness', env), 200);
  assert.equal(configurationStatus(request('wrong'), 'readiness', env), 401);
  for (const VERCEL_ENV of [undefined, 'development', 'production']) {
    assert.equal(configurationStatus(request(), 'readiness', { ...env, VERCEL_ENV }), 404);
  }
  assert.equal(configurationStatus(request(), 'readiness', { ...env, COMPANION_PUSH_READINESS_ENABLED: 'false' }), 404);
});

test('HTTP refusal never accesses a runtime and contains only fixed public metadata', async () => {
  // A separate Node process has an empty environment and no application secrets.
  const source = `import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    import {handlePush} from ${JSON.stringify(new URL('./node-adapter.mjs', import.meta.url).href)};
    let spawns=0;
    childProcess.spawn=()=>{spawns++;throw Error('spawn_forbidden');};
    syncBuiltinESMExports();
    const result=await handlePush(new Request('https://fixture.invalid/api/cron/companion-push'));
    console.log(JSON.stringify({status:result.status,cache:result.headers.get('cache-control'),body:await result.json(),spawns}));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: {}, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), { status: 503, cache: 'no-store', body: { ok: false }, spawns: 0 });
});
