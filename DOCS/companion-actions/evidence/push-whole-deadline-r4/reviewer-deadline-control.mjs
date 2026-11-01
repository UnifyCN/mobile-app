import assert from 'node:assert/strict';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const app=process.cwd();
const real=DenoUndefined();
function DenoUndefined(){return process.env.REVIEW_REAL_DEADLINE==='true';}
const delay=real?115000:180;const deadline=real?110000:30;
const fixture=path.join(app,'supabase/probes/push-whole-deadline-r4/adapter-control');
await mkdir(path.join(fixture,'runtime/cache'),{recursive:true});
for(const file of ['node-adapter.mjs','owned-process.mjs'])await cp(path.join(app,'supabase/workers/companion-push',file),path.join(fixture,file));
await writeFile(path.join(fixture,'runtime-package.mjs'),`export async function verifyRuntimePackage(){await new Promise(r=>setTimeout(r,${delay}));return {runtime:${JSON.stringify(path.join(fixture,'runtime'))},executable:process.execPath};}`);
// Only the package-verification dependency is delayed. The adapter and process
// owner are exact source copies. The deadline factory is compressed to 30 ms.
const realTimeout=AbortSignal.timeout;
let deadlineFiredAt;
AbortSignal.timeout=ms=>{assert.equal(ms,110000);const signal=realTimeout(deadline);signal.addEventListener('abort',()=>{deadlineFiredAt=performance.now();});return signal;};
Object.defineProperty(process,'platform',{value:'linux'});Object.defineProperty(process,'arch',{value:'x64'});
const secret='synthetic-operator-secret-00000000000000000';
process.env.COMPANION_PUSH_ENABLED='true';process.env.COMPANION_PUSH_OPERATOR_SECRET=secret;
process.env.COMPANION_PUSH_DATABASE_URL='postgres://companion_push_worker:synthetic@db.invalid/postgres?sslmode=verify-full';
const {handlePush}=await import(pathToFileURL(path.join(fixture,'node-adapter.mjs')).href);
const start=performance.now();const result=await handlePush(new Request('https://fixture.invalid/api/cron/companion-push',{headers:{authorization:'Bearer '+secret}}));
const done=performance.now();
const record={configuredMs:110000,measuredDeadlineMs:deadline,verificationDelayMs:delay,deadlineFiredAtMs:deadlineFiredAt-start,returnedAtMs:done-start,status:result.status,body:await result.json()};
console.log(JSON.stringify(record));
assert.ok(done-deadlineFiredAt<(real?1000:70),'handler continued waiting for package verification beyond its whole-cycle deadline');
