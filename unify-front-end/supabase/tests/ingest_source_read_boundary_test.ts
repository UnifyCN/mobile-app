// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// A manual call names its source by id or by URL. The real store
// (createStore, the code index.ts deploys) and the public handler read that
// source through the real supabase-js client; only the HTTP hop is replaced,
// so no database runs. What this proves: a failed or aborted source read is
// an error that starts no other work, not a "not found" or allowlist refusal,
// while a read that finds nothing keeps its 400 or 403. It does not prove how
// hosted PostgREST words its errors.
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.4';
import { RPC_CEILING_MS } from '../functions/ingest-documents/lib/budget.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import type { CrawlSource } from '../functions/ingest-documents/lib/pickDueSources.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';

const FAILURE = { message: 'synthetic read failure', code: 'XX000' };
const URL_ = 'https://www.canada.ca/source';

/** The real client over a stub HTTP hop that records each request URL. */
function storeAnswering(
  answer: (url: URL, signal?: AbortSignal) => Response | Promise<Response>
) {
  const requests: URL[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    return await answer(url, init?.signal ?? undefined);
  };
  const client = createClient('https://local-emulation.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  return { store: createStore(client), requests };
}

const answer = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Falsifier: the store drops the read error and returns null, so the handler
// answers "not found" for a database failure.
Deno.test('a failed read by id is an error, not a missing source', async () => {
  const { store } = storeAnswering(answer(503, FAILURE));
  await assertRejects(
    () => store.getCrawlSource(3),
    Error,
    'Reading the crawl source failed: synthetic read failure'
  );
});

// Falsifier: the store drops the read error and returns null, so the handler
// answers "URL not in crawl_sources allowlist" for a database failure.
Deno.test('a failed read by URL is an error, not an unlisted URL', async () => {
  const { store } = storeAnswering(answer(503, FAILURE));
  await assertRejects(
    () => store.findEnabledCrawlSourceByUrl(URL_),
    Error,
    'Reading the crawl source failed: synthetic read failure'
  );
});

/** An answer that never arrives: like fetch, it ends only when aborted. */
const held = (_url: URL, signal?: AbortSignal) =>
  new Promise<Response>((_resolve, reject) => {
    const abort = () =>
      reject(new DOMException('The read was aborted', 'AbortError'));
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort);
  });

// Falsifier: an aborted read (the budget's 15 s database ceiling) returns
// null, or the store does not pass the call's signal to the request.
Deno.test('an aborted read by id or URL is an error, not a refusal', async () => {
  for (const read of [
    (s: ReturnType<typeof storeAnswering>['store'], signal: AbortSignal) =>
      s.getCrawlSource(3, { signal }),
    (s: ReturnType<typeof storeAnswering>['store'], signal: AbortSignal) =>
      s.findEnabledCrawlSourceByUrl(URL_, { signal }),
  ]) {
    const { store } = storeAnswering(held);
    const controller = new AbortController();
    const pending = read(store, controller.signal);
    controller.abort();
    await assertRejects(() => pending, Error, 'Reading the crawl source failed');
  }
});

// Falsifier: the fix turns a read that finds nothing into an error, or it
// changes the selected columns or the id, URL and enabled filters.
Deno.test('a read that finds nothing is still null, with the same filters', async () => {
  const { store, requests } = storeAnswering(answer(200, []));
  assertEquals(await store.getCrawlSource(3), null);
  assertEquals(await store.findEnabledCrawlSourceByUrl(URL_), null);
  const columns =
    'id,url,label,enabled,crawl_frequency_hours,last_crawled_at,province,source_kind,data_urls';
  assertEquals(
    requests.map(r => [r.pathname, [...r.searchParams.entries()]]),
    [
      ['/rest/v1/crawl_sources', [['select', columns], ['id', 'eq.3']]],
      ['/rest/v1/crawl_sources', [['select', columns], ['url', `eq.${URL_}`], ['enabled', 'eq.true']]],
    ]
  );
});

// Falsifier: a found row is no longer returned as the source.
Deno.test('a read that finds the source returns it', async () => {
  const row: CrawlSource = {
    id: 3, url: URL_, label: 'Source', enabled: true, crawl_frequency_hours: 24,
    last_crawled_at: null, province: null, source_kind: 'html', data_urls: null,
  };
  const { store } = storeAnswering(answer(200, [row]));
  assertEquals(await store.getCrawlSource(3), row);
  assertEquals(await store.findEnabledCrawlSourceByUrl(URL_), row);
});

const KEY = 'test-service-role-key';

/** The public handler over the real store; records every outbound call. */
function handlerAnswering(
  answer: (url: URL, signal?: AbortSignal) => Response | Promise<Response>
) {
  const calls: string[] = [];
  const { store } = storeAnswering((url, signal) => {
    calls.push(url.pathname);
    return answer(url, signal);
  });
  const clock = new ManualClock();
  const run = (body: Record<string, unknown>) =>
    handleIngestRequest(
      new Request('https://example.test/ingest-documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
      }),
      {
        store,
        now: () => new Date('2026-10-26T00:00:00.000Z'),
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
      }
    );
  return { calls, clock, run };
}

const SELECTORS = [
  { name: 'id', body: { crawl_source_id: 3 }, status: 400, error: 'crawl_source_id 3 not found' },
  { name: 'URL', body: { url: URL_ }, status: 403, error: 'URL not in crawl_sources allowlist' },
];

for (const selector of SELECTORS) {
  // Falsifier: the handler answers a database failure with its source or
  // allowlist refusal, or goes on to list jobs, claim, fetch or embed.
  Deno.test(`a failed read by ${selector.name} fails the call and starts no work`, async () => {
    const { calls, run } = handlerAnswering(answer(503, FAILURE));
    await assertRejects(
      () => run(selector.body),
      Error,
      'Reading the crawl source failed: synthetic read failure'
    );
    assertEquals(calls, ['/rest/v1/crawl_sources']);
  });

  // Falsifier: a read that the 15 s database ceiling aborts is answered as a
  // missing or unlisted source.
  Deno.test(`a read by ${selector.name} aborted at the database ceiling starts no work`, async () => {
    const { calls, clock, run } = handlerAnswering(held);
    const pending = run(selector.body);
    let settled = false;
    pending.then(() => (settled = true), () => (settled = true));
    await new Promise(r => setTimeout(r, 5));
    assertEquals(settled, false, 'the read waits for the ceiling');
    clock.advance(RPC_CEILING_MS);
    await assertRejects(() => pending, Error, 'Reading the crawl source failed');
    assertEquals(calls, ['/rest/v1/crawl_sources']);
  });

  // Falsifier: the fix also turns a genuine miss into an error.
  Deno.test(`a read by ${selector.name} that finds nothing keeps its ${selector.status}`, async () => {
    const { calls, run } = handlerAnswering(answer(200, []));
    const res = await run(selector.body);
    assertEquals(res.status, selector.status);
    assertEquals(await res.json(), { error: selector.error });
    assertEquals(calls, ['/rest/v1/crawl_sources']);
  });
}
