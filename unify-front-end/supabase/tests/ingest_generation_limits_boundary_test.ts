// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Resource limits at ingestSource with the real converters, the real store
// over the emulated HTTP hop and the real migrations (PGlite). What this
// proves: an input over a limit stops the source with a fixed error before any
// job, provider request or live change, and nothing is truncated to fit. The
// 8 MiB serialized-rows limit cannot be reached through the current
// converters under the file limits; it is proven in SQL
// (ingest_generation_open_sql_test.ts) and checked again before the call.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { receipt } from '../functions/ingest-documents/lib/testSupport.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { QWEN, seedChunk } from './support/embeddingModels.ts';
import {
  chunkRows,
  claim,
  configOf,
  crawlLogs,
  live,
  open,
  privateState,
  reserve,
  stage,
  stageRows,
  unitVector,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const NOW = '2026-10-25T12:00:00.000Z';

function deps(db: Db, pages: (url: string) => string) {
  const fetched: string[] = [];
  const sent: string[][] = [];
  const http = supabaseHttp(db);
  const d: IngestDeps = {
    store: createStore(http.client),
    now: () => new Date(NOW),
    fetchPage: url => {
      fetched.push(url);
      return Promise.resolve(pages(url));
    },
    embedChecked: texts => {
      sent.push(texts);
      return Promise.resolve({
        vectors: texts.map(() => unitVector()),
        receipt: receipt(texts.length),
      });
    },
  };
  return { deps: d, fetched, sent, requests: http.requests };
}

async function sourceOf(db: Db, kind: string) {
  const [row] = await rows<{ id: number }>(
    db,
    `select id::int as id from public.crawl_sources where source_kind = $1 and enabled
      order by id limit 1`,
    [kind]
  );
  const source = await createStore(supabaseHttp(db).client).getCrawlSource(row.id);
  return source!;
}

/** Runs one source that must stop on `limit`, and checks nothing else happened. */
async function expectLimit(
  db: Db,
  kind: string,
  pages: (url: string) => string,
  limit: string
) {
  const source = await sourceOf(db, kind);
  await seedChunk(db, { url: source.url, text: 'The previous good generation.', model: QWEN });
  const before = await live(db, source.url);
  const run = deps(db, pages);
  const result = await ingestSource(source, run.deps);

  assertEquals(result, {
    source_id: source.id,
    status: 'error',
    error: `Source input exceeds the ${limit} limit`,
  });
  assertEquals(run.sent, [], 'a provider request was sent');
  assertEquals(await rows(db, `select 1 from public.knowledge_generation_jobs`), []);
  assertEquals(run.requests.filter(r => r.table === 'ingest_generation_open'), []);
  assertEquals(await live(db, source.url), before);
  assertEquals((await crawlLogs(db, source.id)).map(l => l.error_message), [
    `Source input exceeds the ${limit} limit`,
  ]);
  return run;
}

function newsroom(items: Array<Record<string, string>>): string {
  return JSON.stringify({ feed: { entry: items } });
}
const item = (i: number, overrides: Record<string, string> = {}) => ({
  link: `https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/item-${i}.html`,
  teaser: `Item ${i} summary.`,
  publishedDate: '2026-10-20T10:00:00-04:00',
  title: `Item ${i}`,
  ...overrides,
});

// Falsifier: a source with too many data addresses is fetched anyway.
Deno.test('more than 8 data addresses are refused before any fetch', async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await sourceOf(db, 'ircc_processing_times');
    const nine = Array.from({ length: 9 }, (_, i) => `https://www.canada.ca/data-${i}.json`);
    await db.query(`update public.crawl_sources set data_urls = $1 where id = $2`, [nine, source.id]);
    const run = await expectLimit(db, 'ircc_processing_times', () => '{}', 'data address count');
    assertEquals(run.fetched, []);
  } finally {
    await db.close();
  }
});

// Falsifier: five files under the per-file limit add up past 8 MiB unchecked.
Deno.test('the combined source size is capped at 8 MiB', async () => {
  const db = await openQwenIngestDb();
  try {
    const big = JSON.stringify({ pad: 'x'.repeat(1_900_000) });
    const run = await expectLimit(db, 'ircc_processing_times', () => big, 'source size');
    assertEquals(run.fetched.length, 5, 'the fifth file crosses 8 MiB');
  } finally {
    await db.close();
  }
});

// Falsifier: a generation over 5000 records is cut to its first 5000, or sent.
Deno.test('more than 5000 records fail and are never truncated', async () => {
  const db = await openQwenIngestDb();
  try {
    const items = Array.from({ length: 5001 }, (_, i) => item(i));
    await expectLimit(db, 'ircc_newsroom', () => newsroom(items), 'record count');
  } finally {
    await db.close();
  }
});

// Falsifier: one oversized record text is sent, or cut to fit.
Deno.test('a record text over 8 KiB fails before any request', async () => {
  const db = await openQwenIngestDb();
  try {
    const items = [item(1), item(2, { teaser: 'Long summary. '.repeat(700) })];
    await expectLimit(db, 'ircc_newsroom', () => newsroom(items), 'chunk text size');
  } finally {
    await db.close();
  }
});

// Falsifier: a record whose metadata (its own long address) passes 16 KiB is
// stored or sent.
Deno.test('record metadata over 16 KiB fails before any request', async () => {
  const db = await openQwenIngestDb();
  try {
    const link = `https://www.canada.ca/en/news/${'a'.repeat(17_000)}.html`;
    const items = [item(1), item(2, { link })];
    await expectLimit(db, 'ircc_newsroom', () => newsroom(items), 'metadata size');
  } finally {
    await db.close();
  }
});

/**
 * A newsroom item published once, then an open 25-row job of other content
 * with 20 checked rows and one reserved batch, under an ended lease.
 */
async function publishedWithCheckedJob(db: Db, published: Record<string, string>) {
  const source = await sourceOf(db, 'ircc_newsroom');
  const first = deps(db, () => newsroom([published]));
  assertEquals((await ingestSource(source, first.deps)).status, 'success');
  const token = await claim(db, source.id);
  const config = await configOf(db, source.id);
  const job = (await open(db, { source: source.id, token, config, rows: chunkRows(25) })).job_id;
  const checked = await reserve(db, { job, token });
  await stage(db, { request: checked.request_id, job, token, rows: stageRows(checked.rows) });
  await reserve(db, { job, token });
  await db.query(
    `update public.crawl_source_leases set expires_at = now() - interval '1 second'
      where crawl_source_id = $1`,
    [source.id]
  );
  return { source, job };
}

async function chunkMetadataBytes(db: Db, url: string) {
  return (
    await rows<{ bytes: number }>(
      db,
      `select octet_length(kc.metadata::text)::int as bytes
         from public.knowledge_chunks kc
         join public.knowledge_documents kd on kd.id = kc.document_id
        where kd.source_url = $1 order by kc.chunk_index`,
      [url]
    )
  ).map(r => r.bytes);
}

// Falsifier: an equal-text refetch whose item address grows past 16 KiB skips
// the limit on the unchanged path: it is reported skipped, its metadata is
// written to the live chunk, or the checked private job is superseded.
Deno.test('unchanged record metadata over 16 KiB fails and keeps live data and checked work', async () => {
  const db = await openQwenIngestDb();
  try {
    const { source, job } = await publishedWithCheckedJob(db, item(1));
    const liveBefore = await live(db, source.url);
    const privateBefore = await privateState(db, job);
    assertEquals(privateBefore.rows.filter(r => r.embedding !== null).length, 20);
    const link = `https://www.canada.ca/en/news/${'a'.repeat(17_000)}.html`;
    const run = deps(db, () => newsroom([item(1, { link })]));

    const result = await ingestSource(source, run.deps);

    assertEquals(result, {
      source_id: source.id,
      status: 'error',
      error: 'Source input exceeds the metadata size limit',
    });
    assertEquals(run.sent, [], 'a provider request was sent');
    assertEquals(
      run.requests.filter(r => r.table === 'ingest_generation_refresh'),
      [],
      'the caller sent the oversized metadata to the database'
    );
    assertEquals(await live(db, source.url), liveBefore, 'live data changed');
    assertEquals(await privateState(db, job), privateBefore, 'the private job changed');
    assertEquals((await crawlLogs(db, source.id)).map(l => l.error_message), [
      null,
      'Source input exceeds the metadata size limit',
    ]);
  } finally {
    await db.close();
  }
});

// Control: unchanged metadata under the limit still refreshes the live chunk
// in full and supersedes the obsolete private job, with no provider request.
Deno.test('unchanged record metadata under 16 KiB still refreshes and supersedes', async () => {
  const db = await openQwenIngestDb();
  try {
    const { source, job } = await publishedWithCheckedJob(db, item(1));
    const link = `https://www.canada.ca/en/news/${'a'.repeat(16_000)}.html`;
    const run = deps(db, () => newsroom([item(1, { link })]));

    assertEquals(await ingestSource(source, run.deps), { source_id: source.id, status: 'skipped' });

    assertEquals(run.sent, []);
    const [bytes] = await chunkMetadataBytes(db, source.url);
    assertEquals(bytes > 16_000 && bytes <= 16_384, true, `stored ${bytes} bytes`);
    assertEquals((await live(db, source.url)).chunks[0].metadata, {
      source: 'crawler',
      fetched_at: NOW,
      published_at: '2026-10-20',
      source_url: link,
    });
    assertEquals((await privateState(db, job)).job[0].status, 'superseded');
  } finally {
    await db.close();
  }
});

// Falsifier: a page fetcher that ignores the byte allowance hands over an
// oversized page, and it is chunked and sent.
Deno.test('a page over 2 MiB fails even when the fetcher ignores the allowance', async () => {
  const db = await openQwenIngestDb();
  try {
    const page = `<html><body><main><p>${'Applicants must apply. '.repeat(100_000)}</p></main></body></html>`;
    await expectLimit(db, 'html', () => page, 'file size');
  } finally {
    await db.close();
  }
});
