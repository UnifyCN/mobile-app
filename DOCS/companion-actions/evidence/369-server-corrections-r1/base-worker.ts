// Separate worker. A due event proves scheduling only. No provider call here.
import { publishedTaskAvailable } from '../../functions/rag-query/lib/context/appContext.ts';
import { PUSH_COPY } from './copy.ts';
import type postgres from 'npm:postgres@3.4.9';
export type Database = ReturnType<typeof postgres>;
export async function enqueue(db: Database): Promise<number> {
  return await db.begin(async tx => {
    const [settings] = await tx`select * from companion_push_private.settings for share`;
    if (!settings) return 0;
    const events = await tx`select e.*,r.task_ref,r.status from companion_reminder_private.events e
      join public.companion_task_reminders r on r.id=e.reminder_id and r.user_id=e.user_id
      where not exists(select 1 from companion_push_private.events x where x.reminder_id=e.reminder_id)
      order by e.due_at limit 100 for update of e skip locked`;
    let count=0;
    for (const e of events) {
      const reason = !settings.dispatch_enabled ? 'dispatch_disabled' :
        !settings.dispatch_not_before || e.due_at < settings.dispatch_not_before ? 'pre_enablement' :
        e.status !== 'pending' ? 'cancelled' : 'consumed';
      const [consumed] = await tx`insert into companion_push_private.events(reminder_id,user_id,reason)
        values(${e.reminder_id},${e.user_id},${reason}) on conflict do nothing returning reminder_id`;
      if (!consumed) continue;
      if (reason === 'consumed') {
        await tx`insert into companion_push_private.deliveries(reminder_id,user_id,task_ref,installation_id,generation,token_id,state)
          select ${e.reminder_id},n.user_id,${e.task_ref},n.installation_id,n.generation,n.token_id,
            case when n.enabled and n.revoked_at is null and n.token_id is not null
              and companion_push_private.session_authorized(n.session_id,n.user_id) then 'queued' else 'suppressed' end
          from companion_push_private.enrollments n where n.user_id=${e.user_id} on conflict do nothing`;
        await tx`update companion_push_private.events set reason='no_eligible_installation' where reminder_id=${e.reminder_id}
          and not exists(select 1 from companion_push_private.deliveries where reminder_id=${e.reminder_id} and state='queued')`;
      }
      count++;
    }
    return count;
  });
}
export interface WorkerConfig { fixture?: boolean; providerURL?: string; contentURL?: string; projectId?: string; dataset?: string; accessToken?: string }

const SEND_URL='https://exp.host/--/api/v2/push/send';
const RECEIPT_URL='https://exp.host/--/api/v2/push/getReceipts';
function endpoint(config:WorkerConfig,receipts=false):string {
  if (!config.fixture) {
    if (config.providerURL || config.contentURL) throw Error('fixture_configuration_forbidden');
    return receipts?RECEIPT_URL:SEND_URL;
  }
  const url=new URL(config.providerURL??'');
  if(url.origin!=='http://127.0.0.1:63615')throw Error('loopback_fixture_required');
  if(config.contentURL && new URL(config.contentURL).origin!=='http://127.0.0.1:63614')throw Error('loopback_content_required');
  return url.origin+(receipts?'/receipts':'/send');
}
function budgetReady(p:Record<string,any>):boolean {
  return p.dispatch_enabled && p.dispatch_not_before && p.policy_verified_at && p.policy_valid_until>new Date() &&
    p.maximum_seconds!==null && p.inactivity_seconds!==null && p.aggregate_verified_at && p.aggregate_valid_until>new Date() &&
    p.companion_per_minute>0 && p.receipt_per_minute>0 && p.provider_project_per_second>p.other_senders_reserved_per_second &&
    p.other_senders_reserved_per_second!==null && p.provider_project_per_second<=600;
}
async function takeBudget(tx:postgres.TransactionSql,receipt=false):Promise<boolean> {
  const [p]=await tx`select * from companion_push_private.settings for share`;
  if(!p || !budgetReady(p))return false;
  const [b]=await tx`select * from companion_push_private.budget for update`;
  const now=new Date(), second=new Date(Math.floor(now.getTime()/1000)*1000),minute=new Date(Math.floor(now.getTime()/60000)*60000);
  const sendsSecond=+b.second_at===+second?Number(b.sends_second):0;
  const sendsMinute=+b.minute_at===+minute?Number(b.sends_minute):0;
  const receiptsMinute=+b.minute_at===+minute?Number(b.receipts_minute):0;
  if(b.blocked_until>now || (receipt?receiptsMinute>=p.receipt_per_minute:
    sendsMinute>=p.companion_per_minute || sendsSecond>=p.provider_project_per_second-p.other_senders_reserved_per_second))return false;
  await tx`update companion_push_private.budget set second_at=${second},minute_at=${minute},
    sends_second=${sendsSecond+(receipt?0:1)},sends_minute=${sendsMinute+(receipt?0:1)},receipts_minute=${receiptsMinute+(receipt?1:0)}`;
  return true;
}
/** Recovery never changes an intent back to queued. Row locks order against a live sender. */
export async function recoverUnknown(db:Database,id?:string):Promise<void> {
  await db.begin(async tx=>{
    await tx`set local lock_timeout='2800ms'`;
    await tx`set local statement_timeout='3000ms'`;
    const rows=id?await tx`update companion_push_private.deliveries set state='unknown' where id=${id}::uuid and state='dispatching' returning id`:
      await tx`update companion_push_private.deliveries set state='unknown' where state='dispatching' returning id`;
    for(const d of rows)await tx`update companion_push_private.attempts set outcome='unknown' where delivery_id=${d.id} and outcome='dispatching'`;
  });
}
/** One invocation, one delivery. The process supervisor is the crash boundary. */
export async function dispatch(db:Database,id:string,config:WorkerConfig):Promise<void> {
  const url=endpoint(config);
  const reserved=await db.begin(async tx=>{
    await tx`set local lock_timeout='1000ms'`;
    const [d]=await tx`select * from companion_push_private.deliveries where id=${id}::uuid for update`;
    if(!d || !['queued','retry_wait'].includes(d.state) || d.next_attempt_at>new Date())return null;
    const [p]=await tx`select * from companion_push_private.settings for share`;
    if(!p || d.attempt_count>=p.attempt_cap || !await takeBudget(tx))return null;
    const attempt=crypto.randomUUID();
    await tx`update companion_push_private.deliveries set state='dispatching',attempt_count=attempt_count+1 where id=${id}::uuid`;
    await tx`insert into companion_push_private.attempts(id,delivery_id,number) values(${attempt}::uuid,${id}::uuid,${d.attempt_count+1})`;
    return { user_id:String(d.user_id),task_ref:String(d.task_ref),reminder_id:String(d.reminder_id),installation_id:String(d.installation_id),
      generation:String(d.generation),token_id:String(d.token_id),attempt,attempt_count:Number(d.attempt_count)+1,
      retry_seconds:Number(p.retry_seconds),attempt_cap:Number(p.attempt_cap) };
  });
  if(!reserved)return;
  // This total deadline starts BEFORE the connection/transaction and lock acquisition.
  const signal=AbortSignal.timeout(2200);
  const inTime=async<T>(work:PromiseLike<T>):Promise<T>=>{
    signal.throwIfAborted();let abort!:()=>void;
    try{return await Promise.race([Promise.resolve(work),new Promise<never>((_,reject)=>{
      abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    })]);}finally{signal.removeEventListener('abort',abort);}
  };
  try {
    await db.begin(async tx=>{
      await tx`set local transaction_timeout='2500ms'`;
      await tx`set local statement_timeout='2200ms'`;
      await tx`set local lock_timeout='1000ms'`;
      signal.throwIfAborted();
      const d=reserved;
      await inTime(tx`select public.companion_step_parent_lock(${d.user_id}::uuid,${d.task_ref})`);
      let available=true;
      try {await inTime(tx.savepoint(t=>t`select public.companion_step_parent(${d.user_id}::uuid,${d.task_ref})`));}
      catch(e){if(['CA404','CA422'].includes((e as {code:string}).code))available=false;else throw e;}
      const [r]=await inTime(tx`select * from public.companion_task_reminders where id=${d.reminder_id}::uuid and user_id=${d.user_id}::uuid for update`);
      const [current]=await inTime(tx`select * from companion_push_private.deliveries where id=${id}::uuid for update`);
      if(current.state!=='dispatching')return;
      const [n]=await inTime(tx`select n.*,p.token from companion_push_private.enrollments n
        join public.push_tokens p on p.id=n.token_id and p.user_id=n.user_id
        join auth.sessions s on s.id=n.session_id and s.user_id=n.user_id
        where n.installation_id=${d.installation_id}::uuid and n.user_id=${d.user_id}::uuid and n.generation=${d.generation}::uuid
        and n.token_id=${d.token_id}::uuid and n.enabled and n.revoked_at is null
        and companion_push_private.session_authorized(n.session_id,n.user_id) for share of n,p,s`);
      const [p]=await inTime(tx`select * from companion_push_private.settings for share`);
      const prevent=async(reason:string)=>{
        signal.throwIfAborted();
        await inTime(tx`update companion_push_private.deliveries set state='cancelled' where id=${id}::uuid`);
        await inTime(tx`update companion_push_private.attempts set outcome=${reason} where id=${d.attempt}::uuid`);
      };
      if(!available || !r || r.status!=='pending' || !n || !p || !budgetReady(p)){await prevent('prevented');return;}
      if(d.task_ref.startsWith('sanity:')) {
        // Profile changes wait with the same bound. Use the established Checklist filters.
        const [profile]=await inTime(tx`select * from public.user_onboarding_profiles where id=${d.user_id}::uuid for share`);
        const access=await inTime(publishedTaskAvailable(profile??null,d.task_ref.slice(7),config.projectId?
          {projectId:config.projectId,dataset:config.dataset??'production'}:null,signal,config.contentURL));
        if(!access){await prevent('access_unavailable');return;}
      }
      // Last preventable POST boundary under parent, task, reminder, enrollment,
      // token, session, settings and profile authorization locks.
      const [authorization]=await inTime(tx`select companion_push_private.session_authorized(${n.session_id}::uuid,${d.user_id}::uuid) valid`);
      if(!authorization.valid || !budgetReady(p)){await prevent('authorization_expired');return;}
      signal.throwIfAborted();
      if(config.fixture && !String(n.token).includes('[synthetic369-'))throw Error('synthetic_token_required');
      let state='unknown',ticket:string|null=null,invalidToken=false;
      const copy=PUSH_COPY[n.locale];
      try {
        const response=await inTime(fetch(url,{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json',
          ...(config.accessToken?{authorization:'Bearer '+config.accessToken}:{})},body:JSON.stringify({to:n.token,...copy,
          data:{type:'companion_reminder',delivery_id:id},ttl:300,channelId:'companion-reminders'})}));
        if(response.status===429){state='retry_wait';if(response.body)await inTime(response.body.cancel());}
        else if(response.ok){
          const body=await inTime(response.json());const t=Array.isArray(body.data)?body.data.length===1?body.data[0]:null:body.data;
          if(t?.status==='ok' && typeof t.id==='string' && t.id.length>0 && t.id.length<=200){state='ticket_accepted';ticket=t.id;}
          else if(t?.status==='error' && typeof t.details?.error==='string'){
            state=t.details.error==='MessageRateExceeded'?'retry_wait':'permanent_failure';invalidToken=t.details.error==='DeviceNotRegistered';
          }
        }else if(response.body)await inTime(response.body.cancel());
      }catch{ /* Transport, response parsing, or deadline uncertainty never authorizes resend. */ }
      signal.throwIfAborted();
      if(state==='retry_wait' && d.attempt_count>=d.attempt_cap)state='permanent_failure';
      if(state==='retry_wait')await inTime(tx`update companion_push_private.budget set blocked_until=now()+${d.retry_seconds}*interval '1 second'`);
      if(invalidToken)await inTime(tx`update companion_push_private.enrollments set enabled=false,revision=revision+1
        where installation_id=${d.installation_id}::uuid and user_id=${d.user_id}::uuid and generation=${d.generation}::uuid and token_id=${d.token_id}::uuid`);
      await inTime(tx`update companion_push_private.deliveries set state=${state},ticket=${ticket},ticket_at=case when ${ticket}::text is null then null else now() end,
        receipt_check_at=case when ${ticket}::text is null then null else now()+interval '15 minutes' end,
        next_attempt_at=now()+${d.retry_seconds}*interval '1 second' where id=${id}::uuid`);
      await inTime(tx`update companion_push_private.attempts set outcome=${state},ticket=${ticket} where id=${d.attempt}::uuid`);
      signal.throwIfAborted();
    });
  } catch {
    // An uncertain commit might already contain a ticket. Recovery changes only an
    // unresolved intent. A fresh supervised process also runs this after hard exit.
    await recoverUnknown(db,id);
  }
}
/** Poll receipts only. Missing/malformed/expired receipts can never authorize a send. */
export async function reconcile(db:Database,id:string,config:WorkerConfig):Promise<void> {
  const url=endpoint(config,true);
  const [d]=await db`select * from companion_push_private.deliveries where id=${id}::uuid`;
  if(!d?.ticket || !['ticket_accepted','receipt_pending'].includes(d.state) || d.receipt_check_at>new Date())return;
  if(Date.now()-d.ticket_at.getTime()>=24*60*60*1000){
    await db`update companion_push_private.deliveries set state='receipt_expired' where id=${id}::uuid and state in ('ticket_accepted','receipt_pending')`;return;
  }
  if(!await db.begin(tx=>takeBudget(tx,true)))return;
  let receipt:{status?:unknown;details?:{error?:unknown}}|undefined;
  try{
    const res=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(2200),headers:{'content-type':'application/json',
      ...(config.accessToken?{authorization:'Bearer '+config.accessToken}:{})},body:JSON.stringify({ids:[d.ticket]})});
    if(res.status===429)await db`update companion_push_private.budget set blocked_until=now()+interval '30 seconds'`;
    if(res.ok)receipt=(await res.json()).data?.[d.ticket];else await res.body?.cancel();
  }catch{ /* A later receipt check is safe. A new send is not. */ }
  await db.begin(async tx=>{
    const [current]=await tx`select * from companion_push_private.deliveries where id=${id}::uuid for update`;
    if(!['ticket_accepted','receipt_pending'].includes(current.state) || current.ticket!==d.ticket)return;
    const state=receipt?.status==='ok'?'provider_accepted':receipt?.status==='error'?'permanent_failure':'receipt_pending';
    await tx`update companion_push_private.deliveries set state=${state},receipt=${typeof receipt?.status==='string'?receipt.status:null},receipt_check_at=now()+interval '15 minutes' where id=${id}::uuid`;
    if(receipt?.status==='error' && receipt.details?.error==='DeviceNotRegistered')
      await tx`update companion_push_private.enrollments set enabled=false,revision=revision+1
        where installation_id=${d.installation_id}::uuid and user_id=${d.user_id}::uuid and generation=${d.generation}::uuid and token_id=${d.token_id}::uuid`;
  });
}
