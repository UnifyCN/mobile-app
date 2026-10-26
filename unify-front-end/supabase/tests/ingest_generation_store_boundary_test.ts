// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The generation-job calls of the real store (createStore) through the real
// supabase-js client over the emulated HTTP hop, on the real migrations. What
// this proves: the store sends each RPC with the arguments the SQL expects and
// reads its answer; a refused call is a known failure; a call whose answer is
// lost after the database committed is reported as an unknown outcome, and the
// status read then finds the commit. It does not prove hosted PostgREST.
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EMBEDDING_CONTRACT,
  EMBEDDING_MODEL,
} from '../functions/_shared/embeddings.ts';
import {
  createStore,
  sourceConfig,
  StoreCallError,
} from '../functions/ingest-documents/lib/supabaseStore.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { chunkRows, claim, live, sourceId, unitVector } from './support/generationJobs.ts';
import { lossyHttp } from './support/lossyHttp.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const RECEIPT = {
  model: EMBEDDING_MODEL,
  contract: EMBEDDING_CONTRACT,
  identity: 'canonical' as const,
  checked: 0,
  native_dimensions: 4096,
  stored_dimensions: 1536,
};

async function sourceRow(db: Db, id: number) {
  const store = createStore(supabaseHttp(db).client);
  const source = await store.getCrawlSource(id);
  assert(source);
  return source;
}

function openInput(source: Awaited<ReturnType<typeof sourceRow>>, token: string, count: number) {
  return {
    operationId: crypto.randomUUID(),
    sourceId: source.id,
    token,
    sourceConfig: sourceConfig(source),
    embeddingModel: EMBEDDING_MODEL,
    contract: EMBEDDING_CONTRACT,
    contentHash: 'hash-1',
    title: 'Title',
    documentMetadata: { source: 'crawler' },
    fetchedAt: '2026-10-25T00:00:00.000Z',
    rows: chunkRows(count),
  };
}

// Falsifier: the store names an argument the SQL does not have, or misreads
// an answer, so a generation cannot be opened, reserved, staged and promoted.
Deno.test('the store runs a whole generation through the real client', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const source = await sourceRow(db, id);
    const store = createStore(supabaseHttp(db).client);
    const token = await claim(db, id);
    const opened = await store.openGeneration(openInput(source, token, 25));
    assertEquals([opened.status, opened.total, opened.remaining, opened.cap], ['open', 25, 25, 9]);

    for (;;) {
      const batch = await store.reserveBatch({
        requestId: crypto.randomUUID(),
        jobId: opened.job_id,
        token,
        embeddingModel: EMBEDDING_MODEL,
        contract: EMBEDDING_CONTRACT,
      });
      if (batch.rows.length === 0) break;
      const staged = await store.stageBatch({
        requestId: batch.request_id!,
        jobId: opened.job_id,
        token,
        embeddingModel: EMBEDDING_MODEL,
        contract: EMBEDDING_CONTRACT,
        receipt: { ...RECEIPT, checked: batch.rows.length },
        rows: batch.rows.map(r => ({
          chunk_index: r.chunk_index,
          text_sha256: r.text_sha256,
          embedding: unitVector(),
        })),
      });
      assertEquals(staged.staged_now, batch.rows.length);
    }
    const promoted = await store.promoteJob({
      jobId: opened.job_id,
      token,
      embeddingModel: EMBEDDING_MODEL,
      contract: EMBEDDING_CONTRACT,
      durationMs: 5,
    });
    assertEquals(promoted.status, 'promoted');
    assertEquals((await live(db, source.url)).chunks.length, 25);
    assertEquals(await store.listOpenJobs(), []);
    const status = await store.generationStatus({ jobId: opened.job_id });
    assertEquals(status.status, 'promoted');
  } finally {
    await db.close();
  }
});

// Falsifier: a database refusal is treated as an unknown outcome (and
// reconciled forever), or loses its reason.
Deno.test('a refused call is a known failure with its reason', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const source = await sourceRow(db, id);
    const store = createStore(supabaseHttp(db).client);
    const token = await claim(db, id);
    const opened = await store.openGeneration(openInput(source, token, 2));
    const error = await assertRejects(() =>
      store.reserveBatch({
        requestId: crypto.randomUUID(),
        jobId: opened.job_id,
        token: crypto.randomUUID(),
        embeddingModel: EMBEDDING_MODEL,
        contract: EMBEDDING_CONTRACT,
      })
    );
    assertInstanceOf(error, StoreCallError);
    assertEquals(error.unknown, false);
    assert(error.message.includes('Crawl source lease lost'), error.message);
  } finally {
    await db.close();
  }
});

// Falsifier: an aborted wait after the database committed is reported as a
// failure that changed nothing, so the caller opens a second job.
Deno.test(
  'a lost answer after commit is an unknown outcome and the status read finds the commit',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'html');
      const source = await sourceRow(db, id);
      const lossy = lossyHttp(db, fn => fn === 'ingest_generation_open');
      const store = createStore(lossy.client);
      const token = await claim(db, id);
      const input = openInput(source, token, 3);
      const controller = new AbortController();
      const pending = store.openGeneration(input, { signal: controller.signal });
      while (lossy.committed.length === 0) await new Promise(r => setTimeout(r, 1));
      controller.abort();
      const error = await assertRejects(() => pending);
      assertInstanceOf(error, StoreCallError);
      assertEquals(error.unknown, true);

      const status = await createStore(supabaseHttp(db).client).generationStatus({
        operationId: input.operationId,
      });
      assertEquals(status.found, true);
      assertEquals(status.status, 'open');
      assertEquals(status.total, 3);
      assertEquals(
        (await rows(db, `select count(*)::int as n from public.knowledge_generation_jobs`))[0],
        { n: 1 }
      );
    } finally {
      await db.close();
    }
  }
);
