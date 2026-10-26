// A supabase-js client whose chosen RPC reaches the database and commits, but
// whose answer is held until the caller's signal aborts or `release` is
// called. Test support only. It stands in for a request that was sent and
// committed while the client stopped waiting: the outcome the caller sees is
// unknown, and the database has the commit. With `ignoreAbort` the held call
// also ignores the signal: a hung connection that only `release` ends.
import { createClient } from 'npm:@supabase/supabase-js@2.50.4';
import type { Db } from './sharedDb.ts';
import { supabaseHttp } from './supabaseHttp.ts';

export function lossyHttp(
  db: Db,
  holdRpc: (fn: string) => boolean,
  options: { times?: number; ignoreAbort?: boolean } = {}
) {
  const http = supabaseHttp(db);
  const committed: string[] = [];
  let release = () => {};
  const released = new Promise<void>(resolve => (release = resolve));
  let held = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const fn = /\/rest\/v1\/rpc\/([^/]+)$/.exec(url.pathname)?.[1];
    // The request is sent: the database runs it whatever the client does next.
    const answer = await http.fetch(input, { ...init, signal: undefined });
    if (fn === undefined || !holdRpc(fn) || held >= (options.times ?? Infinity)) {
      return answer;
    }
    held++;
    committed.push(fn);
    const signal = options.ignoreAbort ? undefined : init?.signal;
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new DOMException('The signal has been aborted', 'AbortError'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      released.then(resolve);
    });
    return answer;
  };
  const client = createClient('https://local-emulation.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  return { client, committed, release, requests: http.requests };
}
