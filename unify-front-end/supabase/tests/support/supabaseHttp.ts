// The real supabase-js client over an emulated HTTP hop. Test support only.
//
// Every request is built by supabase-js 2.50.4 itself: the URL, the filters,
// the Prefer and Accept headers and the RPC body. A fetch handler reads that
// request back and runs it through the shim (postgrestShim.ts), which runs SQL
// in the local Postgres. This proves the store's calls survive the SDK's own
// encoding. It does not prove a real PostgREST server: its URL parser, its
// function overload choice, its request size limits, roles or row-level
// security.
import { createClient } from 'npm:@supabase/supabase-js@2.50.4';
import { postgrestShim } from './postgrestShim.ts';
import type { Db } from './sharedDb.ts';

function filterValue(raw: string): unknown {
  return raw === 'true' ? true : raw === 'false' ? false : raw;
}

export function supabaseHttp(db: Db) {
  const shim = postgrestShim(db);
  const handle = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const reply = (result: { data: unknown; error: unknown }) =>
      result.error
        ? new Response(JSON.stringify(result.error), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        : result.data === null &&
            method === 'POST' &&
            url.pathname.includes('/rpc/')
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(result.data), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });

    const rpcMatch = /\/rest\/v1\/rpc\/([^/]+)$/.exec(url.pathname);
    if (rpcMatch) {
      if (method !== 'POST')
        throw new Error(`Unsupported RPC method ${method}`);
      return reply(await shim.client.rpc(rpcMatch[1], body ?? {}));
    }

    const table = url.pathname.split('/').at(-1)!;
    // deno-lint-ignore no-explicit-any
    let query: any = shim.client.from(table);
    if (method === 'POST') query = query.insert(body);
    else if (method === 'PATCH') query = query.update(body);
    else if (method === 'DELETE') query = query.delete();
    else if (method !== 'GET') throw new Error(`Unsupported method ${method}`);
    if (method === 'GET' || url.searchParams.has('select')) {
      query = query.select(url.searchParams.get('select') ?? '*');
    }
    for (const [key, value] of url.searchParams) {
      if (key === 'select' || key === 'columns') continue;
      const dot = value.indexOf('.');
      const op = value.slice(0, dot);
      const raw = value.slice(dot + 1);
      if (op === 'eq') query = query.eq(key, filterValue(raw));
      else if (op === 'lt') query = query.lt(key, raw);
      else if (op === 'in') query = query.in(key, raw.slice(1, -1).split(','));
      else throw new Error(`Unsupported filter ${key}=${value}`);
    }
    const accept = new Headers(init?.headers).get('accept') ?? '';
    if (accept.includes('vnd.pgrst.object')) query = query.single();
    return reply(await query);
  };
  const client = createClient('https://local-emulation.test', 'test-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: handle },
  });
  return { client, requests: shim.requests };
}
