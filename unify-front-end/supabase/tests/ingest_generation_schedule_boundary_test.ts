// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Scheduled calls of the public handler with the real store over supabase-js
// and the emulated HTTP hop, on the real migrations (PGlite), with a manual
// clock. What this proves: an open job keeps getting service while fresh
// sources are always due; a source that cannot start in time is listed as
// unstarted and is neither claimed nor stamped; and jobs that can never
// promote are retired without a live change.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EmbeddingError } from '../functions/_shared/embeddings.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import {
  page,
  prose,
  receipt,
} from '../functions/ingest-documents/lib/testSupport.ts';
import type { IngestStore } from '../functions/ingest-documents/lib/types.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { crawlLogs, live, unitVector } from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const KEY = 'test-service-role-key';
const JSON_BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const PROCESSING_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';
const FIXTURES = new URL('../functions/ingest-documents/lib/fixtures/ircc/', import.meta.url);
const fixture = (name: string) => Deno.readTextFileSync(new URL(name, FIXTURES));

function pages(): Record<string, string> {
  return {
    [JSON_BASE + 'data-ptime-en.json']: fixture('ptime_country.json'),
    [JSON_BASE + 'data-ptime-non-country-en.json']: fixture('ptime_non_country.json'),
    [JSON_BASE + 'data-country-name-en.json']: fixture('country_names.json'),
    [JSON_BASE + 'flpt-en.json']: fixture('flpt_current.json'),
    [JSON_BASE + 'flpt-by-week-en.json']: fixture('flpt_by_week.json'),
  };
}

interface CallOptions {
  at: string;
  batchMs: number;
  body?: Record<string, unknown>;
  /** Wraps the real store, for slow database calls. */
  wrap?: (store: IngestStore, clock: ManualClock) => IngestStore;
  /** Clock time one fetch takes; it honours the abort signal at the end. */
  fetchMs?: number;
}

async function call(db: Db, o: CallOptions) {
  const clock = new ManualClock();
  const sends: string[][] = [];
  const fetched: string[] = [];
  const feed = pages();
  const real = createStore(supabaseHttp(db).client);
  const res = await handleIngestRequest(
    new Request('https://example.test/ingest-documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(o.body ?? {}),
    }),
    {
      store: o.wrap ? o.wrap(real, clock) : real,
      now: () => new Date(o.at),
      timers: clock,
      fetchPage: (url, options) => {
        fetched.push(url);
        if (o.fetchMs) clock.advance(o.fetchMs);
        if (options?.signal?.aborted) {
          return Promise.reject(new DOMException('aborted', 'AbortError'));
        }
        // Every page source answers with a long distinct page.
        return Promise.resolve(feed[url] ?? page(prose(6_000, url)));
      },
      embedChecked: async (texts, options) => {
        sends.push(texts);
        await Promise.resolve();
        clock.advance(o.batchMs);
        if (options?.signal?.aborted) {
          throw new EmbeddingError('network', 'Embedding request did not complete');
        }
        return { vectors: texts.map(() => unitVector()), receipt: receipt(texts.length) };
      },
      serviceRoleKey: KEY,
    }
  );
  return { status: res.status, body: await res.json(), sends, fetched, clock };
}

async function processingId(db: Db) {
  const [row] = await rows<{ id: number }>(
    db,
    `select id::int as id from public.crawl_sources where url = $1`,
    [PROCESSING_PAGE]
  );
  return row.id;
}

/** Opens the processing job with one manual call that stops at the deadline. */
async function openProcessingJob(db: Db) {
  const id = await processingId(db);
  const first = await call(db, {
    at: '2026-10-25T00:00:00.000Z',
    batchMs: 4350,
    body: { crawl_source_id: id },
  });
  assertEquals(first.body.results[0].status, 'pending');
  return id;
}

// Falsifier: fresh sources fill both scheduled places in every run, so the
// open job never gets service and never publishes.
Deno.test(
  'an open job keeps getting service while fresh sources are always due',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await openProcessingJob(db);
      const served: number[] = [];
      let published = false;
      for (let hour = 1; hour <= 12 && !published; hour++) {
        const at = `2026-10-25T${String(hour).padStart(2, '0')}:00:00.000Z`;
        const run = await call(db, { at, batchMs: 4350 });
        const results = run.body.results as Array<Record<string, unknown>>;
        assertEquals(results.length, 2, JSON.stringify(run.body));
        assert(results[0].source_id !== id, 'a fresh source goes first');
        const cont = results.find(r => r.source_id === id)!;
        served.push(Number(cont.staged ?? (cont.status === 'success' ? 1950 : 0)));
        published = cont.status === 'success';
        assert(run.sends.length <= 25);
      }
      assert(published, `not published; staged per run ${served}`);
      assertEquals((await live(db, PROCESSING_PAGE)).chunks.length, 1950);
      // Fresh sources were due in every run: never-crawled pages remain.
      const [left] = await rows<{ n: number }>(
        db,
        `select count(*)::int as n from public.crawl_sources
          where enabled and last_crawled_at is null`
      );
      assert(left.n > 0);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the second source is claimed and stamped although too little
// work time is left to start it, so it loses its place in the due queue
// without being served.
Deno.test('a source that cannot start in time is unstarted and not stamped', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await processingId(db);
    const [later] = await rows<{ id: number }>(
      db,
      `select id::int as id from public.crawl_sources
        where enabled and source_kind = 'html' and id > $1 order by id limit 1`,
      [id]
    );
    await db.query(
      `update public.crawl_sources set enabled = false where id not in ($1, $2)`,
      [id, later.id]
    );
    // The first fetch runs until the first share ends (47.5 s) and is
    // aborted; the release and the error log each answer after 14 s (under
    // the 15 s wait ceiling). That leaves 19.5 s: a fresh start needs 20 s.
    const slow = (store: IngestStore, clock: ManualClock): IngestStore => {
      const after = <T>(p: Promise<T>) =>
        p.then(value => {
          clock.advance(14_000);
          return value;
        });
      return {
        ...store,
        releaseSource: (sourceId, token, c) => after(store.releaseSource(sourceId, token, c)),
        logCrawl: (entry, c) => after(store.logCrawl(entry, c)),
      };
    };
    const run = await call(db, {
      at: '2026-10-25T00:00:00.000Z',
      batchMs: 4000,
      wrap: slow,
      fetchMs: 60_000,
    });

    assertEquals(run.body.unstarted_source_ids, [later.id], JSON.stringify(run.body));
    assertEquals(run.body.results, [
      {
        source_id: id,
        status: 'error',
        error: 'The work deadline stopped the source before its job opened',
      },
    ]);
    assertEquals(run.fetched.length, 1, 'only the first source fetched');
    assertEquals(run.sends, []);
    const [stamp] = await rows<{ at: string | null }>(
      db,
      `select last_crawled_at::text as at from public.crawl_sources where id = $1`,
      [later.id]
    );
    assertEquals(stamp.at, null, 'an unstarted source is never stamped');
    assertEquals(await crawlLogs(db, later.id), []);
    assertEquals(
      await rows(db, `select 1 from public.crawl_source_leases where crawl_source_id = $1`, [
        later.id,
      ]),
      []
    );
  } finally {
    await db.close();
  }
});

// Falsifier: a job of another contract stays open forever or is continued,
// or retirement changes live data.
Deno.test('a scheduled call retires jobs that can never promote', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await openProcessingJob(db);
    await db.query(
      `update public.knowledge_embedding_cutover set contract_version = 'qwen3-8b-prefix1536-l2-v2'`
    );
    const before = await live(db, PROCESSING_PAGE);
    const run = await call(db, { at: '2026-10-25T01:00:00.000Z', batchMs: 4350 });
    assert(
      !(run.body.results as Array<{ source_id: number }>).some(r => r.source_id === id),
      'the incompatible job was served'
    );
    assertEquals(
      await rows(db, `select status, terminal_reason from public.knowledge_generation_jobs`),
      [{ status: 'failed', terminal_reason: 'model_changed' }]
    );
    assertEquals(await live(db, PROCESSING_PAGE), before);
  } finally {
    await db.close();
  }
});
