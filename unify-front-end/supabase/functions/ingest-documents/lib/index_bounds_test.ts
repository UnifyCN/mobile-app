// ingest-documents served handler (index.ts): the transport bounds it passes
// to the shared adapter and the source fetch. Runs the real Deno.serve handler
// with the real store over the real migrations in a local Postgres; only the
// network (pages, OpenRouter and the emulated Supabase HTTP hop) is stubbed.
//
// RUN: deno test --allow-read --allow-env unify-front-end/supabase/functions/ingest-documents/lib/index_bounds_test.ts
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  captureServe,
  type FetchCall,
  fetchLog,
  setRoutes,
  testEnv,
} from '../../_shared/testHarness.ts';
import { embeddingsResponse } from '../../_shared/testEmbeddingFixtures.ts';
import { openQwenIngestDb } from '../../../tests/support/ingestDb.ts';
import { type Db, rows } from '../../../tests/support/sharedDb.ts';
import { supabaseHttp } from '../../../tests/support/supabaseHttp.ts';
import { page, prose } from './testSupport.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };

const takeHandler = captureServe();
await import('../index.ts');
const handler = takeHandler();

const SERVICE_KEY = 'service-role-key';

async function setup(
  pageBody: (call: FetchCall) => Response,
  provider: (call: FetchCall) => Response
): Promise<{ db: Db; sourceId: number; requests: { table: string }[] }> {
  const db = await openQwenIngestDb();
  const [{ id, url }] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  const http = supabaseHttp(db);
  testEnv.OPENROUTER_API_KEY = 'openrouter-key';
  testEnv.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  testEnv.SUPABASE_URL = 'https://project.supabase.test';
  setRoutes(call => {
    if (call.url.host === 'project.supabase.test') {
      return http.fetch(call.url.toString(), {
        method: call.method,
        headers: call.headers,
        body: call.rawBody,
      });
    }
    if (call.url.href === url) return pageBody(call);
    if (call.url.href === 'https://openrouter.ai/api/v1/embeddings') {
      return provider(call);
    }
    return undefined;
  });
  return { db, sourceId: id, requests: http.requests };
}

async function ingest(sourceId: number) {
  const res = await handler(
    new Request('https://project.supabase.test/functions/v1/ingest-documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ crawl_source_id: sourceId }),
    })
  );
  return await res.json();
}

const embeddingCalls = () =>
  fetchLog.filter(c => c.url.pathname.endsWith('/embeddings'));

// Falsifier: the served handler keeps the adapter's default retries, so a 503
// is retried inside one reservation and two requests leave for one debit.
Deno.test(
  'a provider failure is sent once: ingestion runs the adapter with retries 0',
  opts,
  async () => {
    let answers = [503, 200];
    const f = await setup(
      () => new Response(page(prose(3_000, 'served')), { status: 200 }),
      call => {
        const status = answers.shift() ?? 200;
        return status === 200
          ? embeddingsResponse((call.body as { input: string[] }).input.length)
          : new Response('busy', { status });
      }
    );
    try {
      const body = await ingest(f.sourceId);
      assertEquals(embeddingCalls().length, 1);
      assertEquals(body.provider_sends, 1);
      const [result] = body.results;
      assertEquals(
        [result.status, result.stop_reason, result.error],
        ['pending', 'provider_error', 'Embedding request failed with HTTP 503']
      );
      answers = [200];
    } finally {
      await f.db.close();
    }
  }
);

// Falsifier: the page is read whole with response.text() before any size
// check, or a too-large page is cut and published.
Deno.test(
  'a page over 2 MiB is refused while it is read, before any job or request',
  opts,
  async () => {
    const piece = new TextEncoder().encode('<p>' + 'x'.repeat(65_533) + '</p>');
    const state = { pulled: 0, cancelled: false };
    const f = await setup(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              // An endless page: only a bounded read can stop it.
              state.pulled += piece.byteLength;
              controller.enqueue(piece);
            },
            cancel() {
              state.cancelled = true;
            },
          }),
          { status: 200 }
        ),
      () => new Response('no provider call expected', { status: 500 })
    );
    try {
      const body = await ingest(f.sourceId);
      assertEquals(body.results, [
        {
          source_id: f.sourceId,
          status: 'error',
          error: 'Source input exceeds the file size limit',
        },
      ]);
      assert(state.cancelled, 'the page body was not cancelled');
      assert(state.pulled <= 2 * 1024 * 1024 + 3 * piece.byteLength, `read ${state.pulled} bytes`);
      assertEquals(embeddingCalls(), []);
      assertEquals(await rows(f.db, `select 1 from public.knowledge_generation_jobs`), []);
      assertEquals(
        f.requests.filter(r => r.table === 'ingest_generation_open'),
        []
      );
    } finally {
      await f.db.close();
    }
  }
);
