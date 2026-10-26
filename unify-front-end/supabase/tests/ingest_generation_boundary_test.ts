// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Refresh safety at the real boundaries: the public handler and ingestSource,
// the real store (createStore), the real supabase-js client over an emulated
// HTTP hop (support/supabaseHttp.ts), and the real migration SQL in a local
// Postgres (PGlite with pgvector).
//
// What these tests prove: the database lease, its fencing token and the one
// transaction that promotes a generation keep exactly one complete version
// when calls interleave at request granularity, when an owner's lease expires,
// and when a statement fails. What they do not prove: PGlite runs one
// statement at a time, so two transactions never wait on each other's row
// locks here. The lock waits are standard PostgreSQL behaviour of INSERT ... ON
// CONFLICT and SELECT ... FOR UPDATE, not tested in this file. Nor do they
// prove a real PostgREST server, hosted roles or the edge worker's limits.
import {
  assert,
  assertEquals,
  assertMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import type { CrawlSource } from '../functions/ingest-documents/lib/pickDueSources.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { computeContentHash } from '../functions/ingest-documents/lib/text.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { QWEN } from './support/embeddingModels.ts';
import { embedding, rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const FIXTURES = new URL(
  '../functions/ingest-documents/lib/fixtures/ircc/',
  import.meta.url
);
const fixture = (name: string) =>
  Deno.readTextFileSync(new URL(name, FIXTURES));
const JSON_BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const EE_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';
const PROCESSING_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';
const NEWS_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/news.html';
const KEY = 'test-service-role-key';
const VECTOR = new Array(1536).fill(0.01);

function draw(number: number, date = '2026-10-20', size = '1,000') {
  return {
    drawNumber: String(number),
    drawDate: date,
    drawName: 'Canadian Experience Class',
    drawSize: size,
    drawCRS: '500',
  };
}

const drawText = (number: number) =>
  `Express Entry draw #${number} on October 20, 2026: Canadian Experience Class, 1,000 invitations, minimum CRS 500.`;

function gate() {
  let open!: () => void;
  const opened = new Promise<void>(resolve => (open = resolve));
  return { opened, open };
}

function processingPages(): Record<string, string> {
  return {
    [JSON_BASE + 'data-ptime-en.json']: fixture('ptime_country.json'),
    [JSON_BASE + 'data-ptime-non-country-en.json']: fixture(
      'ptime_non_country.json'
    ),
    [JSON_BASE + 'data-country-name-en.json']: fixture('country_names.json'),
    [JSON_BASE + 'flpt-en.json']: fixture('flpt_current.json'),
    [JSON_BASE + 'flpt-by-week-en.json']: fixture('flpt_by_week.json'),
  };
}

interface Run {
  at: string;
  /** Body for every fetch, or a map of address to body. */
  pages: string | Record<string, string>;
  /** Awaited before each embedding call returns. */
  beforeEmbed?: () => Promise<void>;
}

function deps(db: Db, run: Run): IngestDeps & { serviceRoleKey: string } {
  return {
    store: createStore(supabaseHttp(db).client),
    now: () => new Date(run.at),
    fetchPage: async url => {
      const body = typeof run.pages === 'string' ? run.pages : run.pages[url];
      if (body === undefined) throw new Error(`HTTP 404: ${url}`);
      return await Promise.resolve(body);
    },
    embed: async texts => {
      await run.beforeEmbed?.();
      return texts.map(() => VECTOR);
    },
    serviceRoleKey: KEY,
  };
}

const request = (body: unknown) =>
  new Request('https://example.test/ingest-documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });

async function source(db: Db, url: string): Promise<CrawlSource> {
  const found = await createStore(
    supabaseHttp(db).client
  ).findEnabledCrawlSourceByUrl(url);
  assert(found, `no source for ${url}`);
  return found;
}

/** Every chunk of the document at `url`, in index order. */
function chunksOf(db: Db, url: string) {
  return rows<{
    chunk_index: number;
    chunk_text: string;
    published_at: string;
    fetched_at: string;
  }>(
    db,
    `select kc.chunk_index, kc.chunk_text,
            kc.metadata->>'published_at' as published_at,
            kc.metadata->>'fetched_at' as fetched_at
       from public.knowledge_chunks kc
       join public.knowledge_documents kd on kd.id = kc.document_id
      where kd.source_url = $1
      order by kc.chunk_index, kc.id`,
    [url]
  );
}

async function documentOf(db: Db, url: string) {
  const found = await rows<{
    content_hash: string | null;
    fetched_at: string;
    published_at: string;
    chunk_count: number | null;
  }>(
    db,
    `select content_hash, metadata->>'fetched_at' as fetched_at,
            metadata->>'published_at' as published_at,
            (metadata->>'chunk_count')::int as chunk_count
       from public.knowledge_documents where source_url = $1`,
    [url]
  );
  assertEquals(found.length, 1, `one document for ${url}`);
  return found[0];
}

async function lastCrawledAt(db: Db, url: string): Promise<string> {
  const [row] = await rows<{ at: string }>(
    db,
    `select to_char(last_crawled_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
       from public.crawl_sources where url = $1`,
    [url]
  );
  return row.at;
}

/** Ends every lease now, as if each owner had stopped renewing it. */
async function expireLeases(db: Db) {
  await db.exec(`do $$ begin
    if to_regclass('public.crawl_source_leases') is not null then
      update public.crawl_source_leases set expires_at = now() - interval '1 second';
    end if;
  end $$;`);
}

async function leftovers(db: Db) {
  const [row] = await rows<{ leases: number; staged: number }>(
    db,
    `select (select count(*)::int from public.crawl_source_leases) as leases,
            (select count(*)::int from public.knowledge_chunk_staging) as staged`
  );
  return row;
}

/** The stored chunks are one complete generation and the hash describes them. */
async function assertOneGeneration(db: Db, url: string, texts: string[]) {
  const chunks = await chunksOf(db, url);
  assertEquals(
    chunks.map(c => [c.chunk_index, c.chunk_text]),
    texts.map((text, i) => [i, text])
  );
  // The unchanged check compares this hash with the next crawl's records, so
  // it must describe exactly the stored text.
  assertEquals(
    (await documentOf(db, url)).content_hash,
    await computeContentHash(texts.join('\n'))
  );
}

// Falsifier: the reviewed code returns success for both calls and keeps the
// #401 and #402 chunks side by side, with the older #401 hash and stamp.
Deno.test(
  'a manual call during a scheduled refresh cannot leave two versions',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ee = await source(db, EE_PAGE);
      await db.query(
        `update public.crawl_sources set enabled = false where id <> $1`,
        [ee.id]
      );
      await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-21T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(400)] }),
        })
      );
      const reached = gate();
      const resume = gate();

      const scheduled = handleIngestRequest(
        request({}),
        deps(db, {
          at: '2026-10-23T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(401)] }),
          beforeEmbed: async () => {
            reached.open();
            await resume.opened;
          },
        })
      );
      await reached.opened;
      const manual = await handleIngestRequest(
        request({ crawl_source_id: ee.id }),
        deps(db, {
          at: '2026-10-23T00:00:01Z',
          pages: JSON.stringify({ rounds: [draw(402)] }),
        })
      );
      resume.open();
      const scheduledResponse = await scheduled;

      assertEquals(scheduledResponse.status, 200);
      assertEquals(manual.status, 200);
      assertEquals((await scheduledResponse.json()).results, [
        { source_id: ee.id, status: 'success', chunks_created: 1 },
      ]);
      assertEquals((await manual.json()).results, [
        {
          source_id: ee.id,
          status: 'skipped',
          error: 'Another call is refreshing this source',
        },
      ]);
      await assertOneGeneration(db, EE_PAGE, [drawText(401)]);
      assertEquals(await lastCrawledAt(db, EE_PAGE), '2026-10-23T00:00:00Z');
      assertEquals(await leftovers(db), { leases: 0, staged: 0 });
    } finally {
      await db.close();
    }
  }
);

// Falsifier: without a fencing token the paused older owner finishes last and
// overwrites the newer #402 version, its hash and its later stamp.
Deno.test(
  'an owner whose lease expired cannot commit after a newer claim',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ee = await source(db, EE_PAGE);
      await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-21T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(400)] }),
        })
      );
      const reached = gate();
      const resume = gate();
      const older = ingestSource(
        ee,
        deps(db, {
          at: '2026-10-23T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(401)] }),
          beforeEmbed: async () => {
            reached.open();
            await resume.opened;
          },
        })
      );
      await reached.opened;
      await expireLeases(db);
      const newer = await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-23T00:05:00Z',
          pages: JSON.stringify({ rounds: [draw(402)] }),
        })
      );
      resume.open();
      const late = await older;

      assertEquals(newer.status, 'success');
      assertEquals(late.status, 'error');
      assertMatch(late.error ?? '', /lease lost/);
      await assertOneGeneration(db, EE_PAGE, [drawText(402)]);
      assertEquals(await lastCrawledAt(db, EE_PAGE), '2026-10-23T00:05:00Z');
      assertEquals(await leftovers(db), { leases: 0, staged: 0 });
    } finally {
      await db.close();
    }
  }
);

// Falsifier: in any interleaving, a version that is not one complete generation,
// a hash that does not match the chunks, an earlier stamp than the newest
// attempt that ran, or a lease or staged row left behind fails this test.
Deno.test(
  'four calls at once for one source leave one consistent version',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ee = await source(db, EE_PAGE);
      await db.query(
        `update public.crawl_sources set enabled = false where id <> $1`,
        [ee.id]
      );
      await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-21T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(400)] }),
        })
      );
      const pause = (ms: number) => () =>
        new Promise<void>(resolve => setTimeout(resolve, ms));
      const calls = [
        { body: {}, at: '2026-10-23T00:00:00Z', number: 401, delay: 15 },
        {
          body: { crawl_source_id: ee.id },
          at: '2026-10-23T00:00:01Z',
          number: 402,
          delay: 0,
        },
        {
          body: { url: EE_PAGE },
          at: '2026-10-23T00:00:02Z',
          number: 403,
          delay: 5,
        },
        {
          body: { crawl_source_id: ee.id },
          at: '2026-10-23T00:00:03Z',
          number: 404,
          delay: 1,
        },
      ];

      const responses = await Promise.all(
        calls.map(call =>
          handleIngestRequest(
            request(call.body),
            deps(db, {
              at: call.at,
              pages: JSON.stringify({ rounds: [draw(call.number)] }),
              beforeEmbed: pause(call.delay),
            })
          ).then(async r => ({ call, status: r.status, body: await r.json() }))
        )
      );

      assert(responses.every(r => r.status === 200));
      const ran = responses.filter(
        r =>
          r.body.results[0].error !== 'Another call is refreshing this source'
      );
      // Some calls overlapped a live claim, so the lease was contended.
      assert(
        ran.length >= 1 && ran.length < calls.length,
        JSON.stringify(responses)
      );
      const chunks = await chunksOf(db, EE_PAGE);
      assertEquals(chunks.length, 1);
      const stored = calls.find(
        c => chunks[0].chunk_text === drawText(c.number)
      );
      assert(stored, chunks[0].chunk_text);
      assert(
        ran.some(r => r.call === stored),
        'the stored version is from a call that ran'
      );
      await assertOneGeneration(db, EE_PAGE, [drawText(stored.number)]);
      const newestRan = ran
        .map(r => r.call.at)
        .sort()
        .at(-1)!;
      assertEquals(
        await lastCrawledAt(db, EE_PAGE),
        newestRan.replace('.000', '')
      );
      assertEquals(await leftovers(db), { leases: 0, staged: 0 });
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the reviewed store logs a failed DELETE and commits the new hash,
// so #400 stays next to #401 and the unchanged retry never removes it.
Deno.test(
  'a failed replacement keeps the previous version and the next crawl repairs it',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ee = await source(db, EE_PAGE);
      await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-21T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(400)] }),
        })
      );
      await db.exec(`create function public.test_fail_delete() returns trigger
        language plpgsql as $$ begin raise exception 'injected delete failure'; end; $$;
        create trigger test_fail_delete before delete on public.knowledge_chunks
          for each statement execute function public.test_fail_delete();`);

      const failed = await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-23T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(401)] }),
        })
      );

      assertEquals(failed.status, 'error');
      assertMatch(failed.error ?? '', /injected delete failure/);
      await assertOneGeneration(db, EE_PAGE, [drawText(400)]);
      assertEquals(await leftovers(db), { leases: 0, staged: 0 });

      await db.exec('drop trigger test_fail_delete on public.knowledge_chunks');
      const retry = await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-24T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(401)] }),
        })
      );

      assertEquals(retry.status, 'success');
      await assertOneGeneration(db, EE_PAGE, [drawText(401)]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier (standards review case B): after a failed stale-chunk delete, the
// reviewed store refreshed both generations by chunk_index, giving the SAWP
// record 2026-10-09 and the citizenship certificate 2026-10-17.
Deno.test(
  'a failed replacement never gives a record another record date',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const processing = await source(db, PROCESSING_PAGE);
      const pages = processingPages();
      assertEquals(
        (
          await ingestSource(
            processing,
            deps(db, { at: '2026-10-23T12:00:00Z', pages })
          )
        ).status,
        'success'
      );
      const nonCountry = JSON.parse(
        pages[JSON_BASE + 'data-ptime-non-country-en.json']
      );
      nonCountry.visitor_inside_canada.visitor_inside_canada =
        'No processing time available';
      pages[JSON_BASE + 'data-ptime-non-country-en.json'] =
        JSON.stringify(nonCountry);
      await db.exec(`create function public.test_fail_delete() returns trigger
        language plpgsql as $$ begin raise exception 'canceling statement due to statement timeout' using errcode = '57014'; end; $$;
        create trigger test_fail_delete before delete on public.knowledge_chunks
          for each statement execute function public.test_fail_delete();`);

      const failed = await ingestSource(
        processing,
        deps(db, { at: '2026-10-24T12:00:00Z', pages })
      );
      await db.exec('drop trigger test_fail_delete on public.knowledge_chunks');
      const next = await ingestSource(
        processing,
        deps(db, { at: '2026-10-25T12:00:00Z', pages })
      );

      assertEquals(failed.status, 'error');
      assertEquals(next.status, 'success');
      const chunks = await chunksOf(db, PROCESSING_PAGE);
      assertEquals(chunks.length, 1950);
      assertEquals(
        chunks.map(c => c.chunk_index),
        Array.from({ length: 1950 }, (_, i) => i)
      );
      const dateOf = (start: string) =>
        chunks
          .filter(c => c.chunk_text.startsWith(start))
          .map(c => c.published_at);
      assertEquals(
        dateOf(
          'Processing time for Seasonal Agricultural Worker Program (SAWP): 95 days.'
        ),
        ['2026-10-21']
      );
      assertEquals(
        dateOf(
          'Processing time for Citizenship certificate (proof of citizenship): About 34 months.'
        ),
        ['2026-10-09']
      );
      assertEquals(
        dateOf(
          'Processing time for Visitor visa (from inside Canada): No processing time available.'
        ),
        ['2026-10-21']
      );
      const byDate: Record<string, number> = {};
      for (const c of chunks)
        byDate[c.published_at] = (byDate[c.published_at] ?? 0) + 1;
      assertEquals(byDate, {
        '2026-10-21': 1924,
        '2026-10-09': 24,
        '2026-10-17': 2,
      });
    } finally {
      await db.close();
    }
  }
);

// Falsifier (standards review case A): the reviewed converter counts the
// missing groups and the crawl replaces 465 chunks with 451.
Deno.test(
  'an empty non-country file fails and keeps every stored record',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const processing = await source(db, PROCESSING_PAGE);
      const pages = processingPages();
      await ingestSource(
        processing,
        deps(db, { at: '2026-10-23T12:00:00Z', pages })
      );
      const before = await chunksOf(db, PROCESSING_PAGE);
      const hashBefore = (await documentOf(db, PROCESSING_PAGE)).content_hash;
      pages[JSON_BASE + 'data-ptime-non-country-en.json'] = '{}';

      const result = await ingestSource(
        processing,
        deps(db, { at: '2026-10-24T12:00:00Z', pages })
      );

      assertEquals(result.status, 'error');
      assertEquals(
        result.error,
        'Processing times: no visitor_inside_canada group'
      );
      assertEquals(before.length, 1950);
      assertEquals(await chunksOf(db, PROCESSING_PAGE), before);
      assertEquals(
        (await documentOf(db, PROCESSING_PAGE)).content_hash,
        hashBefore
      );
      assertEquals(
        await rows(
          db,
          `select status, error_message from public.crawl_logs order by id desc limit 1`
        ),
        [
          {
            status: 'error',
            error_message: 'Processing times: no visitor_inside_canada group',
          },
        ]
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: an empty required country group removes its records while the
// remaining groups still produce a successful partial replacement.
Deno.test(
  'an empty required country group preserves all stored records',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const processing = await source(db, PROCESSING_PAGE);
      const pages = processingPages();
      assertEquals(
        (
          await ingestSource(
            processing,
            deps(db, { at: '2026-10-24T00:00:00Z', pages })
          )
        ).status,
        'success'
      );
      const before = await chunksOf(db, PROCESSING_PAGE);
      const beforeDocument = await documentOf(db, PROCESSING_PAGE);
      const country = JSON.parse(pages[JSON_BASE + 'data-ptime-en.json']);
      country.work = {};
      pages[JSON_BASE + 'data-ptime-en.json'] = JSON.stringify(country);
      assertEquals(
        await ingestSource(
          processing,
          deps(db, { at: '2026-10-25T00:00:00Z', pages })
        ),
        {
          source_id: processing.id,
          status: 'error',
          error: 'Processing times: no country values in work section',
        }
      );
      assertEquals(before.length, 1950);
      assertEquals(await chunksOf(db, PROCESSING_PAGE), before);
      assertEquals(await documentOf(db, PROCESSING_PAGE), beforeDocument);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the reviewed converter drops the malformed #402 and the crawl
// replaces #401 and #400 with #400 alone.
Deno.test(
  'a malformed newest draw keeps the previous complete set',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ee = await source(db, EE_PAGE);
      await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-22T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(401), draw(400)] }),
        })
      );

      const result = await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-23T00:00:00Z',
          pages: JSON.stringify({
            rounds: [{ ...draw(402), drawSize: null }, draw(400)],
          }),
        })
      );

      assertEquals(result, {
        source_id: ee.id,
        status: 'error',
        error: 'Express Entry rounds: malformed draw 402',
      });
      await assertOneGeneration(db, EE_PAGE, [drawText(401), drawText(400)]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the reviewed converter accepts any nonempty text, so the crawl
// replaces the complete set with "NaN invitations" or "minimum CRS NaN" and
// advances the document dates.
for (const [field, bad] of [
  ['drawSize', 'NaN'],
  ['drawSize', '-1,000'],
  ['drawSize', '1,00'],
  ['drawCRS', 'NaN'],
  ['drawCRS', '-500'],
  ['drawCRS', '5e2'],
] as const) {
  Deno.test(
    `a malformed newest ${field} (${bad}) keeps the previous complete set and dates`,
    async () => {
      const db = await openQwenIngestDb();
      try {
        const ee = await source(db, EE_PAGE);
        await ingestSource(
          ee,
          deps(db, {
            at: '2026-10-22T00:00:00Z',
            pages: JSON.stringify({ rounds: [draw(401), draw(400)] }),
          })
        );
        const chunks = await chunksOf(db, EE_PAGE);
        const document = await documentOf(db, EE_PAGE);

        const result = await ingestSource(
          ee,
          deps(db, {
            at: '2026-10-23T00:00:00Z',
            pages: JSON.stringify({
              rounds: [
                { ...draw(402, '2026-10-21'), [field]: bad },
                draw(401),
                draw(400),
              ],
            }),
          })
        );

        assertEquals(result, {
          source_id: ee.id,
          status: 'error',
          error: 'Express Entry rounds: malformed draw 402',
        });
        await assertOneGeneration(db, EE_PAGE, [drawText(401), drawText(400)]);
        assertEquals(await chunksOf(db, EE_PAGE), chunks);
        assertEquals(await documentOf(db, EE_PAGE), document);
        assertEquals(await leftovers(db), { leases: 0, staged: 0 });
      } finally {
        await db.close();
      }
    }
  );
}

// Falsifier: a pattern that rejects the official comma-grouped count would
// turn this valid refresh into an error.
Deno.test(
  'a valid comma-grouped count and CRS still replace the set',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ee = await source(db, EE_PAGE);
      await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-22T00:00:00Z',
          pages: JSON.stringify({ rounds: [draw(401), draw(400)] }),
        })
      );

      const result = await ingestSource(
        ee,
        deps(db, {
          at: '2026-10-23T00:00:00Z',
          pages: JSON.stringify({
            rounds: [draw(402, '2026-10-21', '12,345'), draw(401), draw(400)],
          }),
        })
      );

      assertEquals(result.status, 'success');
      const texts = (await chunksOf(db, EE_PAGE)).map(c => c.chunk_text);
      assertEquals(texts.length, 3);
      assertEquals(
        texts[0],
        'Express Entry draw #402 on October 21, 2026: Canadian Experience Class, 12,345 invitations, minimum CRS 500.'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the reviewed ingestion turns the valid empty window into "No
// records in the source" and keeps the expired September 24 item searchable.
Deno.test(
  'a valid empty news window removes the expired item from retrieval',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const news = await source(db, NEWS_PAGE);
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
      const search = (args: string) =>
        rows<{ chunk_text: string }>(
          db,
          `select chunk_text from public.match_chunks(${args})`,
          [embedding(0.5)]
        );
      assertEquals(
        (
          await ingestSource(
            news,
            deps(db, { at: '2026-10-23T00:00:00Z', pages: feed })
          )
        ).status,
        'success'
      );
      // Point the stored vector at the query, so only the window decides.
      await db.exec(
        `update public.knowledge_chunks set embedding = '${embedding(0.5)}'`
      );
      assertEquals(
        (await search(`$1::vector, 0.1, 10, null, '${QWEN}'`)).length,
        1
      );

      const result = await ingestSource(
        news,
        deps(db, { at: '2026-10-25T00:00:00Z', pages: feed })
      );

      assertEquals(result, {
        source_id: news.id,
        status: 'success',
        chunks_created: 0,
      });
      assertEquals(await chunksOf(db, NEWS_PAGE), []);
      assertEquals(await search(`$1::vector, 0.1, 10, null, '${QWEN}'`), []);
      assertEquals(
        await search(`$1::vector, 0.1, 10, 'Ontario', '${QWEN}'`),
        []
      );
      const doc = await documentOf(db, NEWS_PAGE);
      assertEquals(
        [doc.fetched_at, doc.published_at, doc.chunk_count],
        ['2026-10-25T00:00:00.000Z', '2026-10-25', 0]
      );

      // A broken response is not an empty window: the stored state stays.
      assertEquals(
        (
          await ingestSource(
            news,
            deps(db, { at: '2026-10-26T00:00:00Z', pages: '{"feed":{}}' })
          )
        ).status,
        'error'
      );
      assertEquals(
        (await documentOf(db, NEWS_PAGE)).fetched_at,
        '2026-10-25T00:00:00.000Z'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a second valid empty window fails metadata refresh instead of
// advancing the source metadata while retrieval stays empty.
Deno.test('repeated valid empty news windows refresh metadata', async () => {
  const db = await openQwenIngestDb();
  try {
    const news = await source(db, NEWS_PAGE);
    const feed = JSON.stringify({
      feed: {
        entry: [{ publishedDate: '2026-09-01', title: 'Expired policy' }],
      },
    });
    assertEquals(
      await ingestSource(
        news,
        deps(db, { at: '2026-10-24T00:00:00Z', pages: feed })
      ),
      { source_id: news.id, status: 'success', chunks_created: 0 }
    );
    assertEquals(
      await ingestSource(
        news,
        deps(db, { at: '2026-10-25T00:00:00Z', pages: feed })
      ),
      { source_id: news.id, status: 'skipped' }
    );
    assertEquals(
      (await documentOf(db, NEWS_PAGE)).fetched_at,
      '2026-10-25T00:00:00.000Z'
    );
    assertEquals(
      await rows(
        db,
        `select chunk_text from public.match_chunks($1::vector, 0.1, 10)`,
        [embedding(0.5)]
      ),
      []
    );
    assertEquals(await leftovers(db), { leases: 0, staged: 0 });
  } finally {
    await db.close();
  }
});

// Falsifier: the reviewed parser gives the OINP page the fetch date.
Deno.test(
  'the Ontario page keeps its own update date in the database',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const ontario = (
        await createStore(supabaseHttp(db).client).listCrawlSources()
      ).find(s => s.province === 'Ontario')!;
      const html = Deno.readTextFileSync(
        new URL(
          '../functions/ingest-documents/lib/fixtures/ontario_oinp_dates.html',
          import.meta.url
        )
      ).replace(
        '</script>',
        `</script><main><p>${'The Ontario Immigrant Nominee Program nominates skilled workers for permanent residence. '.repeat(40)}</p></main>`
      );

      for (const at of ['2026-10-24T00:00:00Z', '2026-10-25T00:00:00Z']) {
        await ingestSource(ontario, deps(db, { at, pages: html }));
        const chunks = await chunksOf(db, ontario.url);
        assert(chunks.length > 0);
        assert(
          chunks.every(c => c.published_at === '2026-10-20'),
          at
        );
        assertEquals(
          (await documentOf(db, ontario.url)).published_at,
          '2026-10-20'
        );
      }
    } finally {
      await db.close();
    }
  }
);
