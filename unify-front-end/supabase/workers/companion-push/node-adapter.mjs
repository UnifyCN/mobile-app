import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runOwnedProcess } from './owned-process.mjs';
import { verifyRuntimePackage } from './runtime-package.mjs';

export const CYCLE_TIMEOUT_MS = 110_000;
const root = () => path.join(process.cwd(), 'supabase/workers/companion-push');
const hash = (value) => createHash('sha256').update(value).digest();
let busy = false;

function response(status, body) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function configurationStatus(request, mode, env) {
  if (!['cycle', 'readiness'].includes(mode)) return 404;
  if (mode === 'readiness') {
    if (env.VERCEL_ENV !== 'preview' || env.COMPANION_PUSH_READINESS_ENABLED !== 'true') return 404;
  } else if (env.COMPANION_PUSH_ENABLED !== 'true') return 503;
  const secret = env.COMPANION_PUSH_OPERATOR_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) return 503;
  const header = request.headers.get('authorization') ?? '';
  if (header.length > 1024 || !timingSafeEqual(hash(header), hash(`Bearer ${secret}`))) return 401;
  if (mode === 'cycle') {
    try {
      const url = new URL(env.COMPANION_PUSH_DATABASE_URL ?? '');
      const username = decodeURIComponent(url.username);
      const sessionPoolerLogin = /^companion_push_worker\.[a-z]{20}$/.test(username) &&
        /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.port === '5432';
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        (username !== 'companion_push_worker' && !sessionPoolerLogin) || !url.password ||
        url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'verify-full' ||
        env.COMPANION_PUSH_FIXTURE !== undefined || env.COMPANION_PUSH_FIXTURE_URL !== undefined ||
        env.COMPANION_PUSH_FIXTURE_CONTENT_URL !== undefined) return 503;
    } catch { return 503; }
  }
  return 200;
}

async function runtimeFiles() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw Error('deployment_runtime_required');
  const dir = root();
  return { dir, ...await verifyRuntimePackage(dir, 'linux-x64') };
}

async function isAlive(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return !stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z');
  } catch (error) {
    // ENOENT can mean the process exited between checks, or /proc is unavailable.
    // A still-live PID without readable state must fail the readiness proof.
    if (error.code !== 'ENOENT') throw error;
    try { process.kill(pid, 0); }
    catch (again) { if (again.code === 'ESRCH') return false; throw again; }
    throw Error('process_state_unavailable');
  }
}

async function readiness(files, signal, cache) {
  // The only captured output is from this fixed fixture. Never capture worker output.
  const result = await runOwnedProcess(files.executable, ['run', '--no-config', '--no-lock',
    '--no-prompt', '--allow-run=' + files.executable, path.join(files.dir, 'readiness.ts'), 'tree'], {
    cwd: files.dir, env: { DENO_DIR: cache, DENO_NO_UPDATE_CHECK: '1', DENO_NO_PACKAGE_JSON: '1' },
    timeoutMs: 1500, signal, capture: true,
  });
  const report = JSON.parse(result.output);
  if (report.version !== '2.9.8' || !Array.isArray(report.pids) || report.pids.length !== 3 ||
    new Set(report.pids).size !== 3 || report.pids.some((pid) => !Number.isSafeInteger(pid) || pid < 2)) throw Error('invalid_probe');
  let dead = false;
  for (let i = 0; i < 40; i++) {
    dead = (await Promise.all(report.pids.map(isAlive))).every((alive) => !alive);
    if (dead) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!result.timedOut || result.aborted || !dead) throw Error('cleanup_unproved');
  return response(200, { ok: true, deno: '2.9.8', descendantCleanup: true });
}

export async function handlePush(request, mode = 'cycle') {
  const env = process.env;
  const status = configurationStatus(request, mode, env);
  if (status !== 200) return response(status, { ok: false });
  if (request.signal.aborted) return response(499, { ok: false });
  if (busy) return response(409, { ok: false });
  busy = true;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(CYCLE_TIMEOUT_MS)]);
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  // Keep scratch ownership inside this task. If filesystem work settles after
  // the HTTP deadline, its finally block still removes the owned directory.
  const work = async () => {
    let scratch;
    try {
      signal.throwIfAborted();
      const files = await runtimeFiles();
      signal.throwIfAborted();
      scratch = await mkdtemp(path.join(tmpdir(), 'unify-push-'));
      signal.throwIfAborted();
      const cache = path.join(scratch, 'cache');
      if (mode === 'readiness') return await readiness(files, signal, cache);
      await cp(path.join(files.runtime, 'cache'), cache, {
        recursive: true,
        filter: () => { signal.throwIfAborted(); return true; },
      });
      signal.throwIfAborted();
      // This is the full child environment. It excludes service-role/JWT secrets,
      // Node/Deno injection options, fixture overrides, and unrelated app secrets.
      const childEnv = { DENO_DIR: cache, DENO_NO_UPDATE_CHECK: '1', DENO_NO_PACKAGE_JSON: '1',
        COMPANION_PUSH_ENABLED: 'true', COMPANION_PUSH_DATABASE_URL: env.COMPANION_PUSH_DATABASE_URL };
      for (const key of ['EXPO_ACCESS_TOKEN', 'SANITY_PROJECT_ID', 'SANITY_DATASET']) {
        if (env[key]) childEnv[key] = env[key];
      }
      const result = await runOwnedProcess(files.executable, ['run', '--no-config', '--no-prompt',
        '--node-modules-dir=none', '--cached-only', '--frozen', '--lock=' + path.join(files.dir, 'deno.lock'),
        '--allow-env', '--allow-net', '--allow-read', '--allow-run=' + files.executable,
        path.join(files.dir, 'supervisor.ts')], {
        cwd: files.dir, env: childEnv, timeoutMs: CYCLE_TIMEOUT_MS, signal,
      });
      return response(result.ok ? 200 : result.timedOut ? 504 : 502, { ok: result.ok });
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => {});
    }
  };
  try {
    return await Promise.race([cancelled, work()]);
  } catch {
    // No exception, driver message, path, provider payload, or token enters HTTP.
    return response(request.signal.aborted ? 499 : signal.aborted ? 504 : 503, { ok: false });
  } finally {
    signal.removeEventListener('abort', abort);
    busy = false;
  }
}
