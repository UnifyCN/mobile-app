// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The response backstop covers the request's setup: reading the body and
// choosing the sources. At the public handler with a manual clock, a real
// request body stream, the real store over the emulated HTTP hop and the real
// migrations. What this proves: an authenticated request whose body or
// selection stalls is answered at 110 s with its setup reported as
// incomplete, and a body or selection that finishes later starts no store,
// rebuild or provider call. It does not prove the edge runtime's own limits.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.4';
import {
  handleIngestRequest,
  type HandlerDeps,
} from '../functions/ingest-documents/lib/handler.ts';
import type { RebuildStore } from '../functions/ingest-documents/lib/rebuild.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const KEY = 'test-service-role-key';
const encode = (text: string) => new TextEncoder().encode(text);

/** A request body that sends `first` and then waits for the test. */
function stalledBody(first: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encode(first));
    },
  });
  return {
    body,
    finish(rest: string) {
      controller.enqueue(encode(rest));
      controller.close();
    },
  };
}

/** Records every database request and every call that is not one. */
function recorder(db: Db, hold?: (path: string) => Promise<void> | undefined) {
  const http = supabaseHttp(db);
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.split('/').at(-1)!;
    calls.push(path);
    await hold?.(path);
    return await http.fetch(input, init);
  };
  const client = createClient('https://local-emulation.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  const rebuild = new Proxy({} as RebuildStore, {
    get: (_target, name) => () => {
      calls.push(`rebuild.${String(name)}`);
      return Promise.resolve({});
    },
  });
  const deps = (clock: ManualClock): HandlerDeps => ({
    store: createStore(client),
    rebuild,
    now: () => new Date('2026-10-25T00:00:00.000Z'),
    timers: clock,
    serviceRoleKey: KEY,
    fetchPage: () => {
      calls.push('fetchPage');
      return Promise.reject(new Error('must not fetch'));
    },
    embedChecked: () => {
      calls.push('embed');
      return Promise.reject(new Error('must not embed'));
    },
  });
  return { calls, deps };
}

function request(body: BodyInit) {
  return new Request('https://example.test/ingest-documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}` },
    body,
  });
}

/** Runs the handler until the clock passes the backstop with the event loop free. */
async function atBackstop(pending: Promise<Response>, clock: ManualClock) {
  let answer: Response | undefined;
  pending.then(r => (answer = r));
  await new Promise(r => setTimeout(r, 5));
  clock.advance(110_000);
  await new Promise(r => setTimeout(r, 25));
  return answer;
}

const SETUP_INCOMPLETE = {
  version: 2,
  results: [],
  unstarted_source_ids: null,
  provider_sends: 0,
  setup_complete: false,
  stop_reason: 'response_backstop',
};

for (const late of [
  ['a crawl', '"crawl_source_id": 1}'],
  ['an embedding rebuild', '"action": "embedding_rebuild", "operation": "begin"}'],
]) {
  // Falsifier: a stalled authenticated body holds the handler past 110 s, or
  // the body that arrives later still starts work.
  Deno.test(`a stalled request body is answered at the backstop (${late[0]})`, opts, async () => {
    const db = await openQwenIngestDb();
    try {
      const clock = new ManualClock();
      const { calls, deps } = recorder(db);
      const stalled = stalledBody('{');
      const pending = handleIngestRequest(request(stalled.body), deps(clock));

      const answer = await atBackstop(pending, clock);
      assertEquals(answer?.status, 503, 'answered at the backstop');
      assertEquals(await answer!.json(), SETUP_INCOMPLETE);

      stalled.finish(late[1]);
      await new Promise(r => setTimeout(r, 50));
      assertEquals(calls, [], 'the late body starts nothing');
    } finally {
      await db.close();
    }
  });
}

// Falsifier: a stalled selection holds the handler past 110 s, or its late
// answer still claims and fetches a source.
Deno.test('a stalled selection is answered at the backstop', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const [{ id }] = await rows<{ id: number }>(
      db,
      `select id::int as id from public.crawl_sources where enabled order by id limit 1`
    );
    let release = () => {};
    const gate = new Promise<void>(resolve => (release = resolve));
    const clock = new ManualClock();
    const { calls, deps } = recorder(db, path =>
      path === 'ingest_generation_list_open' ? gate : undefined
    );
    const pending = handleIngestRequest(
      request(JSON.stringify({ crawl_source_id: id })),
      deps(clock)
    );

    const answer = await atBackstop(pending, clock);
    assertEquals(answer?.status, 503, 'answered at the backstop');
    assertEquals(await answer!.json(), SETUP_INCOMPLETE);

    const before = calls.length;
    release();
    await new Promise(r => setTimeout(r, 50));
    assertEquals(calls.slice(before), [], 'the late selection starts nothing');
  } finally {
    await db.close();
  }
});
