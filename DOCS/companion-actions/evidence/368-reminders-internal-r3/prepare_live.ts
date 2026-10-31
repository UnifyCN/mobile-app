// Owned local setup only. This command executes no reminder acceptance assertion.
import {ready,sql,admin,uuid} from './.runtime/supabase/tests/companion-actions/support.ts';
try {
 await ready();
 const present=(await sql`select to_regprocedure('companion_reminder_private.tick()') is not null applied`)[0].applied;
 if(!present)await sql.begin(async tx=>await tx.unsafe(await Deno.readTextFile(new URL('./.runtime/supabase/migrations/20261029175439_companion_task_reminders.sql',import.meta.url))));
 const until=Date.now()+15000;let loaded=false;
 while(Date.now()<until){const reply=await admin.rpc('companion_read_reminders',{p_user_id:uuid()});if(!reply.error){loaded=true;break;}await new Promise(r=>setTimeout(r,100));}
 if(!loaded)throw new Error('Owned reminder schema cache did not become ready');
 console.log('READY: local foundation, reminder migration, gate and schema cache. No reminder acceptance assertion ran.');
} finally {await sql.end();}
