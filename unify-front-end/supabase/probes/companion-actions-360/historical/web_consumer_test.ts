// Web consumer proof (#360): the web app's real services/checklist.ts at a fixed web
// commit, unmodified, against the hosted-shape baseline, after up.sql, after down.sql
// and after up.sql again.
//
// PROBE_HISTORICAL=<label>=<web checkout dir>=<commit sha>
//   A detached web checkout with its own `npm ci`, plus jsdom installed with
//   `npm install --no-save jsdom` (no tracked file changes; snapshot.ts checks).
// Run through run.sh so the stack is reset to the baseline first (see README).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { sql } from '../support.ts';
import { runPhases, snapshotFromEnv, webClient } from './snapshot.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const { label, dir, sha } = snapshotFromEnv();

Deno.test({ name: `web ${label} (${sha.slice(0, 8)}): the web checklist consumer behaves the same before, after, rolled back and re-applied`, ...opts, fn: async () => {
  // Fixture, not part of the candidate: web getTasks reads persona and stage first. The
  // hosted read captured this table's policies but not its columns, so only the three
  // columns the consumer reads exist here, with the hosted own-row policies.
  await sql.unsafe(`
    create table public.user_onboarding_profiles (id uuid primary key references auth.users(id) on delete cascade, persona text, stage integer);
    alter table public.user_onboarding_profiles enable row level security;
    create policy "Users can view own onboarding profile" on public.user_onboarding_profiles for select using (auth.uid() = id);
    create policy "Users can create own onboarding profile" on public.user_onboarding_profiles for insert with check (auth.uid() = id);
    create policy "Users can update own onboarding profile" on public.user_onboarding_profiles for update using (auth.uid() = id) with check (auth.uid() = id);
    notify pgrst, 'reload schema';`);
  await new Promise(r => setTimeout(r, 1500));

  const r = await runPhases({ label, dir, sha, ...webClient() });
  console.log(`web ${label}: supabase-js ${r.baseline.supabaseJsVersion}, @supabase/ssr ${r.baseline.ssrVersion}`);
  console.log(`web ${label} baseline scenario: ${JSON.stringify(r.baseline.scenario)}`);

  const s = r.baseline.scenario;
  for (const [k, v] of Object.entries(s)) {
    if (k === 'addCustomEmptyDescription') continue;   // known, see below
    assert(!String(v).startsWith('error'), `baseline ${k}: ${v}`);
  }
  // Pre-existing web defect, unchanged by the candidate: an empty description is sent
  // as null into a NOT NULL column (decision record section 7).
  assert(String(s.addCustomEmptyDescription).startsWith('error: 23502'), String(s.addCustomEmptyDescription));
  for (const phase of ['up', 'down', 'upagain']) {
    assertEquals(r[phase].scenario, s, `web ${phase}: web consumer behaviour changed`);
    assertEquals(r[phase].carry, r.baseline.carry, `web ${phase}: rows written before the migration read differently`);
  }
  for (const phase of ['up', 'upagain']) {
    const m = r[phase].mixed;
    assertEquals(m.waitingShownAs, { key: 'w1', completed: false, dismissed: false, hasCompletedAt: false }, `${phase}: waiting must read as not completed on web`);
    assertEquals(m.waitingThenWebComplete, ['completed', null], `${phase}: web completion must clear waiting detail`);
    assertEquals(m.completedThenWebUncheck, 'not_started', `${phase}: web uncheck of a completed task`);
    assertEquals(m.webViewAfterNewRemoval, [{ key: 'custom:Kept', completed: false, dismissed: false, hasCompletedAt: false }], `${phase}: web shows a task the new client removed`);
    assertEquals(m.webCustomsAfterNewRemoval, ['Kept']);
    assertEquals(m.reminderScheduled, 200);
    assertEquals(m.reminderAfterWebDelete, [{ status: 'cancelled', cancelled_reason: 'task_deleted' }], `${phase}: web delete left a reminder pending`);
  }
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
