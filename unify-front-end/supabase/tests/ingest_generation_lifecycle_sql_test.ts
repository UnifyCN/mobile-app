// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The remaining generation-job functions on the real migrations (PGlite):
// begin_service (fair ordering), reject (a contract failure is terminal),
// supersede (live content equals a fresh fetch), retire (service-only private
// cleanup without a lease) and list_open (read-only scheduling view).
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { CONTRACT, LEGACY, QWEN, seedChunk } from './support/embeddingModels.ts';
import {
  call,
  chunkRows,
  claim,
  configOf,
  crawlLogs,
  live,
  open,
  replaceOwner,
  reserve,
  sourceId,
  stage,
  stageRows,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

async function openJob(db: Db, kind = 'html', count = 3) {
  const id = await sourceId(db, kind);
  const token = await claim(db, id);
  const config = await configOf(db, id);
  const opened = await open(db, { source: id, token, config, rows: chunkRows(count) });
  return { id, token, config, job: opened.job_id as string };
}

const listOpen = (db: Db) =>
  call<Array<Record<string, unknown>>>(db, `public.ingest_generation_list_open()`);
const retire = (db: Db, job: string) =>
  call(db, `public.ingest_generation_retire($1::uuid)`, [job]);
const beginService = (db: Db, job: string, token: string) =>
  call(
    db,
    `public.ingest_generation_begin_service($1::uuid, $2::uuid, $3, $4, 300)`,
    [job, token, QWEN, CONTRACT]
  );

async function privateCounts(db: Db, job: string) {
  const [r] = await rows<{ rows: number; reservations: number }>(
    db,
    `select (select count(*)::int from public.knowledge_generation_rows where job_id = $1) as rows,
            (select count(*)::int from public.knowledge_generation_reservations where job_id = $1) as reservations`,
    [job]
  );
  return r;
}

// Falsifier: a job that keeps failing keeps the first continuation place
// forever, because service start is not recorded.
Deno.test('begin_service advances the last-service time under the lease', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job } = await openJob(db);
    const [before] = await listOpen(db);
    const next = await replaceOwner(db, id);
    await assertRejects(() => beginService(db, job, token), Error, 'Crawl source lease lost');
    const served = await beginService(db, job, next);
    assertEquals(served.serviced, true);
    assert(String(served.last_service_at) > String(before.last_service_at));
    assertEquals(served.remaining, 3);
  } finally {
    await db.close();
  }
});

// Falsifier: a provider answer that breaks the contract leaves the job open,
// so the same input is re-sent until the cap, or the failure is not logged.
Deno.test('reject closes the job as a contract failure with one log row', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job } = await openJob(db);
    const r = await reserve(db, { job, token });
    const result = await call(
      db,
      `public.ingest_generation_reject($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 77)`,
      [job, token, r.request_id, QWEN, CONTRACT, 'Invalid embedding response: the model identity is not accepted']
    );
    assertEquals(result.status, 'failed');
    assertEquals(result.terminal_reason, 'contract_rejected');
    assertEquals(await privateCounts(db, job), { rows: 0, reservations: 0 });
    assertEquals(await crawlLogs(db, id), [
      {
        status: 'error',
        error_message: 'Invalid embedding response: the model identity is not accepted',
        chunks_created: 0,
        content_changed: false,
      },
    ]);
  } finally {
    await db.close();
  }
});

// Falsifier: after a fresh fetch equal to the live document, an older open
// job still promotes over it.
Deno.test('supersede closes the source open job without a log row', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job } = await openJob(db);
    const result = await call(
      db,
      `public.ingest_generation_supersede($1, $2::uuid, $3, $4, 300)`,
      [id, token, QWEN, CONTRACT]
    );
    assertEquals(result.superseded, true);
    assertEquals(result.status, 'superseded');
    assertEquals(await privateCounts(db, job), { rows: 0, reservations: 0 });
    assertEquals(await crawlLogs(db, id), []);
  } finally {
    await db.close();
  }
});

// Falsifier: retirement needs the lease that rollback deleted (so it can
// never run), writes live data, or retires a compatible paused job.
Deno.test(
  'retire closes a model-incompatible job after rollback and touches nothing live',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const { id, token, job, config } = await openJob(db);
      await seedChunk(db, { url: config.url, text: 'Live text.', model: QWEN });
      const r = await reserve(db, { job, token });
      await stage(db, { request: r.request_id, job, token, rows: stageRows(r.rows) });
      const liveBefore = await live(db, config.url);
      const [sourceBefore] = await rows(db, `select * from public.crawl_sources where id = $1`, [id]);

      // A pause alone leaves a compatible job inert.
      await db.query(`update public.knowledge_embedding_cutover set writers_paused = true`);
      const paused = await retire(db, job);
      assertEquals(paused.retired, false);
      assertEquals(paused.status, 'open');

      // Rollback serves the legacy model and drops every source lease.
      await db.query(
        `update public.knowledge_embedding_cutover
            set phase = 'rollback', serving_model = $1`,
        [LEGACY]
      );
      await db.query(`delete from public.crawl_source_leases`);
      const [controlBefore] = await rows(db, `select * from public.knowledge_embedding_cutover`);
      const retired = await retire(db, job);
      assertEquals(retired.retired, true);
      assertEquals(retired.status, 'failed');
      assertEquals(retired.terminal_reason, 'model_changed');
      assertEquals(await privateCounts(db, job), { rows: 0, reservations: 0 });
      assertEquals(await live(db, config.url), liveBefore);
      assertEquals(await rows(db, `select * from public.knowledge_embedding_cutover`), [controlBefore]);
      assertEquals(
        await rows(db, `select * from public.crawl_sources where id = $1`, [id]),
        [sourceBefore]
      );
      assertEquals(await crawlLogs(db, id), []);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a job whose source changed or was disabled stays selectable.
Deno.test('retire closes a job whose source configuration changed', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, job } = await openJob(db);
    assertEquals((await retire(db, job)).retired, false, 'compatible and unchanged');
    await db.query(`update public.crawl_sources set enabled = false where id = $1`, [id]);
    const retired = await retire(db, job);
    assertEquals(retired.retired, true);
    assertEquals(retired.terminal_reason, 'configuration_changed');
  } finally {
    await db.close();
  }
});

// Falsifier: the scheduler cannot order continuations or see which jobs are
// incompatible, changed or disabled.
Deno.test('list_open reports ordering fields and eligibility', async () => {
  const db = await openQwenIngestDb();
  try {
    const a = await openJob(db, 'html', 3);
    const b = await openJob(db, 'ircc_processing_times', 30);
    const r = await reserve(db, { job: b.job, token: b.token });
    await stage(db, { request: r.request_id, job: b.job, token: b.token, rows: stageRows(r.rows) });
    await db.query(`update public.crawl_sources set label = 'Changed' where id = $1`, [a.id]);

    const listed = await listOpen(db);
    assertEquals(listed.length, 2);
    const byJob = new Map(listed.map(j => [j.job_id, j]));
    const ja = byJob.get(a.job)!;
    const jb = byJob.get(b.job)!;
    assertEquals(
      [ja.crawl_source_id, ja.total, ja.staged, ja.compatible, ja.config_matches, ja.source_enabled],
      [a.id, 3, 0, true, false, true]
    );
    assertEquals(
      [jb.crawl_source_id, jb.total, jb.staged, jb.reserved, jb.cap, jb.config_matches],
      [b.id, 30, 20, 1, 9, true]
    );
    for (const field of ['created_at', 'last_service_at', 'fetched_at', 'crawl_frequency_hours']) {
      assert(jb[field] !== undefined && jb[field] !== null, field);
    }
    await db.query(`update public.knowledge_embedding_cutover set contract_version = 'next'`);
    assert((await listOpen(db)).every(j => j.compatible === false));
  } finally {
    await db.close();
  }
});
