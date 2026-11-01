// Runs a released client's own test runner, unmodified, once per migration phase.
// Shared by historical_test.ts (mobile) and web_consumer_test.ts (web).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ANON_KEY, API_URL, SERVICE_ROLE_KEY, applyCandidate, candidateApplied, openGate } from '../support.ts';
import { runClient, withHarness, type Snapshot } from './harness.ts';

export { mobileClient, webClient, type Client, type Snapshot } from './harness.ts';

/** PROBE_HISTORICAL=<label>=<checkout dir>=<commit sha> */
export function snapshotFromEnv(): { label: string; dir: string; sha: string } {
  const spec = Deno.env.get('PROBE_HISTORICAL');
  if (!spec) throw new Error('PROBE_HISTORICAL=<label>=<dir>=<sha> missing');
  const [label, dir, sha] = spec.split('=');
  return { label, dir, sha };
}

async function git(dir: string, ...args: string[]): Promise<string> {
  const r = await new Deno.Command('git', { args: ['-C', dir, ...args], stdout: 'piped', stderr: 'piped' }).output();
  if (!r.success) throw new Error(`git ${args.join(' ')}: ${new TextDecoder().decode(r.stderr)}`);
  return new TextDecoder().decode(r.stdout).trim();
}

/** The checkout is that commit and no tracked file differs from it. */
export async function assertImmutable(s: Snapshot, when: string) {
  assertEquals(await git(s.dir, 'rev-parse', 'HEAD'), s.sha, `${when}: ${s.label} is not at ${s.sha}`);
  assertEquals(await git(s.dir, 'status', '--porcelain', '--untracked-files=no'), '',
    `${when}: a tracked file of ${s.label} differs from ${s.sha}`);
}

/** baseline -> up -> down -> up again; returns each phase's JSON result. */
export async function runPhases(s: Snapshot): Promise<Record<string, any>> {
  assert(!(await candidateApplied()), 'run.sh must reset to the baseline first');
  await assertImmutable(s, 'before');
  const work = await Deno.makeTempDir({ prefix: `probe360-${s.label}-` });
  const env = { PROBE_API_URL: API_URL, PROBE_ANON_KEY: ANON_KEY, PROBE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY };

  const r: Record<string, any> = {};
  await withHarness(s, async (harnessPath) => {
    const run = (phase: string) => runClient(s, harnessPath, phase, work, env);
    r.baseline = await run('baseline');
    await applyCandidate('up');
    await openGate();
    r.up = await run('up');
    await applyCandidate('down');
    r.down = await run('down');
    await applyCandidate('up');
    await openGate();
    r.upagain = await run('upagain');
  });
  await assertImmutable(s, 'after');
  console.log(`${s.label}: logs and phase results in ${work}`);
  return r;
}
