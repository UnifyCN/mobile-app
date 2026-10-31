// Actual local scheduler probe. No worker call, mock timer, model or provider.
import { assert, assertEquals, AssertionError } from 'jsr:@std/assert@1.0.19';
import {
  admin, apply, call, existingCustomTask, holdOperationLock, newAccount,
  prepare, read, ready, migrate, setState, sql, status, taskOf, taskRemove,
  confirmedApproval, undo, uuid, type Account,
} from './.runtime/supabase/tests/companion-actions/support.ts';

const evidence: Record<string, unknown>[] = [];
const record = (name: string, data: unknown) => {
  evidence.push({ name, data });
  console.log(JSON.stringify({ name, data }));
  Deno.writeTextFileSync(new URL('./evidence/results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
};
const nap = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(f: () => Promise<T>, matches: (v: T) => boolean, label: string, ms = 12000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await f();
    if (matches(value)) return value;
    await nap(80);
  }
  throw new Error(`UNRESOLVED deadline: ${label}`);
}
function ok(reply: {status: number; json: any}) {
  assertEquals(reply.status, 200, JSON.stringify(reply.json));
  return reply.json;
}
async function task(a: Account) {
  const {ref, id} = await existingCustomTask(a, 'Synthetic scheduler task');
  const current = await taskOf(a, ref);
  return {ref,id,revision:current.revision};
}
function schedule(ref: string, rev: number, ms = 1800) {
  const instant = new Date(Date.now() + ms).toISOString();
  return {type:'probe.reminder_schedule',task_ref:ref,expected_revision:rev,
    remind_at:instant,time_zone:'Etc/UTC',wall_time:instant.slice(0,-1)};
}
async function saved(a: Account, op: ReturnType<typeof schedule>, operation_id = uuid()) {
  const result = ok(await apply(a,[op],{operation_id}));
  return {id:result.results[0].reminder_id,operation_id,result};
}
async function rows(id: string) {
  return await sql`select r.status,r.cancelled_reason,r.remind_at,r.time_zone,
    e.reminder_id is not null as claimed, e.due_at
    from public.companion_task_reminders r left join probe368.events e on e.reminder_id=r.id where r.id=${id}::uuid`;
}
async function due(a: Account, platform: 'ios'|'android'|'web' = 'ios') {
  return ok(await read(a,platform)).probe_due as any[];
}
async function claimed(id: string) {
  return await until(() => rows(id), r=>r[0]?.claimed, 'real Cron claim');
}
async function locks() {
  return await sql`select pid,application_name,wait_event_type,wait_event,
    pg_blocking_pids(pid) as blockers from pg_stat_activity
    where datname=current_database() and wait_event_type='Lock' order by pid`;
}
async function barrier() {
  let release!: () => void;
  let acquired!: () => void;
  const held = new Promise<void>(r=>release=r);
  const ready = new Promise<void>(r=>acquired=r);
  const tx = sql.begin(async t=>{
    await t`select pg_advisory_xact_lock(368,1)`;
    acquired();
    await held;
  });
  await ready;
  return async()=>{release();await tx;};
}
// The copied support pins all seven production migrations in their merged order.
await ready();
await sql.begin(async t=>await t.unsafe(await Deno.readTextFile(new URL('./prototype.sql',import.meta.url))));
await sql.unsafe(await Deno.readTextFile(new URL('./barriers.sql',import.meta.url)));
await until(async()=>admin.rpc('probe368_due',{p_user_id:uuid()}), r=>!r.error,'new RPC schema cache');
const [versions] = await sql`select version(),current_setting('TimeZone') as zone,
  (select extversion from pg_extension where extname='pg_cron') as cron`;
record('versions-clock',versions);
const a = await newAccount('scheduler-a');
const b = await newAccount('scheduler-b');
const options = {sanitizeOps:false,sanitizeResources:false};

Deno.test({name:'01 concurrent scheduling, durable retry, actual Cron due, owner isolation',...options,fn:async()=>{
  const t=await task(a), operation_id=uuid(), op=schedule(t.ref,t.revision,4000);
  const held=holdOperationLock(a.id,operation_id);
  await held.ready;
  const promises=[apply(a,[op],{operation_id}),apply(a,[op],{operation_id})];
  try {
    const waiting=await until(locks,r=>r.filter(x=>x.wait_event==='advisory').length>=2,'both authenticated retries waiting',2000);
    assertEquals((await sql`select count(*)::int as n from public.companion_task_reminders where task_ref=${t.ref}`)[0].n,0);
    record('duplicate-intermediate', {reminders:0,locks:waiting});
  } finally { await held.release(); }
  const rs=(await Promise.all(promises)).map(ok);
  assertEquals(rs.map(r=>r.replayed).sort(),[false,true]);
  assertEquals(rs[0].results[0].reminder_id,rs[1].results[0].reminder_id);
  const id=rs[0].results[0].reminder_id;
  assertEquals((await due(a)).filter(r=>r.reminder_id===id).length,0,'must not be due early');
  const observed=await claimed(id);
  assert(new Date(observed[0].due_at)>=new Date(op.remind_at),'Cron cannot claim early');
  for (const platform of ['ios','android','web'] as const) {
    assertEquals((await due(a,platform)).filter(r=>r.reminder_id===id).length,1);
    assertEquals((await due(b,platform)).filter(r=>r.reminder_id===id).length,0);
  }
  const foreign=await b.client.from('companion_task_reminders').select('id').eq('id',id);
  assertEquals(foreign.data,[]);
  assertEquals(ok(await status(a,operation_id)).status,'applied');
  assertEquals(ok(await apply(a,[op],{operation_id})).replayed,true);
  assertEquals((await apply(a,[{...op,remind_at:new Date(Date.now()+90000).toISOString()}],{operation_id})).status,409);
  assertEquals((await apply(b,[op])).status,404,'another account cannot schedule this task');
  assertEquals(ok(await status(b,operation_id)).status,'not_applied');
  await nap(1200);
  assertEquals((await sql`select count(*)::int as n from probe368.events where reminder_id=${id}::uuid`)[0].n,1);
  assertEquals((await sql`select count(*)::int as n from public.companion_task_reminders where task_ref=${t.ref}`)[0].n,1);
  assertEquals((await taskOf(a,t.ref)).state,'not_started');
  record('duplicate-due-owner',{statuses:[200,200],replays:[false,true],reminders:1,events:1,ownerPerPlatform:1,foreignPerPlatform:0,taskState:'not_started'});
}});

Deno.test({name:'02 persistence, stopped scheduler, scheduler error and read error stay separate',...options,fn:async()=>{
  const t=await task(a);
  const invalid={...schedule(t.ref,t.revision),time_zone:'Invalid/Zone'};
  assertEquals((await apply(a,[invalid])).status,422);
  assertEquals((await sql`select count(*)::int as n from public.companion_task_reminders where task_ref=${t.ref}`)[0].n,0);
  await sql`select cron.alter_job(jobid,active:=false) from cron.job where jobname='probe368-due'`;
  // Wait for an already running tick to finish before registering this schedule.
  await until(async()=>sql`select count(*)::int as n from cron.job_run_details where status='running'`,r=>r[0].n===0,'Cron idle');
  const x=await saved(a,schedule(t.ref,t.revision,500));
  await nap(1600);
  assertEquals((await rows(x.id))[0].claimed,false);
  assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,0);
  assertEquals(ok(await status(a,x.operation_id)).status,'applied');
  await sql`insert into probe368.faults values('scheduler')`;
  const before=(await sql`select coalesce(max(runid),0)::int as n from cron.job_run_details`)[0].n;
  await sql`select cron.alter_job(jobid,active:=true) from cron.job where jobname='probe368-due'`;
  await until(async()=>sql`select status,return_message from cron.job_run_details where runid>${before} and status='failed'`,r=>r.length>0,'actual Cron failed run');
  assertEquals((await rows(x.id))[0].claimed,false);
  await sql`delete from probe368.faults where kind='scheduler'`;
  await claimed(x.id);
  await sql`insert into probe368.faults values('read')`;
  const failed=await read(a);
  assertEquals(failed.status,500);
  assertEquals((await rows(x.id))[0].status,'pending');
  assertEquals((await taskOfWithoutRead(a,t.id)).completed,false);
  await sql`delete from probe368.faults where kind='read'`;
  assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,1);
  record('failure-boundaries',{invalidPersistence:422,persistedWhileCronOff:true,dueWhileCronOff:false,cronFailedRun:true,readFailure:500,recoveredReadCount:1,taskCompleted:false});
}});
async function taskOfWithoutRead(a: Account,id: number) {
  const r=await a.client.from('custom_checklist_tasks').select('completed').eq('id',id).single();
  assertEquals(r.error,null); return r.data!;
}

for (const kind of ['complete','remove'] as const) {
  for (const first of ['claim','stop'] as const) {
    Deno.test({name:`03 race ${kind}, ${first} commits first, Undo does not restart`,...options,fn:async()=>{
      const t=await task(a), x=await saved(a,schedule(t.ref,t.revision,2500));
      // For removal, prepare before either writer changes the task or reminder count.
      const p=kind==='remove'?ok(await prepare(a,taskRemove(t.ref,t.revision))).proposal:null;
      await sql`insert into probe368.barriers values(${t.ref},${first})`;
      const release=await barrier();
      let pending: Promise<any>|undefined;
      try {
        if (first==='claim') {
          await until(locks,r=>r.some(x=>x.wait_event==='advisory'),'Cron holds parent and waits at claim barrier');
          pending=kind==='complete'?apply(a,[setState(t.ref,'completed',t.revision)]):apply(a,p.operations,{authorization:confirmedApproval(p)});
        } else {
          pending=kind==='complete'?apply(a,[setState(t.ref,'completed',t.revision)]):apply(a,p.operations,{authorization:confirmedApproval(p)});
        }
        const waiting=await until(locks,r=>r.length>=2, 'both real transactions blocked', first==='stop'?5000:2000);
        const state=(await rows(x.id))[0];
        assertEquals([state.status,state.claimed],['pending',false]);
        const committed=await sql`select completed,removed_at from public.custom_checklist_tasks where id=${t.id}`;
        assertEquals([committed[0].completed,committed[0].removed_at],[false,null]);
        record(`race-${kind}-${first}-intermediate`,{reminderStatus:state.status,claimed:state.claimed,task:committed[0],locks:waiting});
      } finally { await release(); }
      const result=ok(await pending!);
      await until(async()=>sql`select count(*)::int as n from pg_stat_activity where application_name='pg_cron' and state='active'`,r=>r[0].n===0,'Cron transaction finished');
      const state=(await rows(x.id))[0];
      assertEquals(state.status,'cancelled');
      assertEquals(state.cancelled_reason,kind==='complete'?'task_completed':'task_removed');
      assertEquals(state.claimed,first==='claim');
      assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,0);
      ok(await undo(a,result.operation_id));
      const afterUndo=(await rows(x.id))[0];
      assertEquals(afterUndo.status,'cancelled');
      assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,0);
      assertEquals(ok(await status(a,x.operation_id)).status,'applied');
      assertEquals((await rows(x.id))[0].status,'cancelled');
      await sql`delete from probe368.barriers where task_ref=${t.ref}`;
      record(`race-${kind}-${first}-final`,{reminderStatus:state.status,reason:state.cancelled_reason,claimed:state.claimed,dueAfterStop:0,dueAfterUndo:0});
    }});
  }
}

Deno.test({name:'04 explicit cancel after claim, old retry, reopen and new explicit schedule',...options,fn:async()=>{
  const t=await task(a), op=schedule(t.ref,t.revision), x=await saved(a,op);
  await claimed(x.id);
  assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,1);
  ok(await apply(a,[{type:'probe.reminder_cancel',task_ref:t.ref,expected_revision:t.revision}]));
  assertEquals((await rows(x.id))[0].cancelled_reason,'user_cancelled');
  assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,0);
  assertEquals(ok(await apply(a,[op],{operation_id:x.operation_id})).replayed,true);
  ok(await apply(a,[setState(t.ref,'completed',t.revision)]));
  const now=await taskOf(a,t.ref);
  ok(await apply(a,[setState(t.ref,'not_started',now.revision)]));
  assertEquals((await rows(x.id))[0].status,'cancelled');
  const current=await taskOf(a,t.ref);
  const newSchedule=await saved(a,schedule(t.ref,current.revision));
  assert(newSchedule.id!==x.id);
  await claimed(newSchedule.id);
  assertEquals((await due(a)).filter(r=>r.task_ref===t.ref).length,1);
  record('explicit-cancel-reopen',{oldReplay:true,oldStatus:'cancelled',newExplicitEvent:1});
}});

Deno.test({name:'05 UTC persistence, named zone, DST gap and both fold instants',...options,fn:async()=>{
  const t=await task(a), zone='America/New_York';
  const op={...schedule(t.ref,t.revision),time_zone:zone,wall_time:'2027-03-14T02:30:00',remind_at:'2027-03-14T02:30:00-05:00'};
  assertEquals((await apply(a,[op])).status,422,'gap must not normalize silently');
  const missing={...op,wall_time:'2027-11-07T01:30:00',remind_at:'2027-11-07T01:30:00'};
  assertEquals((await apply(a,[missing])).status,422,'fold needs explicit offset');
  const ids:string[]=[];
  for(const offset of ['-04:00','-05:00']) {
    const result=await saved(a,{...op,wall_time:'2027-11-07T01:30:00',remind_at:'2027-11-07T01:30:00'+offset});
    ids.push(result.id);
  }
  const instants=await sql`select extract(epoch from remind_at)::bigint as epoch,time_zone from public.companion_task_reminders where id in (${ids[0]}::uuid,${ids[1]}::uuid) order by remind_at`;
  assertEquals(Number(instants[1].epoch)-Number(instants[0].epoch),3600);
  await sql.begin(async tx=>{
    await tx`set local time zone 'Asia/Tokyo'`;
    const changed=await tx`select extract(epoch from remind_at)::bigint as epoch,time_zone from public.companion_task_reminders where id in (${ids[0]}::uuid,${ids[1]}::uuid) order by remind_at`;
    const values=(rs: typeof instants)=>Array.from(rs,r=>({epoch:Number(r.epoch),time_zone:r.time_zone}));
    assertEquals(values(changed),values(instants));
  });
  record('clock-zone',{databaseClock:'real UTC wall clock, no clock override',gapStatus:422,foldWithoutOffset:422,foldEpochs:instants.map(x=>Number(x.epoch)),foldDifferenceSeconds:3600,zoneAfterSessionChange:zone});
}});

Deno.test({name:'06 binding SQL mutations return assertion RED, setup faults are unresolved',...options,fn:async()=>{
  const t=await task(a), x=await saved(a,schedule(t.ref,t.revision));
  await claimed(x.id);
  ok(await apply(a,[{type:'probe.reminder_cancel',task_ref:t.ref,expected_revision:t.revision}]));
  const [original]=await sql`select pg_get_functiondef('public.probe368_due(uuid)'::regprocedure) as def`;
  async function mutation(name:string,from:string,to:string,check:()=>Promise<void>) {
    assert(original.def.includes(from),'mutation must bind to the exact function');
    try {
      await sql.unsafe(original.def.replace(from,to));
      try { await check(); record(name,{verdict:'SURVIVED'}); throw new Error('surviving mutation'); }
      catch(e) {
        if(!(e instanceof AssertionError)) throw e;
        record(name,{verdict:'RED',class:'assertion',assertion:e.message.split('\n')[0]});
      }
    } finally { await sql.unsafe(original.def); }
  }
  await mutation('mutation-owner','r.user_id=p_user_id and','true and',async()=>{
    assertEquals((await due(b)).length,0,'owner boundary must return no foreign events');
  });
  await mutation('mutation-cancel-and-task-filter',"r.status='pending' and not t.completed and t.removed_at is null",'true',async()=>{
    assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,0,'stopped event must stay hidden');
  });
  const [tick]=await sql`select pg_get_functiondef('probe368.tick()'::regprocedure) as def`;
  const future=await saved(a,schedule(t.ref,t.revision,86400000));
  try {
    assertEquals(tick.def.split('remind_at <= clock_timestamp()').length,3);
    await sql.unsafe(tick.def.replaceAll('remind_at <= clock_timestamp()','true'));
    await claimed(future.id);
    try {
      assertEquals((await due(a)).filter(r=>r.reminder_id===future.id).length,0,'future reminder must not be delivered');
      throw new Error('surviving due-time mutation');
    } catch(e) {
      if(!(e instanceof AssertionError)) throw e;
      record('mutation-due-time',{verdict:'RED',class:'assertion',assertion:e.message.split('\n')[0]});
    }
  } finally {
    await sql.unsafe(tick.def);
    // The broken worker can also claim the future DST fixtures. Remove every
    // future event it created, then verify that no fault data remains.
    await sql`delete from probe368.events e using public.companion_task_reminders r
      where e.reminder_id=r.id and r.remind_at>clock_timestamp()`;
  }
  assertEquals((await due(a)).filter(r=>r.reminder_id===future.id).length,0);
  assertEquals((await sql`select count(*)::int as n from probe368.events e
    join public.companion_task_reminders r on r.id=e.reminder_id
    where r.remind_at>clock_timestamp()`)[0].n,0);
}});

Deno.test({name:'07 final actual scheduler evidence, no model quota call, permission denials',...options,fn:async()=>{
  const jobs=await sql`select jobname,schedule,command,active,username from cron.job`;
  assertEquals(jobs.length,1);
  assertEquals(jobs[0].command,'select probe368.tick()');
  const runs=await sql`select status,count(*)::int as count from cron.job_run_details group by status order by status`;
  assert(runs.some(r=>r.status==='succeeded'&&r.count>0));
  assert(runs.some(r=>r.status==='failed'&&r.count>0));
  const denied=await a.client.rpc('probe368_due',{p_user_id:b.id});
  assert(denied.error,'client cannot call service-role-only due RPC');
  const quota=await sql`select count(*)::int as n from public.quota_tripwire_calls`;
  assertEquals(quota[0].n,0);
  record('actual-cron-final',{jobs,runs,workerRuns:await sql`select actor,inserted,count(*)::int as n from probe368.runs group by actor,inserted order by actor,inserted`,directDueRpcDenied:true,modelQuotaCalls:0,survivingMutations:0});
  await Deno.writeTextFile(new URL('./evidence/results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
}});

Deno.test({name:'08 full merged rollback stops pending schedules and reapply cannot restart them',...options,fn:async()=>{
  const t=await task(a), op=schedule(t.ref,t.revision,60000), x=await saved(a,op);
  // The operator must unschedule the worker before removing its schema.
  await sql`select cron.unschedule(jobid) from cron.job where jobname='probe368-due'`;
  await until(async()=>sql`select count(*)::int as n from pg_stat_activity where application_name='pg_cron' and state='active'`,r=>r[0].n===0,'worker stopped before rollback');
  await sql.unsafe(`
    drop schema probe368 cascade;
    drop function public.probe368_due(uuid);
    drop function public.companion_validate_operations(jsonb);
    alter function public.probe368_original_validate(jsonb) rename to companion_validate_operations;
    drop function public.companion_apply_one(uuid,jsonb);
    alter function public.probe368_original_apply(uuid,jsonb) rename to companion_apply_one;
  `);
  await migrate('down');
  const archived=await sql`select row_data->>'status' as status,row_data->>'cancelled_reason' as reason
    from public.companion_rollback_archive where source='companion_task_reminders' and row_data->>'id'=${x.id}`;
  assertEquals(archived.map(r=>[r.status,r.reason]),[['cancelled','schema_rollback']]);
  await ready();
  await sql.begin(async tx=>await tx.unsafe(await Deno.readTextFile(new URL('./prototype.sql',import.meta.url))));
  await until(async()=>admin.rpc('probe368_due',{p_user_id:a.id}),r=>!r.error,'due RPC restored after reapply');
  assertEquals((await rows(x.id))[0].status,'cancelled');
  assertEquals((await rows(x.id))[0].cancelled_reason,'schema_rollback');
  assertEquals(ok(await apply(a,[op],{operation_id:x.operation_id})).replayed,true);
  await nap(1200);
  assertEquals((await due(a)).filter(r=>r.reminder_id===x.id).length,0);
  assertEquals((await rows(x.id))[0].claimed,false);
  record('schema-rollback',{archivedStatus:'cancelled',reason:'schema_rollback',replayedOldReceipt:true,restartedSchedules:0,workerUnscheduleBeforeDown:true});
}});
