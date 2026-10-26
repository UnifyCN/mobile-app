// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Recovery after an aborted rebuild, through the served ingest-documents handler
// (handleIngestRequest) with the Qwen ingester deployed, the real store, the
// real supabase-js client over an emulated HTTP hop and the real migration SQL
// in a local Postgres. The page fetch and the embedding service are stubs that
// count their calls. Proves: while legacy serves, the Qwen ingester does no
// external work and leaves the source's attempt stamp alone. Does not prove a
// real provider call or concurrent transactions.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import {
  createRebuildStore,
  createStore,
} from '../functions/ingest-documents/lib/supabaseStore.ts';
import { page, prose } from '../functions/ingest-documents/lib/testSupport.ts';
import { openIngestDb } from './support/ingestDb.ts';
import { call, seedChunk, withReceipt } from './support/embeddingModels.ts';
import { QWEN, CONTRACT } from './support/embeddingModels.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const KEY = 'synthetic-test-key';

async function deployedQwenIngester(db: Db) {
  const client = supabaseHttp(db).client;
  const counts = { fetch: 0, embed: 0 };
  const embed = async (texts: string[]) => {
    counts.embed++;
    return texts.map(() => [1, ...new Array(1535).fill(0)]);
  };
  const deps = {
    store: createStore(client),
    rebuild: createRebuildStore(client),
    serviceRoleKey: KEY,
    now: () => new Date('2026-10-25T19:00:00Z'),
    fetchPage: async () => {
      counts.fetch++;
      return page(prose(6000));
    },
    embed,
    embedChecked: withReceipt(embed),
  };
  const request = (body: unknown) =>
    handleIngestRequest(
      new Request('https://local.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
      }),
      deps
    );
  const admin = async (
    operation: string,
    extra: Record<string, unknown> = {}
  ) => {
    const res = await request({
      action: 'embedding_rebuild',
      operation,
      ...extra,
    });
    return { status: res.status, body: await res.json() };
  };
  return { counts, request, admin };
}

const stampOf = (db: Db, id: number) =>
  rows(db, `select last_crawled_at from public.crawl_sources where id = $1`, [
    id,
  ]);

// Falsifier: after an abort, legacy still serves. The deployed Qwen ingester
// must neither fetch nor buy vectors the database would refuse, and must not
// stamp the source, whatever the writer flag says, so the source stays due.
Deno.test(
  'after abort the deployed Qwen ingester does no external work against legacy serving',
  async () => {
    const db = await openIngestDb();
    try {
      await seedChunk(db, {
        url: 'https://archive.test',
        text: 'saved legacy text',
      });
      const [{ id }] = await rows<{ id: number }>(
        db,
        `select id::int as id from public.crawl_sources where source_kind = 'html' and enabled order by id limit 1`
      );
      const ingester = await deployedQwenIngester(db);
      const run = await call<{ run_id: string }>(
        db,
        'public.knowledge_embedding_begin($1, $2)',
        [QWEN, CONTRACT]
      );
      assertEquals(
        (await ingester.admin('abort', { run_id: run.run_id })).status,
        200
      );

      const state = async () =>
        (await ingester.admin('status')).body.status as Record<string, unknown>;
      assertEquals(
        (await state()).writers_paused,
        true,
        'abort keeps writers paused until an explicit decision'
      );

      const quiet = async (label: string) => {
        for (const body of [{ crawl_source_id: id }, {}]) {
          const res = await ingester.request(body);
          assertEquals(res.status, 200, label);
          await res.body?.cancel();
        }
        assertEquals(ingester.counts, { fetch: 0, embed: 0 }, label);
        assertEquals(await stampOf(db, id), [{ last_crawled_at: null }], label);
        assertEquals(
          await rows(db, `select 1 from public.crawl_source_leases`),
          [],
          `${label}: no lease is left behind`
        );
      };
      await quiet('paused after abort');

      // Enabling writers is not a licence to run the Qwen ingester on legacy.
      assertEquals((await ingester.admin('enable_writers')).status, 200);
      assertEquals((await state()).phase, 'legacy');
      await quiet('writers enabled, legacy still serving');
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a guard that blocks the Qwen ingester for good would leave the
// source stuck. After a complete rebuild and cutover the same call works, and
// the source was never deferred by the refused attempts.
Deno.test('the source is retried and crawled once Qwen serves', async () => {
  const db = await openIngestDb();
  try {
    await seedChunk(db, {
      url: 'https://archive.test',
      text: 'saved legacy text',
    });
    const [{ id }] = await rows<{ id: number }>(
      db,
      `select id::int as id from public.crawl_sources where source_kind = 'html' and enabled order by id limit 1`
    );
    const ingester = await deployedQwenIngester(db);
    const first = await call<{ run_id: string }>(
      db,
      'public.knowledge_embedding_begin($1, $2)',
      [QWEN, CONTRACT]
    );
    await ingester.admin('abort', { run_id: first.run_id });
    await ingester.admin('enable_writers');
    await (await ingester.request({ crawl_source_id: id })).body?.cancel();
    assertEquals(ingester.counts, { fetch: 0, embed: 0 });

    const begun = await ingester.admin('begin');
    const runId = begun.body.run_id as string;
    assert(runId && runId !== first.run_id, 'a new run after an abort');
    const token = (await ingester.admin('acquire_worker', { run_id: runId }))
      .body.worker_token as string;
    for (let i = 0; i < 5; i++) {
      const batch = await ingester.admin('embed_batch', {
        run_id: runId,
        worker_token: token,
      });
      assertEquals(batch.status, 200);
      if (batch.body.sent === 0) break;
    }
    ingester.counts.embed = 0;
    assertEquals(
      (await ingester.admin('activate', { run_id: runId, worker_token: token }))
        .status,
      200
    );
    assertEquals(
      await stampOf(db, id),
      [{ last_crawled_at: null }],
      'the refused attempts never deferred the source'
    );
    assertEquals((await ingester.admin('enable_writers')).status, 200);

    const res = await ingester.request({ crawl_source_id: id });
    const body = await res.json();
    assertEquals(body.results[0].status, 'success', JSON.stringify(body));
    assertEquals(ingester.counts.fetch, 1);
    assert(ingester.counts.embed >= 1);
    const [{ models }] = await rows<{ models: string }>(
      db,
      `select string_agg(distinct embedding_model, ',') as models from public.knowledge_chunks`
    );
    assertEquals(models, QWEN);
  } finally {
    await db.close();
  }
});
