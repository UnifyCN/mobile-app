import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
const sha = (data) => createHash('sha256').update(data).digest('hex');

async function stalledIO(phase, cancel = false) {
  const fixture = await mkdtemp(path.join(tmpdir(), 'unify-push-deadline-test-'));
  try {
    const dir = path.join(fixture, 'supabase/workers/companion-push');
    const runtime = path.join(dir, '.runtime/linux-x64');
    await mkdir(path.join(runtime, 'cache'), { recursive: true });
    // The application modules are exact source copies. Only OS boundaries below
    // have controlled timing and process creation.
    for (const file of ['node-adapter.mjs', 'runtime-package.mjs', 'owned-process.mjs']) {
      await copyFile(new URL(file, import.meta.url), path.join(dir, file));
    }
    const binary = 'synthetic executable';
    const cache = 'synthetic dependency';
    const lock = '{}';
    await writeFile(path.join(runtime, 'deno'), binary);
    await writeFile(path.join(runtime, 'cache/entry.js'), cache);
    await writeFile(path.join(dir, 'deno.lock'), lock);
    await writeFile(path.join(dir, 'runtime-pins.json'), JSON.stringify({
      version: '2.9.8', 'linux-x64': { binarySha256: sha(binary) },
    }));
    await writeFile(path.join(runtime, 'manifest.json'), JSON.stringify({
      version: '2.9.8', target: 'linux-x64', bytes: binary.length + cache.length,
      lockSha256: sha(lock), files: [
        { path: 'deno', bytes: binary.length, sha256: sha(binary) },
        { path: 'cache/entry.js', bytes: cache.length, sha256: sha(cache) },
      ],
    }));
    const source = `
      import assert from 'node:assert/strict';
      import fsp from 'node:fs/promises';
      import processes from 'node:child_process';
      import { EventEmitter } from 'node:events';
      import { syncBuiltinESMExports } from 'node:module';
      import { pathToFileURL } from 'node:url';
      import path from 'node:path';
      const phase = ${JSON.stringify(phase)};
      const cancel = ${JSON.stringify(cancel)};
      const original = { readFile: fsp.readFile, mkdtemp: fsp.mkdtemp, cp: fsp.cp, rm: fsp.rm };
      let held = false, spawns = 0, abortAt;
      const pause = async (at) => {
        if (at === phase && !held) {
          held = true;
          await new Promise(resolve => setTimeout(resolve, 180));
        }
      };
      fsp.readFile = async (...args) => {
        if (String(args[0]).endsWith('runtime-pins.json')) await pause('verification');
        return original.readFile(...args);
      };
      fsp.mkdtemp = async (...args) => { await pause('directory'); return original.mkdtemp(...args); };
      fsp.cp = async (...args) => { await pause('copy'); return original.cp(...args); };
      fsp.rm = async (...args) => { await pause('cleanup'); return original.rm(...args); };
      processes.spawn = () => {
        spawns++;
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 0));
        return child;
      };
      syncBuiltinESMExports();
      const timeout = AbortSignal.timeout;
      AbortSignal.timeout = milliseconds => {
        assert.equal(milliseconds, 110000);
        const signal = timeout(35);
        signal.addEventListener('abort', () => { if (!cancel) abortAt ??= performance.now(); });
        return signal;
      };
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      const secret = 'synthetic-operator-secret-00000000000000000';
      Object.assign(process.env, {
        COMPANION_PUSH_ENABLED: 'true', COMPANION_PUSH_OPERATOR_SECRET: secret,
        COMPANION_PUSH_DATABASE_URL: 'postgres://companion_push_worker:synthetic@db.invalid/postgres?sslmode=verify-full',
      });
      const { handlePush } = await import(pathToFileURL(path.join(process.cwd(), 'supabase/workers/companion-push/node-adapter.mjs')));
      const controller = new AbortController();
      const request = signal => new Request('https://fixture.invalid/api/cron/companion-push', {
        headers: { authorization: 'Bearer ' + secret }, signal,
      });
      if (cancel) setTimeout(() => { abortAt = performance.now(); controller.abort(); }, 10);
      const started = performance.now();
      const first = await handlePush(request(controller.signal));
      const returned = performance.now();
      assert.ok(held, 'the selected OS operation must actually stall');
      assert.ok(returned - abortAt < 80, 'the HTTP handler stayed pending after cancellation');
      assert.equal(first.status, cancel ? 499 : 504);
      assert.deepEqual(await first.json(), { ok: false });
      const second = await handlePush(request());
      assert.equal(second.status, 200, 'the expired invocation must release the busy guard');
      await new Promise(resolve => setTimeout(resolve, 220));
      assert.equal(spawns, phase === 'cleanup' ? 2 : 1, 'late preparation must not start a process');
      let leftovers = [];
      for (let i = 0; i < 100; i++) {
        leftovers = (await fsp.readdir(process.cwd())).filter(name => name.startsWith('unify-push-'));
        if (!leftovers.length) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.deepEqual(leftovers, [], 'late-created and copied directories must be removed');
      console.log(JSON.stringify({ phase, cancel, status: first.status, returnedMs: returned - started,
        afterAbortMs: returned - abortAt, secondStatus: second.status, spawns, leftovers }));
    `;
    const result = await execute(process.execPath, ['--input-type=module', '-e', source], {
      cwd: fixture, env: { TMPDIR: fixture }, timeout: 5000,
    });
    return JSON.parse(result.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test('HTTP deadline bounds stalled verification, directory creation, copying and cleanup', async (context) => {
  for (const phase of ['verification', 'directory', 'copy', 'cleanup']) {
    await context.test(phase, async () => {
      const result = await stalledIO(phase);
      assert.equal(result.status, 504);
      assert.equal(result.secondStatus, 200);
      assert.deepEqual(result.leftovers, []);
      console.log(JSON.stringify(result));
    });
  }
});

test('request cancellation also bounds preparation and prevents a late process', async () => {
  const result = await stalledIO('verification', true);
  assert.equal(result.status, 499);
  assert.equal(result.secondStatus, 200);
  assert.deepEqual(result.leftovers, []);
  console.log(JSON.stringify(result));
});
