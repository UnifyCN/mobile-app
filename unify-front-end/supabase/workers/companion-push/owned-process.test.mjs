import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runOwnedProcess } from './owned-process.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const deno = process.env.COMPANION_TEST_DENO;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function alive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      if (stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')) return false;
    }
    return true;
  } catch (error) {
    if (['ESRCH', 'ENOENT'].includes(error.code)) return false;
    throw error;
  }
}
for (const mode of ['tree', 'exit-parent']) {
  test(`kills actual Deno descendants after ${mode}`, async () => {
    assert.ok(deno, 'COMPANION_TEST_DENO must name a real runtime; missing runtime is a failure');
    const result = await runOwnedProcess(deno, ['run', '--no-config', '--no-prompt', '--no-lock',
      '--allow-run', root + 'readiness.ts', mode], {
      cwd: root, env: { DENO_NO_UPDATE_CHECK: '1' }, timeoutMs: 900, capture: true,
    });
    assert.equal(result.timedOut, mode === 'tree');
    const report = JSON.parse(result.output);
    assert.equal(report.pids.length, 3);
    assert.equal(new Set(report.pids).size, 3);
    for (let i = 0; i < 40 && (await Promise.all(report.pids.map(alive))).some(Boolean); i++) await pause(25);
    assert.deepEqual(await Promise.all(report.pids.map(alive)), [false, false, false]);
  });
}
test('abort kills a process immediately after spawn', async () => {
  const controller = new AbortController();
  const pending = runOwnedProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    cwd: root, env: {}, timeoutMs: 1000, signal: controller.signal,
  });
  controller.abort();
  const result = await pending;
  assert.equal(result.aborted, true);
  assert.equal(result.ok, false);
});
test('abort kills the complete Deno tree after all descendants start', async () => {
  assert.ok(deno, 'a real runtime is required');
  const controller = new AbortController();
  const result = await runOwnedProcess(deno, ['run', '--no-config', '--no-prompt', '--no-lock',
    '--allow-run', root + 'readiness.ts', 'tree'], {
    cwd: root, env: { DENO_NO_UPDATE_CHECK: '1' }, timeoutMs: 3000, capture: true,
    signal: controller.signal, onReport: (output) => { if (output.endsWith('\n')) controller.abort(); },
  });
  const report = JSON.parse(result.output);
  assert.equal(report.pids.length, 3);
  assert.equal(result.aborted, true);
  for (let i = 0; i < 40 && (await Promise.all(report.pids.map(alive))).some(Boolean); i++) await pause(25);
  assert.deepEqual(await Promise.all(report.pids.map(alive)), [false, false, false]);
});
test('spawn failure returns only a fixed failure result', async () => {
  const result = await runOwnedProcess(root + 'absent', [], { cwd: root, env: {}, timeoutMs: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.output, '');
});
