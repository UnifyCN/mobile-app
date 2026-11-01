// Swaps the stack's #366 SQL to the current files: rollback script, then migration.
import { assert } from 'jsr:@std/assert@1';
import { migrate366, migration366Applied, openGate, sql } from 'file:///tmp/unify-merge-362-web/supabase/tests/companion-actions/support.ts';
Deno.test({ name: 'reapply #366', sanitizeOps: false, sanitizeResources: false, fn: async () => {
  if (await migration366Applied()) await migrate366('down');
  await migrate366('up');
  await openGate();
  const [r] = await sql`select pg_get_functiondef('public.companion_recheck_proposal(uuid,jsonb,jsonb)'::regprocedure) like '%companion_step_parent_lock%' as fixed`;
  console.log(JSON.stringify(r));
  assert(r.fixed !== undefined);
} });
