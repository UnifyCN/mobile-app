// Harness staging inside a released checkout (Standards review round 2): the run must
// leave every path it did not create exactly as it found it, on success and on failure.
// Filesystem and subprocess only; uses throwaway git checkouts, no stack.
//   deno test --no-check --allow-read --allow-write --allow-run --allow-env historical/harness_test.ts
import { assert, assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';
import { type Client, mobileClient, runClient, type Snapshot, webClient, withHarness } from './harness.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
// The client factories read these; nothing here contacts them.
Deno.env.set('PROBE_API_URL', 'http://127.0.0.1:9');
Deno.env.set('PROBE_ANON_KEY', 'unused');
const UNRELATED = '__probe360__/notes.txt';
const read = (p: string) => Deno.readTextFile(p);

async function sh(cwd: string, ...args: string[]) {
  const r = await new Deno.Command(args[0], { args: args.slice(1), cwd, stdout: 'piped', stderr: 'piped' }).output();
  if (!r.success) throw new Error(`${args.join(' ')}: ${new TextDecoder().decode(r.stderr)}`);
  return new TextDecoder().decode(r.stdout);
}

/**
 * A committed checkout whose app directory already holds the untracked paths a careless
 * run would hit: an unrelated note and a file at the old fixed harness path.
 */
async function fixture(client: Client) {
  const dir = await Deno.makeTempDir({ prefix: 'probe360-harness-' });
  const app = `${dir}/${client.app}`;
  await Deno.mkdir(app, { recursive: true });
  await Deno.writeTextFile(`${app}/package.json`, '{}\n');
  await sh(dir, 'git', 'init', '-q');
  await sh(dir, 'git', '-c', 'user.email=p@probe.invalid', '-c', 'user.name=probe', 'add', '.');
  await sh(dir, 'git', '-c', 'user.email=p@probe.invalid', '-c', 'user.name=probe', 'commit', '-qm', 'released');
  const sha = (await sh(dir, 'git', 'rev-parse', 'HEAD')).trim();
  await Deno.mkdir(`${app}/__probe360__`);
  await Deno.writeTextFile(`${app}/${UNRELATED}`, 'not the probe\n');
  const existing = `__probe360__/${client.harnessName}`;
  await Deno.writeTextFile(`${app}/${existing}`, 'someone else\'s test\n');
  const before = await listing(app);
  return { dir, app, sha, existing, before };
}

/** Every path under the app directory with its content. */
async function listing(app: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (rel: string) => {
    for await (const e of Deno.readDir(`${app}/${rel}`)) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (p === '.git') continue;
      if (e.isDirectory) { out[`${p}/`] = ''; await walk(p); } else out[p] = await read(`${app}/${p}`);
    }
  };
  await walk('');
  return out;
}

/** A runner on PATH named npx: checks the harness exists where the command points, then reports. */
async function fakeNpx(exitCode: number): Promise<string> {
  const bin = await Deno.makeTempDir({ prefix: 'probe360-bin-' });
  await Deno.writeTextFile(`${bin}/npx`, `#!/bin/sh
runner="$1"; shift
for a in "$@"; do case "$a" in *.test.ts) harness="$a";; esac; done
[ -f "$PWD/$harness" ] || { echo "no harness at $PWD/$harness" >&2; exit 3; }
printf '{"clientUrlIsLocal":true,"runner":"%s","harness":"%s","bytes":%s}' "$runner" "$harness" "$(wc -c < "$PWD/$harness")" > "$PROBE_OUT"
exit ${exitCode}
`);
  await Deno.chmod(`${bin}/npx`, 0o755);
  return bin;
}

function snapshotFor(client: Client, f: { dir: string; sha: string }, bin: string): Snapshot {
  return { label: 'fixture', dir: f.dir, sha: f.sha, ...client, env: { ...client.env, PATH: `${bin}:${Deno.env.get('PATH')}` } };
}

const clients: [string, () => Client, string][] = [['mobile', mobileClient, 'jest'], ['web', webClient, 'vitest']];

for (const [name, make, runner] of clients) {
  Deno.test({ name: `${name}: the caller's own command runs the harness at a path this run alone created`, ...opts, fn: async () => {
    const client = make();
    const f = await fixture(client);
    const s = snapshotFor(client, f, await fakeNpx(0));
    const work = await Deno.makeTempDir();
    const source = await read(new URL(`./${client.harness}`, import.meta.url).pathname);
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      await withHarness(s, async (harnessPath) => {
        seen.push(harnessPath);
        assertNotEquals(harnessPath, f.existing, 'harness staged at the shared fixed path');
        assertEquals(await read(`${f.app}/${harnessPath}`), source);
        const res = await runClient(s, harnessPath, 'baseline', work, {});
        assertEquals([res.runner, res.harness, res.bytes], [runner, harnessPath, new TextEncoder().encode(source).length]);
      });
    }
    assertNotEquals(seen[0], seen[1], 'two runs share one staging path');
    assertEquals(await listing(f.app), f.before, 'a path the run did not create changed');
  }});

  Deno.test({ name: `${name}: unrelated untracked files and a file at the old harness path survive a failed runner`, ...opts, fn: async () => {
    const client = make();
    const f = await fixture(client);
    const s = snapshotFor(client, f, await fakeNpx(1));
    const work = await Deno.makeTempDir();
    await assertRejects(() => withHarness(s, (p) => runClient(s, p, 'baseline', work, {})), Error, 'own test runner failed');
    assertEquals(await listing(f.app), f.before, 'a path the run did not create changed');
  }});
}

Deno.test({ name: 'cleanup removes only the harness and leaves anything else in its directory', ...opts, fn: async () => {
  const client = mobileClient();
  const f = await fixture(client);
  const s = snapshotFor(client, f, await fakeNpx(0));
  let staged = '';
  await assertRejects(() => withHarness(s, async (p) => {
    staged = p;
    await Deno.writeTextFile(`${f.app}/${p.slice(0, p.lastIndexOf('/'))}/left-by-runner.txt`, 'keep');
  }), Error, 'left-by-runner.txt');
  const dir = staged.slice(0, staged.lastIndexOf('/'));
  assertEquals(await read(`${f.app}/${dir}/left-by-runner.txt`), 'keep');
  assertEquals((await listing(f.app))[staged], undefined, 'the harness itself was not removed');
  const { [`${dir}/`]: _d, [`${dir}/left-by-runner.txt`]: _l, ...rest } = await listing(f.app);
  assertEquals(rest, f.before);
}});

Deno.test({ name: 'a harness name that leaves the staging directory is refused before any write', ...opts, fn: async () => {
  for (const harnessName of ['../escape.test.ts', 'a/b.test.ts', '..', '']) {
    const client = { ...mobileClient(), harnessName };
    const f = await fixture(mobileClient());
    let ran = false;
    await assertRejects(() => withHarness(snapshotFor(client, f, '/nonexistent'), async () => { ran = true; }), Error, 'harness name');
    assert(!ran);
    assertEquals(await listing(f.app), f.before, `${harnessName}: a path changed`);
  }
}});
