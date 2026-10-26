// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// ingest_generation_promote on the real migrations (PGlite). What this proves:
// promotion verifies the whole generation and replaces the live document in
// one transaction with the terminal log row; a promoted job's result reads
// back without a lease and never overwrites a later generation; a changed
// source, a newer live generation or a missing row leaves the live document
// byte-equal. Lock waits against freeze/rollback are native PostgreSQL checks.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { QWEN, seedChunk } from './support/embeddingModels.ts';
import {
  chunkRows,
  claim,
  CONFIG_CHANGES,
  configOf,
  crawlLogs,
  EMPTY_SHA256,
  fingerprintOf,
  live,
  open,
  promote,
  replaceOwner,
  reserve,
  sourceId,
  stage,
  stageAll,
  stageRows,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

async function seedLive(db: Db, url: string) {
  await seedChunk(db, {
    url,
    text: 'The previous good generation.',
    model: QWEN,
    updatedAt: '2026-10-01T00:00:00Z',
  });
}

// Falsifier: a partial promotion, chunks out of order, another document id,
// a missing terminal event or one written twice.
Deno.test(
  'promotion replaces the live document with the whole generation and logs once',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'html');
      const config = await configOf(db, id);
      await seedLive(db, config.url);
      const before = await live(db, config.url);
      const token = await claim(db, id);
      const input = chunkRows(45);
      const opened = await open(db, {
        source: id,
        token,
        config,
        rows: input,
        title: 'New title',
        contentHash: 'hash-2',
        documentMetadata: { source: 'crawler', chunk_count: 45 },
        fetchedAt: '2026-10-25T00:00:00.000Z',
      });
      await stageAll(db, opened.job_id, token);
      const result = await promote(db, { job: opened.job_id, token });

      assertEquals(result.status, 'promoted');
      assertEquals(result.historical, false);
      assertEquals(result.document_id, before.documents[0].id);
      assertEquals(result.fingerprint, await fingerprintOf(input.map(r => r.chunk_text)));
      const after = await live(db, config.url);
      assertEquals(after.documents.length, 1);
      assertEquals(after.documents[0].title, 'New title');
      assertEquals(after.documents[0].content_hash, 'hash-2');
      assertEquals(after.documents[0].metadata, { source: 'crawler', chunk_count: 45 });
      assertEquals(after.documents[0].embedding_model, QWEN);
      assertEquals(after.documents[0].updated_at, '2026-10-25 00:00:00');
      assertEquals(
        after.chunks.map(c => [c.chunk_index, c.chunk_text, c.embedding_model]),
        input.map(r => [r.chunk_index, r.chunk_text, QWEN])
      );
      assertEquals(after.chunks[7].metadata, input[7].metadata);
      assert(after.chunks.every(c => c.updated_at === '2026-10-25 00:00:00'));
      assertEquals(await crawlLogs(db, id), [
        { status: 'success', error_message: null, chunks_created: 45, content_changed: true },
      ]);
      assertEquals(
        await rows(db, `select 1 from public.knowledge_generation_rows where job_id = $1`, [
          opened.job_id,
        ]),
        []
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a promotion with a missing vector or row changes the live data.
Deno.test('an incomplete generation does not promote and changes nothing', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const config = await configOf(db, id);
    await seedLive(db, config.url);
    const before = await live(db, config.url);
    const token = await claim(db, id);
    const opened = await open(db, { source: id, token, config, rows: chunkRows(25) });
    const r = await reserve(db, { job: opened.job_id, token });
    await stage(db, { request: r.request_id, job: opened.job_id, token, rows: stageRows(r.rows) });
    await assertRejects(
      () => promote(db, { job: opened.job_id, token }),
      Error,
      'Staged chunks are incomplete'
    );
    assertEquals(await live(db, config.url), before);
    assertEquals(await crawlLogs(db, id), []);
  } finally {
    await db.close();
  }
});

// Falsifier: a repeat after a lost promotion response needs the expired
// lease, re-resolves the document through the current url, or replaces the
// later generation.
Deno.test(
  'a promoted job reads back its own result and never overwrites a later one',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'html');
      const config = await configOf(db, id);
      const token = await claim(db, id);
      const first = await open(db, { source: id, token, config, rows: chunkRows(3, 'a') });
      await stageAll(db, first.job_id, token);
      const promoted = await promote(db, { job: first.job_id, token });

      const next = await replaceOwner(db, id);
      const second = await open(db, {
        source: id,
        token: next,
        config,
        rows: chunkRows(2, 'b'),
        fetchedAt: '2026-10-26T00:00:00.000Z',
      });
      await stageAll(db, second.job_id, next);
      await promote(db, { job: second.job_id, token: next });
      const later = await live(db, config.url);

      await db.query(`delete from public.crawl_source_leases`);
      const replay = await promote(db, { job: first.job_id, token });
      assertEquals(replay.status, 'promoted');
      assertEquals(replay.historical, true);
      assertEquals(replay.document_id, promoted.document_id);
      assertEquals(replay.fingerprint, promoted.fingerprint);
      assertEquals(replay.promoted_at, promoted.promoted_at);
      assertEquals(await live(db, config.url), later);
      assertEquals((await crawlLogs(db, id)).length, 2, 'one event per promotion');
    } finally {
      await db.close();
    }
  }
);

// Falsifier: an empty newsroom window keeps expired chunks, has a null
// fingerprint, or needs a provider call.
Deno.test('an empty newsroom generation promotes with zero rows', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'ircc_newsroom');
    const config = await configOf(db, id);
    await seedLive(db, config.url);
    const token = await claim(db, id);
    const opened = await open(db, { source: id, token, config, rows: [] });
    const result = await promote(db, { job: opened.job_id, token });

    assertEquals(result.status, 'promoted');
    assertEquals(result.fingerprint, EMPTY_SHA256);
    assertEquals(result.reserved, 0);
    const after = await live(db, config.url);
    assertEquals(after.documents.length, 1);
    assertEquals(after.chunks, []);
  } finally {
    await db.close();
  }
});

// Falsifier: any bound configuration field changed after the fetch still lets
// the old text reach the live document.
Deno.test('every configuration change before promotion leaves live data unchanged', async () => {
  for (const [field, change] of CONFIG_CHANGES) {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'ircc_processing_times');
      const config = await configOf(db, id);
      await seedLive(db, config.url);
      const before = await live(db, config.url);
      const token = await claim(db, id);
      const opened = await open(db, { source: id, token, config, rows: chunkRows(3) });
      await stageAll(db, opened.job_id, token);
      await db.query(`update public.crawl_sources set ${change} where id = $1`, [id]);
      const result = await promote(db, { job: opened.job_id, token });

      assertEquals(result.status, 'failed', field);
      assertEquals(result.terminal_reason, 'configuration_changed', field);
      assertEquals(await live(db, config.url), before, field);
      assertEquals(
        (await crawlLogs(db, id)).map(l => l.error_message),
        ['Source configuration changed'],
        field
      );
    } finally {
      await db.close();
    }
  }
});

// Falsifier: an older snapshot promotes over a newer live generation.
Deno.test('a newer live generation supersedes an older job at promotion', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const config = await configOf(db, id);
    await seedChunk(db, {
      url: config.url,
      text: 'Newer live text.',
      model: QWEN,
      updatedAt: '2026-10-27T00:00:00Z',
    });
    const before = await live(db, config.url);
    const token = await claim(db, id);
    const opened = await open(db, {
      source: id,
      token,
      config,
      rows: chunkRows(2),
      fetchedAt: '2026-10-25T00:00:00.000Z',
    });
    await stageAll(db, opened.job_id, token);
    const result = await promote(db, { job: opened.job_id, token });
    assertEquals(result.status, 'superseded');
    assertEquals(result.terminal_reason, 'newer_generation');
    assertEquals(await live(db, config.url), before);
  } finally {
    await db.close();
  }
});

// Falsifier: a paused writer, a forged token or another serving model
// promotes; or a closed job promotes.
Deno.test('promotion needs every live-write guard and an open job', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const config = await configOf(db, id);
    await seedLive(db, config.url);
    const before = await live(db, config.url);
    const token = await claim(db, id);
    const opened = await open(db, { source: id, token, config, rows: chunkRows(2) });
    await stageAll(db, opened.job_id, token);
    await assertRejects(
      () => promote(db, { job: opened.job_id, token: crypto.randomUUID() }),
      Error,
      'Crawl source lease lost'
    );
    await db.query(`update public.knowledge_embedding_cutover set writers_paused = true`);
    await assertRejects(
      () => promote(db, { job: opened.job_id, token }),
      Error,
      'Knowledge writes are paused'
    );
    await db.query(
      `update public.knowledge_embedding_cutover
          set writers_paused = false, serving_model = 'openai/text-embedding-3-small'`
    );
    await assertRejects(
      () => promote(db, { job: opened.job_id, token }),
      Error,
      'Embedding model is not the serving model'
    );
    await db.query(
      `update public.knowledge_embedding_cutover set serving_model = 'qwen/qwen3-embedding-8b'`
    );
    // A changed input supersedes the job; it can no longer promote.
    await open(db, { source: id, token, config, rows: chunkRows(2, 'z') });
    const closed = await promote(db, { job: opened.job_id, token });
    assertEquals(closed.status, 'superseded');
    assertEquals(await live(db, config.url), before);
  } finally {
    await db.close();
  }
});
