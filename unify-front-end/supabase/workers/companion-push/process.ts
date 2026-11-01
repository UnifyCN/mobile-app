/// <reference lib="deno.ns" />
// One operation per process. A driver failure cannot poison the supervisor's pool.
import postgres from 'npm:postgres@3.4.9';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dispatch, reconcile, type WorkerConfig } from './worker.ts';
export function configuration(): { url:string; config:WorkerConfig } {
  if(Deno.env.get('COMPANION_PUSH_ENABLED')!=='true')throw Error('push_worker_disabled');
  const url=Deno.env.get('COMPANION_PUSH_DATABASE_URL');
  if(!url)throw Error('push_database_required');
  const fixture=Deno.env.get('COMPANION_PUSH_FIXTURE')==='true';
  if(fixture && !/^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:63611\//.test(url))throw Error('owned_fixture_database_required');
  if(!fixture && (new URL(url).searchParams.get('sslmode')!=='verify-full'))throw Error('verified_database_tls_required');
  return {url,config:{fixture,providerURL:Deno.env.get('COMPANION_PUSH_FIXTURE_URL'),contentURL:Deno.env.get('COMPANION_PUSH_FIXTURE_CONTENT_URL'),
    projectId:Deno.env.get('SANITY_PROJECT_ID'),dataset:Deno.env.get('SANITY_DATASET'),accessToken:Deno.env.get('EXPO_ACCESS_TOKEN')}};
}
export function connect(url:string) {
  const address = new URL(url);
  const localFixture = Deno.env.get('COMPANION_PUSH_FIXTURE') === 'true' &&
    address.hostname === '127.0.0.1' && address.port === '63611';
  let ssl: false | { ca: string; rejectUnauthorized: true } = false;
  if (!localFixture) {
    if (address.searchParams.getAll('sslmode').length !== 1 || address.searchParams.get('sslmode') !== 'verify-full')
      throw Error('verified_database_tls_required');
    const ca = readFileSync(new URL('./supabase-prod-ca-2021.crt', import.meta.url), 'utf8');
    if (createHash('sha256').update(ca).digest('hex') !== '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')
      throw Error('trusted_database_CA_changed');
    ssl = { ca, rejectUnauthorized: true };
  }
  return postgres(url,{ssl,max:2,connect_timeout:2,idle_timeout:2,max_lifetime:60,
  connection:{application_name:'companion-push-369:'+Deno.pid,statement_timeout:3000,lock_timeout:1000},onnotice:()=>{}});
}
if(import.meta.main){
  let db:ReturnType<typeof connect>|undefined;
  try{
    const {url,config}=configuration();db=connect(url);
    const [major]=await db`select current_setting('server_version_num')::int version`;
    if(major.version<170000)throw Error('postgres_17_required');
    const [kind,id]=Deno.args;
    if(!['dispatch','receipt'].includes(kind) || !/^[a-f0-9-]{36}$/.test(id??''))throw Error('invalid_worker_operation');
    if(kind==='dispatch')await dispatch(db,id,config);else await reconcile(db,id,config);
  }catch{console.error('companion_push_operation_failed');Deno.exitCode=1;}
  finally{await db?.end({timeout:.2});}
}
