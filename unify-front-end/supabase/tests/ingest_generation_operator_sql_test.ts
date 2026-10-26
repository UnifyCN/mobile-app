// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The read-only operator status file for version 2 pending work
// (backfills/20261026012600_ingest_generation_status.sql), on the real
// migrations (PGlite) with an open, a promoted and a failed job present.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import {
  chunkRows,
  claim,
  configOf,
  open,
  promote,
  replaceOwner,
  reserve,
  sourceId,
  stage,
  stageAll,
  stageRows,
} from './support/generationJobs.ts';
import { rows } from './support/sharedDb.ts';

const FILE = new URL(
  '../backfills/20261026012600_ingest_generation_status.sql',
  import.meta.url
);

/** The file's statements, comments removed. */
function statements(): string[] {
  return Deno.readTextFileSync(FILE)
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s !== '');
}

// Falsifier: a status block that writes, or that no longer matches the
// functions and tables it reads.
Deno.test('every operator status block runs and only reads', async () => {
  const db = await openQwenIngestDb();
  try {
    const html = await sourceId(db, 'html');
    const htmlToken = await claim(db, html);
    const done = await open(db, { source: html, token: htmlToken, config: await configOf(db, html), rows: chunkRows(2) });
    await stageAll(db, done.job_id, htmlToken);
    await promote(db, { job: done.job_id, token: htmlToken });

    const processing = await sourceId(db, 'ircc_processing_times');
    const token = await claim(db, processing);
    const pending = await open(db, { source: processing, token, config: await configOf(db, processing), rows: chunkRows(45) });
    const r = await reserve(db, { job: pending.job_id, token });
    await stage(db, { request: r.request_id, job: pending.job_id, token, rows: stageRows(r.rows) });
    await reserve(db, { job: pending.job_id, token: await replaceOwner(db, processing) });

    const all = statements();
    assertEquals(all.length, 5);
    for (const statement of all) {
      assert(/^select\b/i.test(statement), statement.slice(0, 60));
      assert(
        !/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i.test(statement),
        statement.slice(0, 60)
      );
    }
    const before = await rows(db, `select * from public.knowledge_generation_jobs order by id`);
    await db.query('begin read only');
    const listed = await rows<Record<string, unknown>>(db, all[0]);
    const status = await rows<Record<string, unknown>>(db, all[1]);
    const reservations = await rows<Record<string, unknown>>(db, all[2]);
    const perSource = await rows<Record<string, unknown>>(db, all[3]);
    const terminal = await rows<Record<string, unknown>>(db, all[4]);
    await db.query('commit');

    assertEquals(listed.length, 1);
    assertEquals([listed[0].crawl_source_id, listed[0].total, listed[0].staged], [processing, 45, 20]);
    assertEquals(status.length, 1);
    assertEquals(reservations.map(x => x.outcome), ['staged', 'reserved']);
    const row = perSource.find(x => x.id === processing)!;
    assertEquals([row.open_total, row.open_staged, row.open_reserved], [45, 20, 2]);
    assertEquals(terminal.map(x => x.status), ['promoted']);
    assertEquals(await rows(db, `select * from public.knowledge_generation_jobs order by id`), before);
  } finally {
    await db.close();
  }
});
