// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The unchanged-content refresh at the public handler: the real store over
// supabase-js, the real migrations (PGlite) and a manual clock. A source is
// published, then fetched again with the same text while one bound
// configuration field changes during the fetch. What this proves: the refresh
// compares the fetched configuration in the transaction that writes, so live
// content fetched under one configuration never takes dates or province from
// a run under another; and an unchanged refresh still runs when nothing
// changed. It does not prove hosted PostgREST.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.4';
import { Budget } from '../functions/ingest-documents/lib/budget.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { ingestSource, newProgress } from '../functions/ingest-documents/lib/ingest.ts';
import {
  createStore,
  type SupabaseLike,
} from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import {
  page,
  prose,
  receipt,
} from '../functions/ingest-documents/lib/testSupport.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { crawlLogs, live, unitVector } from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const KEY = 'test-service-role-key';
const PAGE = page(prose(6000, 'refresh'));

/** Every bound field of an HTML source, changed one at a time. */
const HTML_CHANGES: Array<[string, string]> = [
  ['url', `url = url || '?moved'`],
  ['data_urls', `data_urls = array['https://www.canada.ca/extra.json']`],
  [
    'source_kind',
    `source_kind = 'ircc_newsroom', data_urls = array['https://www.canada.ca/news.json']`,
  ],
  ['province', `province = 'Alberta'`],
  ['enabled', `enabled = false`],
  ['label', `label = coalesce(label, '') || ' changed'`],
  ['crawl_frequency_hours', `crawl_frequency_hours = crawl_frequency_hours + 1`],
];

async function htmlSource(db: Db) {
  const [row] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  return row;
}

async function invoke(
  db: Db,
  sourceId: number,
  o: {
    at: string;
    fetchPage?: () => Promise<string>;
    clock?: ManualClock;
    client?: SupabaseLike;
  }
) {
  const response = await handleIngestRequest(
    new Request('https://example.test/ingest-documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ crawl_source_id: sourceId }),
    }),
    {
      store: createStore(o.client ?? supabaseHttp(db).client),
      now: () => new Date(o.at),
      timers: o.clock ?? new ManualClock(),
      fetchPage: o.fetchPage ?? (() => Promise.resolve(PAGE)),
      embedChecked: texts =>
        Promise.resolve({
          vectors: texts.map(() => unitVector()),
          receipt: receipt(texts.length),
        }),
      serviceRoleKey: KEY,
    }
  );
  return (await response.json()) as {
    results: Array<Record<string, unknown>>;
  };
}

for (const [field, change] of HTML_CHANGES) {
  // Falsifier: the refresh writes the new fetch dates over content fetched
  // under the earlier configuration, or reports a refresh that did not run.
  Deno.test(
    `a ${field} change during the fetch blocks the unchanged refresh`,
    opts,
    async () => {
      const db = await openQwenIngestDb();
      try {
        const source = await htmlSource(db);
        const first = await invoke(db, source.id, { at: '2026-10-25T00:00:00.000Z' });
        assertEquals(first.results[0].status, 'success');
        const before = await live(db, source.url);

        const second = await invoke(db, source.id, {
          at: '2026-10-26T00:00:00.000Z',
          fetchPage: async () => {
            await db.query(`update public.crawl_sources set ${change} where id = $1`, [
              source.id,
            ]);
            return PAGE;
          },
        });

        assertEquals(await live(db, source.url), before, 'live content unchanged');
        assertEquals(second.results[0].status, 'error');
        const logs = await crawlLogs(db, source.id);
        assertEquals(logs.at(-1)?.status, 'error');
      } finally {
        await db.close();
      }
    }
  );
}

// Falsifier: the fix blocks every unchanged refresh, not only a changed one.
Deno.test('an unchanged source still refreshes its live dates', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    await invoke(db, source.id, { at: '2026-10-25T00:00:00.000Z' });
    const second = await invoke(db, source.id, { at: '2026-10-26T00:00:00.000Z' });

    assertEquals(second.results[0].status, 'skipped');
    const after = await live(db, source.url);
    assertEquals(
      (after.documents[0].metadata as Record<string, unknown>).fetched_at,
      '2026-10-26T00:00:00.000Z'
    );
    assertEquals(
      after.chunks.every(
        c => (c.metadata as Record<string, unknown>).fetched_at === '2026-10-26T00:00:00.000Z'
      ),
      true
    );
  } finally {
    await db.close();
  }
});

/** Calls the cleanup and status work that may still run after a deadline. */
const CLEANUP = ['release_crawl_source', 'crawl_logs', 'ingest_generation_status'];

/**
 * A supabase-js client that records each request's path and start time, and
 * lets the live document read take `readMs` of clock time.
 */
function timedClient(db: Db, clock: ManualClock, readMs: number) {
  const http = supabaseHttp(db);
  const calls: Array<{ path: string; at: number }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.split('/').at(-1)!;
    calls.push({ path, at: clock.now() });
    const reply = await http.fetch(input, init);
    if (path === 'knowledge_documents') clock.advance(readMs);
    return reply;
  };
  const client = createClient('https://local-emulation.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  return { client, calls };
}

// Falsifier: a document read that ends after 95 s is followed by a new live
// write, or the run reports a refresh that never ran.
Deno.test('no unchanged refresh starts after the work deadline', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    await invoke(db, source.id, { at: '2026-10-25T00:00:00.000Z' });
    const before = await live(db, source.url);
    const clock = new ManualClock();
    const { client, calls } = timedClient(db, clock, 6000);

    const second = await invoke(db, source.id, {
      at: '2026-10-26T00:00:00.000Z',
      clock,
      client,
      fetchPage: () => {
        clock.advance(90_000);
        return Promise.resolve(PAGE);
      },
    });

    const late = calls.filter(c => c.at >= 95_000 && !CLEANUP.includes(c.path));
    assertEquals(late, [], 'no new work after the work deadline');
    assertEquals(await live(db, source.url), before);
    assertEquals(second.results[0].status, 'error');
    assertEquals((await crawlLogs(db, source.id)).at(-1)?.status, 'error');
  } finally {
    await db.close();
  }
});

// Falsifier: the first of two sources keeps writing after its share of the
// work window ends, taking the second source's time.
Deno.test('no unchanged refresh starts after the source share ends', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    await invoke(db, source.id, { at: '2026-10-25T00:00:00.000Z' });
    const before = await live(db, source.url);
    const clock = new ManualClock();
    const { client, calls } = timedClient(db, clock, 9000);
    const store = createStore(client);
    const stored = (await store.getCrawlSource(source.id))!;
    calls.length = 0;
    const budget = new Budget(clock);
    const shareEndsAt = 47_500;

    const result = await ingestSource(
      stored,
      {
        store,
        now: () => new Date('2026-10-26T00:00:00.000Z'),
        timers: clock,
        fetchPage: () => {
          clock.advance(40_000);
          return Promise.resolve(PAGE);
        },
        embedChecked: () => Promise.reject(new Error('must not embed')),
      },
      { budget, shareEndsAt, sendLimit: 25, progress: newProgress(source.id) }
    );
    budget.dispose();

    const late = calls.filter(c => c.at >= shareEndsAt && !CLEANUP.includes(c.path));
    assertEquals(late, [], 'no new work after the source share');
    assertEquals(await live(db, source.url), before);
    assertEquals(result.status, 'error');
  } finally {
    await db.close();
  }
});
