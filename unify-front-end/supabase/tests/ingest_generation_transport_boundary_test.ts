// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Bodies that stall after their headers, at the public handler with a manual
// clock, the real store over the emulated HTTP hop and the real migrations.
// The provider path uses the real shared adapter and the source path the real
// page fetcher; only global fetch is stubbed, with real body streams. What
// this proves: the work deadline aborts the request signal and cancels the
// stalled body, the call answers, and nothing is staged for that batch. It
// does not prove Deno's network stack or hosted cancellation.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { embedTextsChecked } from '../functions/_shared/embeddings.ts';
import { fetchSourcePage } from '../functions/ingest-documents/lib/fetchPage.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import { page, prose } from '../functions/ingest-documents/lib/testSupport.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { crawlLogs, live } from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const KEY = 'test-service-role-key';

/** A 200 answer that sends `first` and then stalls until cancelled. */
function stalled(first: string) {
  let reached = () => {};
  const stalledNow = new Promise<void>(resolve => (reached = resolve));
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (pulls === 1) {
        controller.enqueue(new TextEncoder().encode(first));
        return;
      }
      reached();
      return new Promise<void>(() => {});
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(body, { status: 200 }),
    stalledNow,
    isCancelled: () => cancelled,
  };
}

/** Waits at most `ms` of real time; a call that never answers fails the test. */
async function answered<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('the call never answered')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function htmlSource(db: Db) {
  const [row] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  return row;
}

function request(sourceId: number) {
  return new Request('https://example.test/ingest-documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ crawl_source_id: sourceId }),
  });
}

/** Replaces global fetch for one test. */
async function withFetch(
  answer: (url: string, init?: RequestInit) => Response,
  run: (signals: AbortSignal[]) => Promise<void>
) {
  const real = globalThis.fetch;
  const signals: AbortSignal[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return Promise.resolve(answer(String(input instanceof Request ? input.url : input), init));
  };
  try {
    await run(signals);
  } finally {
    globalThis.fetch = real;
  }
}

// Falsifier: the adapter clears its only timer at the headers, so a provider
// body that stalls keeps the call open past the work deadline and the handler
// never answers.
Deno.test(
  'a provider body stalled after its headers is aborted at the work deadline',
  opts,
  async () => {
    const db = await openQwenIngestDb();
    try {
      const source = await htmlSource(db);
      const answer = stalled('{"object":"list","data":[');
      const clock = new ManualClock();
      const http = supabaseHttp(db);
      const deps: IngestDeps & { serviceRoleKey: string } = {
        store: createStore(http.client),
        now: () => new Date('2026-10-25T00:00:00.000Z'),
        timers: clock,
        fetchPage: () => Promise.resolve(page(prose(3_000, 'stall'))),
        embedChecked: (texts, options) => embedTextsChecked(texts, 'key', options),
        serviceRoleKey: KEY,
      };
      await withFetch(
        () => answer.response,
        async signals => {
          const pending = handleIngestRequest(request(source.id), deps);
          await answered(answer.stalledNow);
          assertEquals(signals.length, 1);
          assertEquals(signals[0].aborted, false);
          clock.advance(95_000);
          const body = await (await answered(pending)).json();

          assert(signals[0].aborted, 'the provider request signal did not abort');
          assert(answer.isCancelled(), 'the stalled body was not cancelled');
          assertEquals(body.provider_sends, 1);
          const [result] = body.results;
          assertEquals(
            [result.status, result.stop_reason, result.staged, result.reserved],
            ['pending', 'work_deadline', 0, 1]
          );
          assert(clock.now() < 110_000);
          assertEquals(
            http.requests.filter(r => r.table === 'ingest_generation_stage'),
            []
          );
          assertEquals((await live(db, source.url)).chunks, []);
        }
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the page fetch reads with response.text(), whose wait no timer
// bounds after the headers, so the call never answers.
Deno.test(
  'a page body stalled after its headers is aborted and opens no job',
  opts,
  async () => {
    const db = await openQwenIngestDb();
    try {
      const source = await htmlSource(db);
      const answer = stalled('<html><body><p>');
      const clock = new ManualClock();
      const deps: IngestDeps & { serviceRoleKey: string } = {
        store: createStore(supabaseHttp(db).client),
        now: () => new Date('2026-10-25T00:00:00.000Z'),
        timers: clock,
        fetchPage: fetchSourcePage,
        embedChecked: () => Promise.reject(new Error('no provider call expected')),
        serviceRoleKey: KEY,
      };
      await withFetch(
        () => answer.response,
        async signals => {
          const pending = handleIngestRequest(request(source.id), deps);
          await answered(answer.stalledNow);
          clock.advance(95_000);
          const body = await (await answered(pending)).json();

          assert(signals.some(s => s.aborted), 'the page request signal did not abort');
          assert(answer.isCancelled(), 'the stalled page body was not cancelled');
          assertEquals(body.results, [
            {
              source_id: source.id,
              status: 'error',
              error: 'The work deadline stopped the source before its job opened',
            },
          ]);
          assertEquals(body.provider_sends, 0);
          assertEquals(await rows(db, `select 1 from public.knowledge_generation_jobs`), []);
          assertEquals((await crawlLogs(db, source.id)).map(l => l.status), ['error']);
        }
      );
    } finally {
      await db.close();
    }
  }
);
