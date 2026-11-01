import { spawn } from 'node:child_process';

// Each invocation owns one POSIX process group. Always kill the group, including
// after a normal leader exit: an inherited descendant can still be running.
export function runOwnedProcess(executable, args, { cwd, env, timeoutMs, signal, capture = false, onReport }) {
  if (process.platform === 'win32') throw Error('posix_required');
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd, env, detached: true, shell: false,
      stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'],
    });
    let timedOut = false, aborted = false, failed = false, settled = false, output = '';
    const killGroup = () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') failed = true; }
    };
    const abort = () => { aborted = true; killGroup(); };
    const stop = () => { aborted = true; killGroup(); };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('exit', stop);
    child.stdout?.on('data', (chunk) => {
      if (output.length + chunk.length > 4096) { failed = true; killGroup(); return; }
      output += chunk.toString();
      onReport?.(output);
    });
    const finish = (code) => {
      if (settled) return;
      settled = true;
      killGroup();
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      process.removeListener('SIGTERM', stop);
      process.removeListener('SIGINT', stop);
      process.removeListener('exit', stop);
      resolve({ ok: code === 0 && !failed && !timedOut && !aborted, timedOut, aborted, output });
    };
    child.once('error', () => { failed = true; finish(null); });
    child.once('exit', finish);
    if (signal?.aborted) abort();
  });
}
