/// <reference lib="deno.ns" />
// Run one bounded cycle from an operator-managed service. No automatic Cron install.
// Deploy with a dedicated TLS-verified DB login and explicit grants. The account
// session policy and aggregate provider budget must also be verified in settings.
import { configuration, connect } from './process.ts';
import { enqueue, recoverUnknown } from './worker.ts';
export async function runIsolated(kind:'dispatch'|'receipt',id:string):Promise<number> {
  const child=new Deno.Command(Deno.execPath(),{args:['run','--no-prompt','--node-modules-dir=none',
    '--lock='+new URL('./deno.lock',import.meta.url).pathname,'--frozen','--allow-env','--allow-net','--allow-read',
    new URL('./process.ts',import.meta.url).pathname,kind,id],stdout:'null',stderr:'piped'}).spawn();
  const timeout=setTimeout(()=>{try{child.kill('SIGKILL');}catch{/* already exited */}},4000);
  try{const result=await child.output();
    if(!result.success)console.error(JSON.stringify({event:'companion_push_child_failed',exit_code:result.code,signal:result.signal}));
    return result.code;}
  finally{clearTimeout(timeout);}
}
if(import.meta.main){
  let db:ReturnType<typeof connect>|undefined;
  try{
    const {url}=configuration();db=connect(url);
    // On restart, quarantine every unresolved durable intent before selecting work.
    // This may suppress an intent reserved by another live cycle. It cannot resend.
    await recoverUnknown(db);await enqueue(db);
    const rows=await db`select id,state from companion_push_private.deliveries
      where (state in ('queued','retry_wait') and next_attempt_at<=now()) or
      (state in ('ticket_accepted','receipt_pending') and receipt_check_at<=now())
      order by created_at limit 20`;
    for(const row of rows){
      const exit=await runIsolated(['queued','retry_wait'].includes(row.state)?'dispatch':'receipt',row.id);
      if(exit!==0)Deno.exitCode=1;
      // Fresh DB commands run in this surviving process. A retained intent never retries.
      await recoverUnknown(db,row.id);
    }
  }catch{console.error('companion_push_cycle_failed');Deno.exitCode=1;}
  finally{await db?.end({timeout:.2});}
}
