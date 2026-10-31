// Evidence for designs the decision record rejects. Each test builds the rejected
// design on top of the candidate and shows the concrete failure, so the rejection
// does not rest on argument alone.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { applyCandidate, candidateApplied, newAccount, sql } from './support.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: 'rejected: BEFORE DELETE soft-delete trigger breaks account deletion (delete_user cascade)', ...opts, fn: async () => {
  if (!(await candidateApplied())) await applyCandidate('up');
  await sql.unsafe(`
    create function public.probe_soft_delete() returns trigger language plpgsql security definer set search_path = public as $$
    begin
      if current_setting('role', true) in ('authenticated', 'anon') then
        update public.custom_checklist_tasks set removed_at = now() where id = old.id;
        return null;                      -- cancel the real delete
      end if;
      return old;
    end $$;
    create trigger probe_soft_delete before delete on public.custom_checklist_tasks
      for each row execute function public.probe_soft_delete();`);
  try {
    const a = await newAccount('doomed');
    await sql`insert into custom_checklist_tasks (user_id, priority, title) values (${a.id}, 'Do now', 'x')`;
    const r = await a.client.rpc('delete_user');
    const [{ users }] = await sql`select count(*)::int users from auth.users where id = ${a.id}`;
    const [{ orphans }] = await sql`select count(*)::int orphans from custom_checklist_tasks where user_id = ${a.id}`;
    // The account is gone while its private task row survives with a dangling owner, or the deletion fails.
    assert((r.error !== null && users === 1) || (users === 0 && orphans === 1),
      `expected failure or orphan, got error=${r.error?.message} users=${users} orphans=${orphans}`);
    console.log(`rejected-design outcome: error=${r.error?.message ?? 'none'} users_left=${users} orphan_tasks=${orphans}`);
  } finally {
    await sql`drop trigger probe_soft_delete on public.custom_checklist_tasks`;
    await sql`drop function public.probe_soft_delete()`;
  }
  // The candidate (no delete trigger) deletes cleanly.
  const b = await newAccount('clean');
  await sql`insert into custom_checklist_tasks (user_id, priority, title) values (${b.id}, 'Do now', 'x')`;
  assertEquals((await b.client.rpc('delete_user')).error, null);
  const [{ n }] = await sql`select count(*)::int n from custom_checklist_tasks where user_id = ${b.id}`;
  assertEquals(n, 0);
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
