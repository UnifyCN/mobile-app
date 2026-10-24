// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The real ingest store (createStore, the code index.ts deploys) against the
// real schema from the migration files, in a local Postgres. Only the HTTP hop
// of supabase-js is replaced (see support/postgrestShim.ts). The fake-store
// tests next to the ingestion code cannot show a database filter, a per-record
// update or a stale chunk delete working. These tests can.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import type { CrawlSource } from '../functions/ingest-documents/lib/pickDueSources.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import { postgrestShim } from './support/postgrestShim.ts';
import {
  applyMigration,
  openBaselineDb,
  rows,
  type Db,
} from './support/sharedDb.ts';

const FIXTURES = new URL(
  '../functions/ingest-documents/lib/fixtures/ircc/',
  import.meta.url
);
const fixture = (name: string) =>
  Deno.readTextFileSync(new URL(name, FIXTURES));
const JSON_BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const EE_URL = JSON_BASE + 'ee_rounds_123_en.json';
const EE_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';
const PROCESSING_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';

async function openDb(
  options: { recordSources: boolean } = { recordSources: true }
): Promise<Db> {
  const db = await openBaselineDb();
  // crawl_logs is created by the ingestion migration, outside the baseline slice.
  const ingestion = await Deno.readTextFile(
    new URL(
      '../migrations/20260320_rag_ingestion_pipeline.sql',
      import.meta.url
    )
  );
  await db.exec(
    ingestion.match(
      /create table if not exists public\.crawl_logs \([\s\S]*?\);/
    )![0]
  );
  await applyMigration(db, 'crawl_sources_province');
  if (options.recordSources) {
    await applyMigration(db, 'crawl_sources_record_sources');
    await applyMigration(db, 'seed_province_crawl_sources');
    await applyMigration(db, 'seed_ircc_record_sources');
  }
  return db;
}

const VECTOR = new Array(1536).fill(0.01);

function depsFor(
  db: Db,
  pages: Record<string, string | Error>,
  clock: { now: Date },
  options: { failEmbedOnCall?: number } = {}
) {
  const shim = postgrestShim(db);
  let embedCalls = 0;
  const deps: IngestDeps = {
    store: createStore(shim.client),
    now: () => clock.now,
    fetchPage: async url => {
      const page = pages[url];
      if (page === undefined) throw new Error(`HTTP 404: ${url}`);
      if (page instanceof Error) throw page;
      return await Promise.resolve(page);
    },
    embed: async texts => {
      embedCalls += 1;
      if (options.failEmbedOnCall === embedCalls) {
        throw new Error('embedding service unavailable');
      }
      return await Promise.resolve(texts.map(() => VECTOR));
    },
  };
  return { deps, requests: shim.requests, store: deps.store };
}

async function source(db: Db, url: string): Promise<CrawlSource> {
  const found = await createStore(
    postgrestShim(db).client
  ).findEnabledCrawlSourceByUrl(url);
  assert(found, `no source for ${url}`);
  return found;
}

const chunkRows = (db: Db) =>
  rows<{
    id: number;
    chunk_index: number;
    chunk_text: string;
    published_at: string;
    fetched_at: string;
    dims: number;
    updated_at: string;
  }>(
    db,
    `select id::int as id, chunk_index, chunk_text,
            metadata->>'published_at' as published_at, metadata->>'fetched_at' as fetched_at,
            vector_dims(embedding) as dims, to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
       from public.knowledge_chunks order by chunk_index`
  );

// Falsifier: if the store selected columns the schema lacks, or the columns
// migration were skipped, listing the sources fails. This is the release-order
// requirement: apply the columns before deploying the function.
Deno.test(
  'the store lists sources only once the record source columns exist',
  async () => {
    const before = await openDb({ recordSources: false });
    const store = createStore(postgrestShim(before).client);
    await assertRejects(
      () => store.listCrawlSources(),
      Error,
      'column crawl_sources.source_kind does not exist'
    );
    await before.close();

    const db = await openDb();
    const sources = await createStore(
      postgrestShim(db).client
    ).listCrawlSources();
    assertEquals(sources.length, 29);
    const byKind = Object.fromEntries(
      Object.entries(Object.groupBy(sources, s => s.source_kind)).map(
        ([k, v]) => [k, v!.length]
      )
    );
    assertEquals(byKind, {
      html: 26,
      ircc_express_entry_rounds: 1,
      ircc_processing_times: 1,
      ircc_newsroom: 1,
    });
    assertEquals(
      sources
        .filter(s => s.province !== null)
        .map(s => s.province)
        .sort(),
      ['Alberta', 'British Columbia', 'Ontario']
    );
    const processing = sources.find(s => s.url === PROCESSING_PAGE)!;
    assertEquals(processing.data_urls?.length, 5);
    assertEquals(processing.crawl_frequency_hours, 24);
    await db.close();
  }
);

// Falsifier: without the enabled filter the disabled source is returned.
Deno.test(
  'source lookups apply the enabled filter and the id and url filters',
  async () => {
    const db = await openDb();
    await db.query(
      `update public.crawl_sources set enabled = false where url = $1`,
      [PROCESSING_PAGE]
    );
    const store = createStore(postgrestShim(db).client);

    assertEquals((await store.listCrawlSources()).length, 28);
    assertEquals(
      await store.findEnabledCrawlSourceByUrl(PROCESSING_PAGE),
      null
    );
    const ee = await store.findEnabledCrawlSourceByUrl(EE_PAGE);
    assertEquals(ee?.source_kind, 'ircc_express_entry_rounds');
    assertEquals((await store.getCrawlSource(String(ee!.id)))?.url, EE_PAGE);
    assertEquals((await store.getCrawlSource(ee!.id))?.url, EE_PAGE);
    assertEquals(await store.getCrawlSource(99999), null);
    await db.close();
  }
);

Deno.test(
  'a draw source is written, refreshed in place and trimmed in the database',
  async () => {
    const db = await openDb();
    const ee = await source(db, EE_PAGE);
    const first = JSON.parse(fixture('ee_rounds_sample.json'));
    const pages: Record<string, string> = { [EE_URL]: JSON.stringify(first) };
    const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
    const { deps } = depsFor(db, pages, clock);

    // Crawl 1: new document, ten chunks.
    assertEquals((await ingestSource(ee, deps)).status, 'success');
    const docs = await rows(
      db,
      `select id::int as id, title, source_url, content_hash is not null as hashed, metadata from public.knowledge_documents`
    );
    assertEquals(docs.length, 1);
    assertEquals(docs[0].title, 'Express Entry – Rounds of Invitations');
    assertEquals(docs[0].source_url, EE_PAGE);
    assertEquals(docs[0].hashed, true);
    const crawl1 = await chunkRows(db);
    assertEquals(crawl1.length, 10);
    assert(crawl1.every(c => c.dims === 1536));
    assertEquals(
      crawl1.map(c => c.published_at),
      [
        '2026-10-16',
        '2026-10-15',
        '2026-10-13',
        '2026-10-01',
        '2026-09-29',
        '2026-09-28',
        '2026-09-16',
        '2026-09-15',
        '2026-09-14',
        '2026-09-04',
      ]
    );
    assert(crawl1.every(c => c.fetched_at === '2026-10-23T12:00:00.000Z'));
    const stamped = await rows(
      db,
      `select to_char(last_crawled_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at from public.crawl_sources where url = $1`,
      [EE_PAGE]
    );
    assertEquals(stamped, [{ at: '2026-10-23T12:00:00Z' }]);

    // Crawl 2: nothing changed. The same rows are updated, not re-inserted.
    clock.now = new Date('2026-10-24T12:00:00.000Z');
    assertEquals((await ingestSource(ee, deps)).status, 'skipped');
    const crawl2 = await chunkRows(db);
    assertEquals(
      crawl2.map(c => c.id),
      crawl1.map(c => c.id)
    );
    assertEquals(
      crawl2.map(c => c.published_at),
      crawl1.map(c => c.published_at)
    );
    assert(crawl2.every(c => c.fetched_at === '2026-10-24T12:00:00.000Z'));
    assertEquals(
      crawl2.map(c => c.updated_at),
      crawl1.map(c => c.updated_at)
    );
    const docAfter = await rows(
      db,
      `select metadata->>'fetched_at' as f, metadata->>'published_at' as p, metadata->>'source' as s from public.knowledge_documents`
    );
    assertEquals(docAfter, [
      { f: '2026-10-24T12:00:00.000Z', p: '2026-10-16', s: 'crawler' },
    ]);

    // Crawl 3: a new draw. The oldest draw leaves the top ten and its chunk is gone.
    clock.now = new Date('2026-10-25T12:00:00.000Z');
    pages[EE_URL] = JSON.stringify({
      rounds: [
        {
          ...first.rounds[0],
          drawNumber: '451',
          drawDate: '2026-10-22',
          drawName: 'Canadian Experience Class',
          drawSize: '3,000',
          drawCRS: '501',
        },
        ...first.rounds,
      ],
    });
    assertEquals((await ingestSource(ee, deps)).status, 'success');
    const crawl3 = await chunkRows(db);
    assertEquals(crawl3.length, 10);
    assertEquals(
      crawl3[0].chunk_text,
      'Express Entry draw #451 on October 22, 2026: Canadian Experience Class, 3,000 invitations, minimum CRS 501.'
    );
    assert(!crawl3.some(c => c.chunk_text.includes('draw #441 ')));
    assert(
      crawl3.every(c => !crawl1.some(o => o.id === c.id)),
      'every chunk was rewritten'
    );
    assertEquals(
      await rows(
        db,
        `select count(*)::int as n from public.knowledge_documents`
      ),
      [{ n: 1 }]
    );
    assertEquals(
      await rows(
        db,
        `select status, content_changed from public.crawl_logs order by id`
      ),
      [
        { status: 'success', content_changed: true },
        { status: 'skipped', content_changed: false },
        { status: 'success', content_changed: true },
      ]
    );
    await db.close();
  }
);

Deno.test(
  'an unchanged crawl with a moved source date updates the right rows in few requests',
  async () => {
    const db = await openDb();
    const processing = await source(db, PROCESSING_PAGE);
    const pages: Record<string, string> = {
      [JSON_BASE + 'data-ptime-en.json']: fixture('ptime_country.json'),
      [JSON_BASE + 'data-ptime-non-country-en.json']: fixture(
        'ptime_non_country.json'
      ),
      [JSON_BASE + 'data-country-name-en.json']: fixture('country_names.json'),
      [JSON_BASE + 'flpt-en.json']: fixture('flpt_current.json'),
      [JSON_BASE + 'flpt-by-week-en.json']: fixture('flpt_by_week.json'),
    };
    const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
    const run = depsFor(db, pages, clock);
    assertEquals(
      (await ingestSource(processing, run.deps)).chunks_created,
      465
    );
    assertEquals((await chunkRows(db)).length, 465);

    const country = JSON.parse(pages[JSON_BASE + 'data-ptime-en.json']);
    country.work.lastupdated = 'October 28, 2026';
    pages[JSON_BASE + 'data-ptime-en.json'] = JSON.stringify(country);
    clock.now = new Date('2026-10-24T12:00:00.000Z');
    run.requests.length = 0;
    const idsBefore = (await chunkRows(db)).map(c => c.id);

    assertEquals((await ingestSource(processing, run.deps)).status, 'skipped');

    const chunks = await chunkRows(db);
    assertEquals(
      chunks.map(c => c.id),
      idsBefore
    );
    const byDate = await rows(
      db,
      `select metadata->>'published_at' as d, count(*)::int as n,
            bool_and(metadata->>'fetched_at' = '2026-10-24T12:00:00.000Z') as fresh
       from public.knowledge_chunks group by 1 order by 1`
    );
    assertEquals(byDate, [
      { d: '2026-10-09', n: 24, fresh: true },
      { d: '2026-10-17', n: 2, fresh: true },
      { d: '2026-10-21', n: 378, fresh: true },
      { d: '2026-10-28', n: 61, fresh: true },
    ]);
    const workDates = await rows(
      db,
      `select distinct metadata->>'published_at' as d from public.knowledge_chunks where chunk_text like '%Work permit (from outside Canada)%'`
    );
    assertEquals(workDates, [{ d: '2026-10-28' }]);
    const chunkUpdates = run.requests.filter(
      r => r.table === 'knowledge_chunks' && r.action === 'update'
    );
    // 378 + 61 + 24 + 2 records in groups of at most 100: 4 + 1 + 1 + 1 requests.
    assertEquals(chunkUpdates.length, 7);
    assert(chunkUpdates.every(r => r.largestInList <= 100));
    assertEquals(
      chunkUpdates.reduce((n, r) => n + r.rowCount, 0),
      465
    );
    assert(
      chunkUpdates.every(
        r => r.filters.join() === 'eq:document_id,in:chunk_index'
      )
    );
    await db.close();
  }
);

// Falsifier: if the failed attempt's cleanup were unfiltered or used the wrong
// time, the earlier chunks would be deleted with it.
Deno.test(
  'a failed changed crawl leaves the previous chunks and document untouched',
  async () => {
    const db = await openDb();
    const ee = await source(db, EE_PAGE);
    const first = JSON.parse(fixture('ee_rounds_sample.json'));
    const pages: Record<string, string> = { [EE_URL]: JSON.stringify(first) };
    const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
    assertEquals(
      (await ingestSource(ee, depsFor(db, pages, clock).deps)).status,
      'success'
    );
    const before = await chunkRows(db);
    const hashBefore = await rows(
      db,
      `select content_hash from public.knowledge_documents`
    );
    pages[EE_URL] = JSON.stringify({
      rounds: [
        { ...first.rounds[0], drawNumber: '451', drawDate: '2026-10-22' },
        ...first.rounds,
      ],
    });
    clock.now = new Date('2026-10-24T12:00:00.000Z');
    // The ten records are one batch; fail it. Then make the next attempt fail after a write.
    const failing = depsFor(db, pages, clock, { failEmbedOnCall: 1 });

    const result = await ingestSource(ee, failing.deps);

    assertEquals(result.status, 'error');
    assertEquals(await chunkRows(db), before);
    assertEquals(
      await rows(db, `select content_hash from public.knowledge_documents`),
      hashBefore
    );
    assertEquals(
      await rows(
        db,
        `select to_char(last_crawled_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at from public.crawl_sources where url = $1`,
        [EE_PAGE]
      ),
      [{ at: '2026-10-24T12:00:00Z' }]
    );
    assertEquals(
      await rows(
        db,
        `select status from public.crawl_logs order by id desc limit 1`
      ),
      [{ status: 'error' }]
    );
    await db.close();
  }
);

Deno.test(
  'a partial write is removed by its exact write time and nothing older',
  async () => {
    const db = await openDb();
    const processing = await source(db, PROCESSING_PAGE);
    const pages: Record<string, string> = {
      [JSON_BASE + 'data-ptime-en.json']: fixture('ptime_country.json'),
      [JSON_BASE + 'data-ptime-non-country-en.json']: fixture(
        'ptime_non_country.json'
      ),
      [JSON_BASE + 'data-country-name-en.json']: fixture('country_names.json'),
      [JSON_BASE + 'flpt-en.json']: fixture('flpt_current.json'),
      [JSON_BASE + 'flpt-by-week-en.json']: fixture('flpt_by_week.json'),
    };
    const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
    await ingestSource(processing, depsFor(db, pages, clock).deps);
    const before = await chunkRows(db);
    const country = JSON.parse(pages[JSON_BASE + 'data-ptime-en.json']);
    country.study.AF = '9 weeks';
    pages[JSON_BASE + 'data-ptime-en.json'] = JSON.stringify(country);
    clock.now = new Date('2026-10-24T12:00:00.000Z');

    // The third batch of 20 fails, after two batches (40 chunks) were written.
    const result = await ingestSource(
      processing,
      depsFor(db, pages, clock, { failEmbedOnCall: 3 }).deps
    );

    assertEquals(result.status, 'error');
    assertEquals(await chunkRows(db), before);
    await db.close();
  }
);

Deno.test(
  'a processing source of 465 records is embedded in batches of 20 and stored',
  async () => {
    const db = await openDb();
    const processing = await source(db, PROCESSING_PAGE);
    const pages: Record<string, string> = {
      [JSON_BASE + 'data-ptime-en.json']: fixture('ptime_country.json'),
      [JSON_BASE + 'data-ptime-non-country-en.json']: fixture(
        'ptime_non_country.json'
      ),
      [JSON_BASE + 'data-country-name-en.json']: fixture('country_names.json'),
      [JSON_BASE + 'flpt-en.json']: fixture('flpt_current.json'),
      [JSON_BASE + 'flpt-by-week-en.json']: fixture('flpt_by_week.json'),
    };
    const run = depsFor(db, pages, {
      now: new Date('2026-10-23T12:00:00.000Z'),
    });

    await ingestSource(processing, run.deps);

    const inserts = run.requests.filter(
      r => r.table === 'knowledge_chunks' && r.action === 'insert'
    );
    assertEquals(inserts.length, 24);
    assert(inserts.every(r => r.rowCount <= 20));
    assertEquals(
      (await chunkRows(db)).map(c => c.chunk_index),
      Array.from({ length: 465 }, (_, i) => i)
    );
    await db.close();
  }
);

// Falsifier: a chunk update without the document filter rewrites the chunks of
// every document that has the same chunk_index, here the draw document.
Deno.test('a refresh touches only its own document', async () => {
  const db = await openDb();
  const ee = await source(db, EE_PAGE);
  const processing = await source(db, PROCESSING_PAGE);
  const pages: Record<string, string> = {
    [EE_URL]: fixture('ee_rounds_sample.json'),
    [JSON_BASE + 'data-ptime-en.json']: fixture('ptime_country.json'),
    [JSON_BASE + 'data-ptime-non-country-en.json']: fixture(
      'ptime_non_country.json'
    ),
    [JSON_BASE + 'data-country-name-en.json']: fixture('country_names.json'),
    [JSON_BASE + 'flpt-en.json']: fixture('flpt_current.json'),
    [JSON_BASE + 'flpt-by-week-en.json']: fixture('flpt_by_week.json'),
  };
  const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
  const { deps } = depsFor(db, pages, clock);
  await ingestSource(ee, deps);
  await ingestSource(processing, deps);
  const drawsBefore = await rows(
    db,
    `select kc.chunk_text, kc.metadata from public.knowledge_chunks kc
       join public.knowledge_documents kd on kd.id = kc.document_id
      where kd.source_url = $1 order by kc.chunk_index`,
    [EE_PAGE]
  );
  clock.now = new Date('2026-10-24T12:00:00.000Z');

  assertEquals((await ingestSource(processing, deps)).status, 'skipped');

  const drawsAfter = await rows(
    db,
    `select kc.chunk_text, kc.metadata from public.knowledge_chunks kc
       join public.knowledge_documents kd on kd.id = kc.document_id
      where kd.source_url = $1 order by kc.chunk_index`,
    [EE_PAGE]
  );
  assertEquals(drawsAfter, drawsBefore);
  await db.close();
});
