// Older-client proof (#360): released mobile JavaScript, unmodified, against the
// hosted-shape baseline, after up.sql, after down.sql and after up.sql again.
//
// PROBE_HISTORICAL=<label>=<checkout dir>=<commit sha>
//   The checkout is a detached worktree of a released commit with its own `npm ci`.
//   snapshot.ts refuses it unless HEAD is that commit and no tracked file differs,
//   copies historical_client.jest.ts into a new directory that the run alone creates
//   (harness.ts), runs the snapshot's own Jest once per phase, removes only that file
//   and directory, and checks the tree again.
// Run through run.sh so the stack is reset to the baseline first (see README).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { sql } from '../support.ts';
import { mobileClient, runPhases, snapshotFromEnv } from './snapshot.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const { label, dir, sha } = snapshotFromEnv();

Deno.test({ name: `${label} (${sha.slice(0, 8)}): released checklist code behaves the same before, after, rolled back and re-applied`, ...opts, fn: async () => {
  const r = await runPhases({ label, dir, sha, ...mobileClient() });
  console.log(`${label}: supabase-js ${r.baseline.supabaseJsVersion}; dismissal module: ${r.baseline.hasDismissalModule}`);
  console.log(`${label} baseline scenario: ${JSON.stringify(r.baseline.scenario)}`);

  // No step of the old client errors in any phase, and every phase matches the baseline.
  for (const [k, v] of Object.entries(r.baseline.scenario)) assert(!String(v).startsWith('error'), `baseline ${k}: ${v}`);
  for (const phase of ['up', 'down', 'upagain']) {
    assertEquals(r[phase].scenario, r.baseline.scenario, `${label} ${phase}: old client behaviour changed`);
    assertEquals(r[phase].carry, r.baseline.carry, `${label} ${phase}: rows written by the old client before the migration changed`);
  }
  // The known uncheck behaviour of each release, recorded rather than assumed.
  const s1 = r.baseline.scenario.afterUncheck.find((t: any) => t.id === 's1');
  const deletesOnUncheck = !r.baseline.hasDismissalModule;
  assertEquals(s1.completed, deletesOnUncheck, deletesOnUncheck
    ? 'v1.6.0 unchecks with DELETE; hosted has no delete policy, so the row stays completed'
    : 'the OTA unchecks with UPDATE completed=false');

  // Old-client writes meeting rich state written through the new contract.
  for (const phase of ['up', 'upagain']) {
    const m = r[phase].mixed;
    assertEquals(m.waitingThenOldComplete, ['completed', null], `${phase}: old completion must clear waiting detail`);
    assertEquals(m.inProgressThenOldUncheck, 'in_progress', `${phase}: old uncheck of an unfinished task destroyed its state`);
    assertEquals(m.completedThenOldUncheck, deletesOnUncheck ? 'completed' : 'not_started', `${phase}: old uncheck of a completed task`);
    assertEquals(m.oldListAfterNewRemoval, [{ title: 'Kept', completed: false }], `${phase}: a task removed by the new client is visible to the old one`);
    assertEquals(m.reminderScheduled, 200);
    assertEquals(m.reminderAfterOldDelete, [{ status: 'cancelled', cancelled_reason: 'task_deleted' }], `${phase}: old delete left a reminder pending`);
    assertEquals(m.oldReadsOk, true);
  }
}});

Deno.test({ name: 'cleanup', ...opts, fn: async () => { await sql.end(); } });
