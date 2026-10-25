// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// When a source's attempt time is written. The real ingest store (createStore)
// runs against the real schema in a local Postgres; only the HTTP hop of
// supabase-js is replaced (support/supabaseHttp.ts).
//
// These tests suspend a call inside its external fetch and read the database
// at that moment. They prove the stamp is stored before the fetch starts, so a
// call that never returns leaves the source behind the others in the due
// queue. They do not stop a hosted worker, and they do not measure hosted
// request time.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EMBEDDING_MODEL } from '../functions/_shared/embeddings.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import type { CrawlSource } from '../functions/ingest-documents/lib/pickDueSources.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import type { IngestDeps } from '../functions/ingest-documents/lib/types.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const PAGE =
  '<main><p>' +
  'Official Canadian immigration information and eligibility conditions. '.repeat(
    20
  ) +
  '</p></main>';
const VECTOR = new Array(1536).fill(0.01);

async function firstHtmlSource(db: Db) {
  const store = createStore(supabaseHttp(db).client);
  const found = (await store.listCrawlSources())
    .filter(s => s.source_kind === 'html')
    .sort((a, b) => a.id - b.id)[0];
  assert(found);
  return { store, source: found as CrawlSource };
}

async function stamp(db: Db, id: number): Promise<string | null> {
  const [row] = await rows<{ at: string | null }>(
    db,
    `select to_char(last_crawled_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
       from public.crawl_sources where id = $1`,
    [id]
  );
  return row.at;
}

function depsFor(
  store: IngestDeps['store'],
  at: string,
  fetchPage: IngestDeps['fetchPage']
): IngestDeps {
  return {
    store,
    now: () => new Date(at),
    fetchPage,
    embed: texts => Promise.resolve(texts.map(() => VECTOR)),
  };
}

// Falsifier: a stamp written only after the crawl is still null here, so a
// worker that stops inside the fetch leaves the source first in the due queue.
Deno.test(
  'a claimed attempt is stored before the external fetch ends',
  async () => {
    const db = await openQwenIngestDb();
    let release: (() => void) | undefined;
    let run: Promise<unknown> | undefined;
    try {
      const { store, source } = await firstHtmlSource(db);
      let entered!: () => void;
      const started = new Promise<void>(resolve => {
        entered = resolve;
      });
      const blocked = new Promise<string>(resolve => {
        release = () => resolve(PAGE);
      });
      run = ingestSource(
        source,
        depsFor(store, '2026-10-24T12:00:00.000Z', () => {
          entered();
          return blocked;
        })
      );
      await started;

      assertEquals(await stamp(db, source.id), '2026-10-24T12:00:00Z');
      // The stalled call still holds its claim, so another call skips the source.
      assertEquals(
        await store.claimSource(source.id, 300, EMBEDDING_MODEL),
        null
      );

      release!();
      await run;
      assertEquals(await stamp(db, source.id), '2026-10-24T12:00:00Z');
    } finally {
      release?.();
      await run?.catch(() => {});
      await db.close();
    }
  }
);

// Falsifier: ignoring a failed stamp starts the crawl anyway; skipping the
// cleanup leaves the claim in place until it expires.
Deno.test(
  'a failed stamp stops the call before any fetch and frees the claim',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const { store, source } = await firstHtmlSource(db);
      let fetches = 0;
      const failing = {
        ...store,
        recordAttempt: () => Promise.reject(new Error('database unavailable')),
      } as IngestDeps['store'];

      await assertRejects(
        () =>
          ingestSource(
            source,
            depsFor(failing, '2026-10-24T12:00:00.000Z', () => {
              fetches += 1;
              return Promise.resolve(PAGE);
            })
          ),
        Error,
        'database unavailable'
      );

      assertEquals(fetches, 0);
      assertEquals(await stamp(db, source.id), null);
      const token = await store.claimSource(source.id, 300, EMBEDDING_MODEL);
      assert(token !== null, 'the failed call must release its claim');
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a busy skip that stamps would hide the other call's own time, and
// one that fetches would run a second crawl of the same source.
Deno.test(
  'a busy skip keeps the stamp of the call that owns the source',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const { store, source } = await firstHtmlSource(db);
      const owner = await store.claimSource(source.id, 300, EMBEDDING_MODEL);
      assert(owner !== null);
      await store.recordAttempt(source.id, '2026-10-24T11:00:00.000Z');
      let fetches = 0;

      const result = await ingestSource(
        source,
        depsFor(store, '2026-10-24T12:00:00.000Z', () => {
          fetches += 1;
          return Promise.resolve(PAGE);
        })
      );

      assertEquals(result.status, 'skipped');
      assertEquals(fetches, 0);
      assertEquals(await stamp(db, source.id), '2026-10-24T11:00:00Z');
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a plain overwrite lets a call with an earlier clock move the
// stamp back, which puts a recently attempted source back in the due queue.
Deno.test('an older attempt never moves the stamp backwards', async () => {
  const db = await openQwenIngestDb();
  try {
    const { store, source } = await firstHtmlSource(db);
    await store.recordAttempt(source.id, '2026-10-24T13:00:00.000Z');

    const result = await ingestSource(
      source,
      depsFor(store, '2026-10-24T12:00:00.000Z', () => Promise.resolve(PAGE))
    );

    assertEquals(result.status, 'success');
    assertEquals(await stamp(db, source.id), '2026-10-24T13:00:00Z');
  } finally {
    await db.close();
  }
});
