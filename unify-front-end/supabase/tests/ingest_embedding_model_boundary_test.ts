// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Embedding model identity through ingestSource, the real store (createStore),
// the real supabase-js client over an emulated HTTP hop and the real migration
// SQL in a local Postgres (PGlite with pgvector). The corpus starts in the
// state after the cutover: Qwen serving, writers enabled. PGlite runs one
// statement at a time, so a pause between the embedding call and the stage call
// is simulated by a SQL call made from inside the embedding stub.
import {
  assert,
  assertEquals,
  assertMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import type { CrawlSource } from '../functions/ingest-documents/lib/pickDueSources.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { page, prose } from '../functions/ingest-documents/lib/testSupport.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import { openIngestDb, openQwenIngestDb } from './support/ingestDb.ts';
import {
  CONTRACT,
  LEGACY,
  QWEN,
  setControl,
  withReceipt,
} from './support/embeddingModels.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const VECTOR = new Array(1536).fill(0.01);
const NEWS_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/news.html';

interface Run {
  at: string;
  pages: string;
  /** Called with the batch size before each embedding call returns. */
  onEmbed?: (call: number, size: number) => Promise<void> | void;
}

interface Crawl {
  batches: number[];
  deps: IngestDeps;
}

function crawl(db: Db, run: Run): Crawl {
  const batches: number[] = [];
  const deps: IngestDeps = {
    store: createStore(supabaseHttp(db).client),
    now: () => new Date(run.at),
    fetchPage: async () => await Promise.resolve(run.pages),
    embedChecked: withReceipt(async texts => {
      batches.push(texts.length);
      await run.onEmbed?.(batches.length, texts.length);
      return texts.map(() => VECTOR);
    }),
  };
  return { batches, deps };
}

async function htmlSource(db: Db): Promise<CrawlSource> {
  const [{ url }] = await rows<{ url: string }>(
    db,
    `select url from public.crawl_sources where source_kind = 'html' and enabled order by id limit 1`
  );
  const found = await createStore(
    supabaseHttp(db).client
  ).findEnabledCrawlSourceByUrl(url);
  assert(found);
  return found;
}

const models = (db: Db) =>
  rows<{ what: string; embedding_model: string; n: number }>(
    db,
    `select 'document' as what, embedding_model, count(*)::int as n from public.knowledge_documents group by 2
     union all
     select 'chunk', embedding_model, count(*)::int from public.knowledge_chunks group by 2
     order by 1, 2`
  );

const PAGE_A = page(prose(6_000, 'a'));

/** First crawl, then `change` the stored state, then crawl the same page again. */
async function secondCrawl(change: string) {
  const db = await openIngestDb();
  try {
    await setControl(db, 'qwen', QWEN, `, contract_version = '${CONTRACT}'`);
    const source = await htmlSource(db);
    const first = crawl(db, { at: '2026-10-25T00:00:00Z', pages: PAGE_A });
    assertEquals((await ingestSource(source, first.deps)).status, 'success');
    if (change) await db.exec(change);
    const second = crawl(db, { at: '2026-10-26T00:00:00Z', pages: PAGE_A });
    const result = await ingestSource(source, second.deps);
    return { result, batches: second.batches, models: await models(db), db };
  } catch (error) {
    await db.close();
    throw error;
  }
}

// Falsifier: with equal content hashes the old code refreshes dates only and
// keeps vectors of the wrong model forever.
const STALE_STATES: Array<[string, string]> = [
  [
    'legacy document and legacy chunks',
    `update public.knowledge_documents set embedding_model = '${LEGACY}';
     update public.knowledge_chunks set embedding_model = '${LEGACY}';`,
  ],
  [
    'one legacy chunk among Qwen chunks',
    `update public.knowledge_chunks set embedding_model = '${LEGACY}'
      where id = (select min(id) from public.knowledge_chunks);`,
  ],
  [
    'a legacy document label over Qwen chunks',
    `update public.knowledge_documents set embedding_model = '${LEGACY}';`,
  ],
  [
    'a chunk without a vector',
    `update public.knowledge_chunks set embedding = null
      where id = (select min(id) from public.knowledge_chunks);`,
  ],
];
for (const [name, change] of STALE_STATES) {
  Deno.test(
    `equal content with ${name} is embedded again as Qwen`,
    async () => {
      const r = await secondCrawl(change);
      try {
        assertEquals(r.result.status, 'success');
        assert(r.batches.length > 0, 'the chunks were embedded again');
        assertEquals(r.models, [
          { what: 'chunk', embedding_model: QWEN, n: r.models[0].n },
          { what: 'document', embedding_model: QWEN, n: 1 },
        ]);
      } finally {
        await r.db.close();
      }
    }
  );
}

// Falsifier: the opposite mistake, re-embedding a complete Qwen document, would
// spend the paid call on every hourly refresh.
Deno.test(
  'equal content with a complete Qwen generation only refreshes dates',
  async () => {
    const r = await secondCrawl('');
    try {
      assertEquals(r.result.status, 'skipped');
      assertEquals(r.batches, []);
      const [doc] = await rows<{ fetched_at: string }>(
        r.db,
        `select metadata->>'fetched_at' as fetched_at from public.knowledge_documents`
      );
      assertEquals(doc.fetched_at, '2026-10-26T00:00:00.000Z');
    } finally {
      await r.db.close();
    }
  }
);

// Falsifier: a document with no chunks has no vector to show its model, so the
// label alone must send it through a promotion, even though nothing is embedded.
Deno.test(
  'an empty newsroom document with a legacy label is promoted as Qwen',
  async () => {
    const db = await openIngestDb();
    try {
      await setControl(db, 'qwen', QWEN, `, contract_version = '${CONTRACT}'`);
      const [news] = await rows<{ id: number }>(
        db,
        `select id::int as id from public.crawl_sources where url = $1`,
        [NEWS_PAGE]
      );
      const source = (await createStore(supabaseHttp(db).client).getCrawlSource(
        news.id
      ))!;
      // One item in the 30-day window, then the same feed once it has expired:
      // a valid empty window leaves a document with no chunks.
      const feed = JSON.stringify({
        feed: {
          entry: [
            {
              publishedDate: '2026-09-24T12:00:00-04:00',
              title: 'Old policy',
              teaser: 'Old summary',
              link: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/old.html',
            },
          ],
        },
      });
      const withItem = crawl(db, { at: '2026-10-23T00:00:00Z', pages: feed });
      assertEquals(
        (await ingestSource(source, withItem.deps)).status,
        'success'
      );
      const emptied = crawl(db, { at: '2026-10-25T00:00:00Z', pages: feed });
      assertEquals(
        (await ingestSource(source, emptied.deps)).status,
        'success'
      );
      assertEquals(
        await rows(db, `select 1 from public.knowledge_chunks`),
        [],
        'the window is empty'
      );
      await db.exec(
        `update public.knowledge_documents set embedding_model = '${LEGACY}'`
      );
      const second = crawl(db, { at: '2026-10-26T00:00:00Z', pages: feed });

      const result = await ingestSource(source, second.deps);

      assertEquals(result.status, 'success');
      assertEquals(second.batches, [], 'nothing to embed');
      assertEquals(await models(db), [
        { what: 'document', embedding_model: QWEN, n: 1 },
      ]);
    } finally {
      await db.close();
    }
  }
);

const PAGE_41 = (seed: string) => page(prose(69_000, seed));

// Falsifier: a failure in the second batch must leave the old version whole,
// and a retry must not leave a partial generation.
Deno.test(
  '41 chunks embed as 20, 20 and 1, and a failure in batch two keeps the old version',
  async () => {
    const db = await openIngestDb();
    try {
      await setControl(db, 'qwen', QWEN, `, contract_version = '${CONTRACT}'`);
      const source = await htmlSource(db);
      const first = crawl(db, {
        at: '2026-10-25T00:00:00Z',
        pages: PAGE_41('a'),
      });
      const created = await ingestSource(source, first.deps);
      assertEquals(created.chunks_created, 41);
      assertEquals(first.batches, [20, 20, 1]);

      const state = () =>
        rows(
          db,
          `select kc.id, kc.chunk_index, kc.chunk_text, kc.embedding::text, kc.embedding_model,
                kd.content_hash, kd.embedding_model as document_model
           from public.knowledge_chunks kc join public.knowledge_documents kd on kd.id = kc.document_id
          order by kc.id`
        );
      const before = await state();

      const attempt = crawl(db, {
        at: '2026-10-26T00:00:00Z',
        pages: PAGE_41('b'),
        onEmbed: call => {
          if (call === 2) throw new Error('embedding service unavailable');
        },
      });
      const failed = await ingestSource(source, attempt.deps);

      // The first checked batch waits in the open job; nothing is live.
      assertEquals(failed.status, 'pending');
      assertEquals(failed.stop_reason, 'provider_error');
      assertEquals(failed.staged, 20);
      assertEquals(attempt.batches, [20, 20]);
      assertEquals(await state(), before);
      assertEquals(
        await rows(db, `select 1 from public.knowledge_chunk_staging`),
        []
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a writer paused between its embedding call and its stage call must
// not stage vectors, or the rebuild's frozen snapshot is no longer the corpus.
Deno.test(
  'a pause between the embedding call and the stage call writes nothing',
  async () => {
    const db = await openIngestDb();
    try {
      await setControl(db, 'qwen', QWEN, `, contract_version = '${CONTRACT}'`);
      const source = await htmlSource(db);
      const first = crawl(db, {
        at: '2026-10-25T00:00:00Z',
        pages: PAGE_41('a'),
      });
      await ingestSource(source, first.deps);
      const before = await rows(
        db,
        `select id, chunk_text, embedding::text, embedding_model from public.knowledge_chunks order by id`
      );
      assertEquals(
        before.length,
        41,
        'the Qwen version exists before the pause'
      );

      const attempt = crawl(db, {
        at: '2026-10-26T00:00:00Z',
        pages: PAGE_41('b'),
        onEmbed: async call => {
          if (call === 1) {
            await db.exec(
              `update public.knowledge_embedding_cutover set writers_paused = true`
            );
          }
        },
      });
      const result = await ingestSource(source, attempt.deps);

      // The compatible job stays open and inert while writers are paused.
      assertEquals(result.status, 'pending');
      assertEquals(result.stop_reason, 'store_error');
      assertMatch(result.error ?? '', /paused/);
      assertEquals(result.staged, 0);
      assertEquals(
        await rows(
          db,
          `select id, chunk_text, embedding::text, embedding_model from public.knowledge_chunks order by id`
        ),
        before
      );
    } finally {
      await db.close();
    }
  }
);
void CONTRACT;

// Falsifier: while writers are paused a scheduled call must do no external work
// and leave the source's stamp alone, so the rebuild never races a crawl.
Deno.test('a paused call reports busy and does no external work', async () => {
  const db = await openQwenIngestDb();
  try {
    await db.exec(
      `update public.knowledge_embedding_cutover set writers_paused = true`
    );
    const source = await htmlSource(db);
    let fetched = 0;
    const attempt = crawl(db, { at: '2026-10-26T00:00:00Z', pages: PAGE_A });
    const deps: IngestDeps = {
      ...attempt.deps,
      fetchPage: () => {
        fetched++;
        return Promise.resolve(PAGE_A);
      },
    };

    const result = await ingestSource(source, deps);

    assertEquals(result.status, 'skipped');
    assertEquals([fetched, attempt.batches], [0, []]);
    const [row] = await rows<{ last_crawled_at: string | null }>(
      db,
      `select last_crawled_at from public.crawl_sources where id = $1`,
      [source.id]
    );
    assertEquals(row.last_crawled_at, null);
  } finally {
    await db.close();
  }
});
