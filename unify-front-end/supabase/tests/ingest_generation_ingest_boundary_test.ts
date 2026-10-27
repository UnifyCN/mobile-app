// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Resumable generations at the approved seams: ingestSource and the public
// handler, the real store (createStore) over supabase-js and the emulated HTTP
// hop, and the real migration SQL in PGlite. Fetches and the provider are
// stubs that return real converter input and checked vectors. What this does
// not prove: hosted PostgREST, lock waits (native PostgreSQL checks), the
// edge worker's limits, or OpenRouter's answers.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EmbeddingError } from '../functions/_shared/embeddings.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import { convertProcessingTimes } from '../functions/ingest-documents/lib/ircc/processingTimes.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import {
  page,
  prose,
  receipt,
} from '../functions/ingest-documents/lib/testSupport.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { withReceipt } from './support/embeddingModels.ts';
import { crawlLogs, live, unitVector } from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

function deps(db: Db, pages: Record<string, string>, sent: number[] = []) {
  const http = supabaseHttp(db);
  const d: IngestDeps = {
    store: createStore(http.client),
    now: () => new Date('2026-10-25T00:00:00.000Z'),
    fetchPage: url => {
      const body = pages[url];
      return body === undefined
        ? Promise.reject(new Error(`HTTP 404: ${url}`))
        : Promise.resolve(body);
    },
    embedChecked: withReceipt(texts => {
      sent.push(texts.length);
      return Promise.resolve(texts.map(() => unitVector()));
    }),
  };
  return { deps: d, requests: http.requests };
}

async function htmlSource(db: Db) {
  const [row] = await rows<{ id: number }>(
    db,
    `select id::int as id from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  const source = await createStore(supabaseHttp(db).client).getCrawlSource(row.id);
  assert(source);
  return source;
}

// Falsifier: the refresh still stages under its lease token (lost to the next
// claim), writes no durable job, or logs its success twice.
Deno.test(
  'a changed page is published through one durable job with one success log',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const source = await htmlSource(db);
      const sent: number[] = [];
      const run = deps(db, { [source.url]: page(prose(60_000)) }, sent);
      const result = await ingestSource(source, run.deps);

      assertEquals(result.status, 'success');
      const chunks = (await live(db, source.url)).chunks;
      assert(chunks.length > 20, `got ${chunks.length} chunks`);
      assertEquals(result.chunks_created, chunks.length);
      assert(sent.every(n => n <= 20));
      assertEquals(sent.reduce((a, b) => a + b, 0), chunks.length);
      const names = run.requests.filter(r => r.action === 'rpc').map(r => r.table);
      assert(!names.includes('stage_knowledge_chunks'), 'legacy staging was used');
      assert(names.includes('ingest_generation_open'));
      const jobs = await rows<{ status: string; chunk_count: number; requests_reserved: number }>(
        db,
        `select status, chunk_count, requests_reserved from public.knowledge_generation_jobs`
      );
      assertEquals(jobs, [
        { status: 'promoted', chunk_count: chunks.length, requests_reserved: sent.length },
      ]);
      assertEquals(await crawlLogs(db, source.id), [
        {
          status: 'success',
          error_message: null,
          chunks_created: chunks.length,
          content_changed: true,
        },
      ]);
    } finally {
      await db.close();
    }
  }
);

// The five official processing-time files. CI reads the repository fixtures
// (1950 records); INGEST_PROCESSING_FEED_DIR can name a directory with the
// current official downloads under their official names.
const JSON_BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const FEED_FILES: Record<string, string> = {
  'data-ptime-en.json': 'ptime_country.json',
  'data-ptime-non-country-en.json': 'ptime_non_country.json',
  'data-country-name-en.json': 'country_names.json',
  'flpt-en.json': 'flpt_current.json',
  'flpt-by-week-en.json': 'flpt_by_week.json',
};
function processingFeed(): Record<string, string> {
  const dir = Deno.env.get('INGEST_PROCESSING_FEED_DIR');
  const fixtures = new URL('../functions/ingest-documents/lib/fixtures/ircc/', import.meta.url);
  return Object.fromEntries(
    Object.entries(FEED_FILES).map(([official, fixture]) => [
      JSON_BASE + official,
      dir
        ? Deno.readTextFileSync(`${dir}/${official}`)
        : Deno.readTextFileSync(new URL(fixture, fixtures)),
    ])
  );
}
function convertedTexts(feed: Record<string, string>): string[] {
  const read = (name: string) => JSON.parse(feed[JSON_BASE + name].replace(/^﻿/, ''));
  return convertProcessingTimes({
    countryTimes: read('data-ptime-en.json'),
    nonCountryTimes: read('data-ptime-non-country-en.json'),
    countryNames: read('data-country-name-en.json'),
    flpt: read('flpt-en.json'),
    flptByWeek: read('flpt-by-week-en.json'),
  }).records.map(r => r.text);
}

const KEY = 'test-service-role-key';
const PROCESSING_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';

interface Invocation {
  clock: ManualClock;
  /** Every provider request, with its texts and whether it completed. */
  sends: Array<{ texts: string[]; completed: boolean }>;
  fetched: string[];
}

/** One served-handler call with a fresh manual clock (a new invocation). */
async function invoke(
  db: Db,
  body: Record<string, unknown>,
  o: { at: string; feed: Record<string, string>; batchMs: number; log?: Invocation[] }
) {
  const clock = new ManualClock();
  const inv: Invocation = { clock, sends: [], fetched: [] };
  o.log?.push(inv);
  const res = await handleIngestRequest(
    new Request('https://example.test/ingest-documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    }),
    {
      store: createStore(supabaseHttp(db).client),
      now: () => new Date(o.at),
      timers: clock,
      fetchPage: url => {
        inv.fetched.push(url);
        const text = o.feed[url];
        return text === undefined
          ? Promise.reject(new Error(`HTTP 404: ${url}`))
          : Promise.resolve(text);
      },
      embedChecked: async (texts, options) => {
        const send = { texts, completed: false };
        inv.sends.push(send);
        await Promise.resolve();
        clock.advance(o.batchMs);
        if (options?.signal?.aborted) {
          throw new EmbeddingError('network', 'Embedding request did not complete');
        }
        send.completed = true;
        return { vectors: texts.map(() => unitVector()), receipt: receipt(texts.length) };
      },
      serviceRoleKey: KEY,
    }
  );
  return { status: res.status, body: await res.json(), inv };
}

async function processingSource(db: Db) {
  const [row] = await rows<{ id: number }>(
    db,
    `select id::int as id from public.crawl_sources where url = $1`,
    [PROCESSING_PAGE]
  );
  return row.id;
}

// Falsifier: the run embeds every batch with no deadline (98 x 4.35 s, far
// past 95 s), reports success or an empty result, or loses the staged rows.
Deno.test(
  'slow batches stop at the 95-second work deadline with an explicit pending result',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await processingSource(db);
      const feed = processingFeed();
      const { status, body, inv } = await invoke(db, { crawl_source_id: id }, {
        at: '2026-10-25T00:00:00.000Z',
        feed,
        batchMs: 4350,
      });

      assertEquals(status, 200);
      assert(inv.clock.now() < 110_000, `answered at ${inv.clock.now()} ms`);
      assertEquals(body.version, 2);
      assertEquals(body.unstarted_source_ids, []);
      // 21 batches end by 91.35 s; the 22nd is aborted at 95 s.
      assertEquals(body.provider_sends, 22);
      assertEquals(inv.sends.length, 22);
      assertEquals(inv.sends.filter(s => s.completed).length, 21);
      const [result] = body.results;
      assertEquals(
        {
          status: result.status,
          stop_reason: result.stop_reason,
          total: result.total,
          staged: result.staged,
          remaining: result.remaining,
          reserved: result.reserved,
          cap: result.cap,
          unknown_outcome: result.unknown_outcome,
        },
        {
          status: 'pending',
          stop_reason: 'work_deadline',
          total: 1950,
          staged: 420,
          remaining: 1530,
          reserved: 22,
          cap: 201,
          unknown_outcome: false,
        }
      );
      assertEquals(typeof result.job_id, 'string');
      assertEquals(String(result.fingerprint).length, 64);
      assertEquals((await live(db, PROCESSING_PAGE)).documents, []);
      assertEquals(await crawlLogs(db, id), [], 'pending work writes no crawl log');
      const [stamp] = await rows<{ at: string }>(
        db,
        `select last_crawled_at::text as at from public.crawl_sources where id = $1`,
        [id]
      );
      assert(stamp.at !== null);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: work is lost between calls, a confirmed row is embedded again,
// a continuation re-fetches or re-stamps, or the published generation has a
// lost, repeated or reordered record.
Deno.test(
  'later invocations continue the same job under new leases to one complete promotion',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await processingSource(db);
      const feed = processingFeed();
      const expected = convertedTexts(feed);
      assertEquals(expected.length, 1950);
      const log: Invocation[] = [];
      const hours = ['00', '01', '02', '03', '04', '05', '06', '07'];
      let final: Record<string, unknown> | undefined;
      for (const hour of hours) {
        const { body } = await invoke(db, { crawl_source_id: id }, {
          at: `2026-10-25T${hour}:00:00.000Z`,
          feed,
          batchMs: 4350,
          log,
        });
        final = body.results[0];
        if (final?.status !== 'pending') break;
      }
      assertEquals(final?.status, 'success');
      assertEquals(final?.chunks_created, 1950);
      assertEquals(log.length, 5, '420 rows per invocation');
      assertEquals(log[0].fetched.length, 5);
      assert(log.slice(1).every(i => i.fetched.length === 0), 'a continuation re-fetched');

      const published = (await live(db, PROCESSING_PAGE)).chunks;
      assertEquals(published.map(c => c.chunk_text), expected);
      assertEquals(published.map(c => c.chunk_index), expected.map((_, i) => i));
      const confirmed = log.flatMap(i => i.sends.filter(s => s.completed).flatMap(s => s.texts));
      assertEquals(confirmed.length, 1950, 'each confirmed row was embedded once');
      assertEquals(new Set(confirmed).size, new Set(expected).size);
      assert(log.every(i => i.sends.length <= 25));
      assertEquals(await crawlLogs(db, id), [
        { status: 'success', error_message: null, chunks_created: 1950, content_changed: true },
      ]);
      const [stamp] = await rows<{ at: string }>(
        db,
        `select to_char(last_crawled_at at time zone 'UTC', 'HH24') as at
           from public.crawl_sources where id = $1`,
        [id]
      );
      assertEquals(stamp.at, '00', 'only the fresh fetch stamps an attempt');
      assertEquals(
        await rows(db, `select status from public.knowledge_generation_jobs`),
        [{ status: 'promoted' }]
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a fast provider lets one invocation send more than 25 requests.
Deno.test('one invocation sends at most 25 provider requests', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await processingSource(db);
    const { body, inv } = await invoke(db, { crawl_source_id: id }, {
      at: '2026-10-25T00:00:00.000Z',
      feed: processingFeed(),
      batchMs: 10,
    });
    assertEquals(inv.sends.length, 25);
    assertEquals(body.provider_sends, 25);
    const [result] = body.results;
    assertEquals([result.status, result.stop_reason, result.staged], ['pending', 'send_limit', 500]);
  } finally {
    await db.close();
  }
});
