import { assertEquals, assert } from 'jsr:@std/assert@1';
import { ready, newAccount, apply, read, sql, stepCreate, startContentStub, waitForBlocked, testOpts } from './support.ts';
await ready(); startContentStub();
for (const mode of ['completion','dismissal']) {
Deno.test({ name: `invariant: ${mode} committed and read before step insertion prevents the held step`, ...testOpts, fn: async () => {
 const who = await newAccount(`review-${mode}`); const ref='sanity:sin-number';
 const before=await read(who); assertEquals(before.status,200); assertEquals(before.json.steps,[]);
 let release!:()=>void; let acquired!:()=>void;
 const held = new Promise<void>(r=>release=r); const locked=new Promise<void>(r=>acquired=r);
 const tx=sql.begin(async t=> { await t`select pg_advisory_xact_lock(hashtextextended(${who.id}::text || ':' || ${ref}::text,366))`;acquired();await held; });
 await locked;
 let pending: ReturnType<typeof apply> | undefined; let legacyP: Promise<any> | undefined; let midChanged=false;
 const timeline:any[]=[];
 try {
  pending=apply(who,[stepCreate(ref,[`held ${mode} step`])]);
  const blocked=await waitForBlocked(1);assert(blocked>=1,'apply did not reach its advisory lock');
  const locks=await sql`select wait_event, query from pg_stat_activity where wait_event_type='Lock' and query ilike '%companion_apply_actions%'`;timeline.push({event:'apply-blocked-after-parent-read',locks});
  const row={user_id:who.id,sanity_checklist_id:'sin-number',...(mode==='completion'?{completed:true,completed_at:new Date().toISOString()}:{dismissed_at:new Date().toISOString()})};
  legacyP=Promise.resolve(who.client.from('user_tasks').upsert(row,{onConflict:'user_id,sanity_checklist_id'}).select('completed,dismissed_at,revision'));
  const legacyBlocked=await waitForBlocked(1,'%"user_tasks"%',1500);timeline.push({event:'legacy-started',legacyBlocked});
  const mid=await read(who);assertEquals(mid.status,200);assertEquals(mid.json.steps,[]);const parent=mid.json.tasks.find((t:any)=>t.task_ref===ref);midChanged=!!parent&&(mode==='completion'?parent.state==='completed':parent.removed===true);timeline.push({event:'public-read-before-release',status:mid.status,json:mid.json});
 } finally {release();await tx;}
 const result=await pending!;timeline.push({event:'apply-after-release',status:result.status,json:result.json});
 const legacy=await legacyP!;assertEquals(legacy.error,null);timeline.push({event:'legacy-committed',status:legacy.status,data:legacy.data});
 const after=await read(who);timeline.push({event:'public-read-after-release',status:after.status,json:after.json});
 console.log(JSON.stringify({mode,timeline}));
 if(midChanged){
 assertEquals(result.status,422,`step persisted after ${mode} was committed AND publicly read while no step existed`);
 assertEquals(after.json.steps.length,0);
 } else {
 // The legacy write waited for the held parent: the step committed first and is history.
 assertEquals(result.status,200);assertEquals(after.json.steps.length,1);
 const p=after.json.tasks.find((t:any)=>t.task_ref===ref);assert(mode==='completion'?p.state==='completed':p.removed===true);
 }
}});
}
Deno.test({name:'control: completion committed before step request is refused',...testOpts,fn:async()=>{const who=await newAccount('review-serial');const legacy=await who.client.from('user_tasks').insert({user_id:who.id,sanity_checklist_id:'sin-number',completed:true});assertEquals(legacy.error,null);const result=await apply(who,[stepCreate('sanity:sin-number',['must refuse'])]);console.log(JSON.stringify({control:result}));assertEquals([result.status,result.json.reason],[422,'task_completed']);}});
