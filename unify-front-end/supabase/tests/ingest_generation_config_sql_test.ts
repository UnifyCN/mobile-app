// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Each bound source configuration field changed after the fetch, before a
// reservation and before a stage, on the real migrations (PGlite). The
// promotion case is in ingest_generation_promote_sql_test.ts. Falsifier for
// every case: text fetched under one configuration receives work, vectors or
// a live write under another.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { QWEN, seedChunk } from './support/embeddingModels.ts';
import {
  chunkRows,
  claim,
  CONFIG_CHANGES,
  configOf,
  crawlLogs,
  live,
  open,
  reserve,
  sourceId,
  stage,
  stageRows,
} from './support/generationJobs.ts';
import { rows } from './support/sharedDb.ts';

for (const [field, change] of CONFIG_CHANGES) {
  Deno.test(`a changed ${field} before reserve closes the job`, async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'ircc_processing_times');
      const config = await configOf(db, id);
      await seedChunk(db, { url: config.url, text: 'Live text.', model: QWEN });
      const before = await live(db, config.url);
      const token = await claim(db, id);
      const opened = await open(db, { source: id, token, config, rows: chunkRows(3) });
      await db.query(`update public.crawl_sources set ${change} where id = $1`, [id]);
      const result = await reserve(db, { job: opened.job_id, token });

      assertEquals(
        [result.status, result.terminal_reason, result.rows, result.reserved],
        ['failed', 'configuration_changed', [], 0]
      );
      assertEquals(await live(db, config.url), before);
      assertEquals((await crawlLogs(db, id)).length, 1);
    } finally {
      await db.close();
    }
  });

  Deno.test(`a changed ${field} before stage stores no vector`, async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'ircc_processing_times');
      const config = await configOf(db, id);
      await seedChunk(db, { url: config.url, text: 'Live text.', model: QWEN });
      const before = await live(db, config.url);
      const token = await claim(db, id);
      const opened = await open(db, { source: id, token, config, rows: chunkRows(3) });
      const reserved = await reserve(db, { job: opened.job_id, token });
      await db.query(`update public.crawl_sources set ${change} where id = $1`, [id]);
      const result = await stage(db, {
        request: reserved.request_id,
        job: opened.job_id,
        token,
        rows: stageRows(reserved.rows),
      });

      assertEquals(
        [result.status, result.terminal_reason, result.staged_now],
        ['failed', 'configuration_changed', 0]
      );
      assertEquals(
        await rows(db, `select 1 from public.knowledge_generation_rows where embedding is not null`),
        []
      );
      assertEquals(await live(db, config.url), before);
    } finally {
      await db.close();
    }
  });
}
