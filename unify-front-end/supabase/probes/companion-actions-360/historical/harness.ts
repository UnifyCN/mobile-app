// Installs a harness into a released checkout and runs the checkout's own test runner on it.
// No database access, so it is tested on its own (harness_test.ts).
import { assert, assertEquals } from 'jsr:@std/assert@1';

/** What a released client needs to run one phase: where the app is and how to run the harness. */
export interface Client {
  /** Directory inside the checkout that holds package.json. */
  app: string;
  /** Harness in this directory, and the file name it gets inside the checkout. */
  harness: string;
  harnessName: string;
  /** The runner command, given the harness path relative to the app directory. */
  command: (harnessPath: string) => string[];
  env: Record<string, string>;
}

export interface Snapshot extends Client {
  label: string;
  /** Detached checkout of a released commit, with its own `npm ci`. */
  dir: string;
  sha: string;
}

/** Released mobile JavaScript, run by its own Jest (historical_test.ts). */
export function mobileClient(): Client {
  return {
    app: 'unify-front-end',
    harness: 'historical_client.jest.ts', harnessName: 'historicalClient.test.ts',
    command: (p) => ['npx', 'jest', p, '--watchAll=false', '--ci', '--runInBand', '--no-cache'],
    env: {
      EXPO_PUBLIC_SUPABASE_URL: Deno.env.get('PROBE_API_URL')!, EXPO_PUBLIC_SUPABASE_ANON_KEY: Deno.env.get('PROBE_ANON_KEY')!,
    },
  };
}

/** The web app's checklist consumer, run by its own Vitest (web_consumer_test.ts). */
export function webClient(): Client {
  return {
    app: '.',
    harness: 'web_consumer.vitest.ts', harnessName: 'webConsumer.test.ts',
    command: (p) => ['npx', 'vitest', 'run', p],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Deno.env.get('PROBE_API_URL')!, NEXT_PUBLIC_SUPABASE_ANON_KEY: Deno.env.get('PROBE_ANON_KEY')!,
    },
  };
}

/**
 * Copies the harness into a directory of the app that this run creates (mkdir fails if
 * the name exists), runs body with the harness path relative to the app, then removes
 * that one file and the directory only if it is empty. Nothing else in the checkout is
 * written or removed; whatever the runner leaves in the directory stays and is reported.
 */
export async function withHarness<T>(s: Snapshot, body: (harnessPath: string) => Promise<T>): Promise<T> {
  if (!/^[\w.-]+$/.test(s.harnessName) || /^\.+$/.test(s.harnessName)) {
    throw new Error(`harness name must be one plain file name: ${JSON.stringify(s.harnessName)}`);
  }
  const ownDir = `__probe360__-${crypto.randomUUID()}`;
  const rel = `${ownDir}/${s.harnessName}`;
  await Deno.mkdir(`${s.dir}/${s.app}/${ownDir}`);
  await Deno.writeFile(`${s.dir}/${s.app}/${rel}`,
    await Deno.readFile(new URL(`./${s.harness}`, import.meta.url)), { createNew: true });

  const removeOwned = async () => {
    await Deno.remove(`${s.dir}/${s.app}/${rel}`).catch((e) => { if (!(e instanceof Deno.errors.NotFound)) throw e; });
    const left = [];
    for await (const e of Deno.readDir(`${s.dir}/${s.app}/${ownDir}`)) left.push(e.name);
    if (left.length) throw new Error(`${s.label}: the runner left ${left.join(', ')} in ${s.dir}/${s.app}/${ownDir}; not removed`);
    await Deno.remove(`${s.dir}/${s.app}/${ownDir}`);
  };
  let result: T;
  try {
    result = await body(rel);
  } catch (e) {
    await removeOwned().catch((c) => console.error(c));
    throw e;
  }
  await removeOwned();
  return result;
}

/** Runs one phase with the snapshot's own runner; returns the harness's JSON result. */
export async function runClient(s: Snapshot, harnessPath: string, phase: string, work: string, env: Record<string, string>) {
  const outFile = `${work}/${phase}.json`;
  const command = s.command(harnessPath);
  const r = await new Deno.Command(command[0], {
    args: command.slice(1), cwd: `${s.dir}/${s.app}`, stdout: 'piped', stderr: 'piped',
    env: { PROBE_PHASE: phase, PROBE_OUT: outFile, PROBE_CARRY: `${work}/carry.json`, ...env, ...s.env },
  }).output();
  const log = new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr);
  await Deno.writeTextFile(`${work}/${phase}.log`, log);
  assert(r.success, `${s.label} ${phase}: the snapshot's own test runner failed\n${log.slice(-4000)}`);
  const res = JSON.parse(await Deno.readTextFile(outFile));
  assertEquals(res.clientUrlIsLocal, true);
  return res;
}
