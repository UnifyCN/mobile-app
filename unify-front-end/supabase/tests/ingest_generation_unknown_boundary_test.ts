// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Unknown database outcomes at the public handler: the real store over a
// supabase-js client whose chosen call commits in the database but whose
// answer is lost (support/lossyHttp.ts), on the real migrations, with a manual
// clock. What this proves: an unknown open, reserve, stage or promotion is
// read back before any new external work, reported as pending (or success
// once a promotion is found), never sends a lost reservation, never embeds a
// committed row again, and after the response backstop nothing is called. It
// does not prove hosted PostgREST or real connection loss.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.4';
import { EmbeddingError } from '../functions/_shared/embeddings.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import {
  page,
  prose,
  receipt,
} from '../functions/ingest-documents/lib/testSupport.ts';
import type { SupabaseLike } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { crawlLogs, live, unitVector } from './support/generationJobs.ts';
import { lossyHttp } from './support/lossyHttp.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };
const KEY = 'test-service-role-key';
/** About 50 chunks: three batches. */
const PAGE = page(prose(90_000, 'unknown'));

async function htmlSource(db: Db) {
  const [row] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  return row;
}

interface Invocation {
  sent: string[][];
  clock: ManualClock;
  body: Record<string, unknown> & { results: Array<Record<string, unknown>> };
}

/**
 * One manual call. `during` runs once the handler is waiting on a held call,
 * so the test can move the clock.
 */
async function invoke(
  db: Db,
  sourceId: number,
  o: { client?: SupabaseLike; held?: () => boolean; advance?: number; at?: string }
): Promise<Invocation> {
  const clock = new ManualClock();
  const sent: string[][] = [];
  const pending = handleIngestRequest(
    new Request('https://example.test/ingest-documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ crawl_source_id: sourceId }),
    }),
    {
      store: createStore(o.client ?? supabaseHttp(db).client),
      now: () => new Date(o.at ?? '2026-10-25T00:00:00.000Z'),
      timers: clock,
      fetchPage: () => Promise.resolve(PAGE),
      embedChecked: async (texts, options) => {
        sent.push(texts);
        await Promise.resolve();
        clock.advance(1000);
        if (options?.signal?.aborted) {
          throw new EmbeddingError('network', 'Embedding request did not complete');
        }
        return { vectors: texts.map(() => unitVector()), receipt: receipt(texts.length) };
      },
      serviceRoleKey: KEY,
    }
  );
  if (o.held) {
    while (!o.held()) await new Promise(r => setTimeout(r, 1));
    clock.advance(o.advance ?? 15_000);
  }
  const body = await (await pending).json();
  return { sent, clock, body };
}

async function jobs(db: Db) {
  return await rows<{ status: string; requests_reserved: number }>(
    db,
    `select status, requests_reserved from public.knowledge_generation_jobs order by created_at`
  );
}

// Falsifier: the lost stage answer is treated as nothing staged, so the next
// call embeds the committed rows again; or the result hides the uncertainty.
Deno.test('an unknown stage is read back and its rows are never embedded again', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    const lossy = lossyHttp(db, fn => fn === 'ingest_generation_stage', { times: 1 });
    const first = await invoke(db, source.id, {
      client: lossy.client,
      held: () => lossy.committed.length > 0,
    });
    const [result] = first.body.results;
    assertEquals(
      [result.status, result.stop_reason, result.unknown_outcome, result.staged, result.reserved],
      ['pending', 'unknown_outcome', true, 20, 1]
    );
    assertEquals(first.sent.length, 1, 'no new provider request after the unknown stage');

    const second = await invoke(db, source.id, { at: '2026-10-25T01:00:00.000Z' });
    const done = second.body.results[0];
    assertEquals(done.status, 'success');
    // The page repeats its sentences, so texts are not unique: count rows.
    assertEquals(
      second.sent.flat().length,
      Number(done.chunks_created) - 20,
      'a committed row was embedded again'
    );
    assertEquals((await crawlLogs(db, source.id)).map(l => l.status), ['success']);
  } finally {
    await db.close();
  }
});

// Falsifier: an unknown reservation is sent anyway (with no confirmed
// reservation), or sent again later.
Deno.test('an unknown reservation is never sent and its debit is kept', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    const lossy = lossyHttp(db, fn => fn === 'ingest_generation_reserve', { times: 1 });
    const first = await invoke(db, source.id, {
      client: lossy.client,
      held: () => lossy.committed.length > 0,
    });
    const [result] = first.body.results;
    assertEquals([result.status, result.unknown_outcome, result.reserved], ['pending', true, 1]);
    assertEquals(first.sent, [], 'a provider request was sent without a confirmed reservation');

    const second = await invoke(db, source.id, { at: '2026-10-25T01:00:00.000Z' });
    assertEquals(second.body.results[0].status, 'success');
    const [job] = await jobs(db);
    assertEquals(job.requests_reserved, second.sent.length + 1, 'the lost debit is kept');
  } finally {
    await db.close();
  }
});

// Falsifier: a lost open answer is retried as a new job, or provider work
// starts before the open is confirmed.
Deno.test('an unknown open is found by its operation id and makes one job', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    const lossy = lossyHttp(db, fn => fn === 'ingest_generation_open', { times: 1 });
    const first = await invoke(db, source.id, {
      client: lossy.client,
      held: () => lossy.committed.length > 0,
    });
    const [result] = first.body.results;
    assertEquals([result.status, result.unknown_outcome], ['pending', true]);
    assertEquals(typeof result.job_id, 'string');
    assertEquals(first.sent, []);

    const second = await invoke(db, source.id, { at: '2026-10-25T01:00:00.000Z' });
    assertEquals(second.body.results[0].status, 'success');
    assertEquals((await jobs(db)).length, 1);
  } finally {
    await db.close();
  }
});

// Falsifier: a lost promotion answer reports pending or error although the
// generation was published, or writes a second terminal log.
Deno.test('an unknown promotion that committed is reported as success', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    const lossy = lossyHttp(db, fn => fn === 'ingest_generation_promote', { times: 1 });
    const first = await invoke(db, source.id, {
      client: lossy.client,
      held: () => lossy.committed.length > 0,
    });
    const [result] = first.body.results;
    assertEquals(result.status, 'success');
    assert(Number(result.chunks_created) > 40);
    assertEquals((await crawlLogs(db, source.id)).map(l => l.status), ['success']);
    assertEquals((await live(db, source.url)).chunks.length, result.chunks_created);
  } finally {
    await db.close();
  }
});

// Falsifier: after the response backstop the work in flight goes on to stage,
// reserve, release or log once its hung call returns.
Deno.test('after the backstop a returning call starts nothing', opts, async () => {
  const db = await openQwenIngestDb();
  try {
    const source = await htmlSource(db);
    const lossy = lossyHttp(db, fn => fn === 'ingest_generation_stage', {
      times: 1,
      ignoreAbort: true,
    });
    const first = await invoke(db, source.id, {
      client: lossy.client,
      held: () => lossy.committed.length > 0,
      advance: 110_000,
    });
    const [result] = first.body.results;
    assertEquals(
      [result.status, result.stop_reason, result.unknown_outcome, result.staged],
      ['pending', 'response_backstop', true, null]
    );
    const before = lossy.requests.length;
    lossy.release();
    await new Promise(r => setTimeout(r, 50));
    assertEquals(lossy.requests.slice(before), [], 'a call started after the backstop');
    assertEquals(first.sent.length, 1);
    assertEquals(await crawlLogs(db, source.id), []);
    // The lease was not released; it runs out on its own.
    assertEquals(
      (await rows(db, `select count(*)::int as n from public.crawl_source_leases`))[0],
      { n: 1 }
    );
  } finally {
    await db.close();
  }
});

/**
 * A client whose first open is answered 504 without reaching the database.
 * With `commitBeforeRelease` the saved open runs when the lease release
 * arrives: after the status read found nothing, and before the release.
 */
function gatewayOpen(db: Db, commitBeforeRelease: boolean) {
  const http = supabaseHttp(db);
  let saved: (() => Promise<Response>) | undefined;
  const late: number[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/rpc/ingest_generation_open') && !saved) {
      saved = () => http.fetch(input, { ...init, signal: undefined });
      return new Response(JSON.stringify({ message: 'Gateway timeout' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.endsWith('/rpc/release_crawl_source') && saved && commitBeforeRelease) {
      const open = saved;
      saved = () => Promise.reject(new Error('already run'));
      commitBeforeRelease = false;
      late.push((await open()).status);
    }
    return await http.fetch(input, init);
  };
  const client = createClient('https://local-emulation.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  return { client, late };
}

for (const visible of [true, false]) {
  // Falsifier: an open whose outcome is unknown, and that the status read does
  // not find yet, is reported as a terminal error, loses its operation id, or
  // writes a terminal crawl log; or a provider request is sent before the
  // outcome is known.
  Deno.test(
    `an unknown open not found by status stays pending (${visible ? 'commits later' : 'never commits'})`,
    opts,
    async () => {
      const db = await openQwenIngestDb();
      try {
        const source = await htmlSource(db);
        const gateway = gatewayOpen(db, visible);
        const first = await invoke(db, source.id, { client: gateway.client });
        const [result] = first.body.results;

        assertEquals(gateway.late, visible ? [200] : []);
        assertEquals(
          [
            result.status,
            result.stop_reason,
            result.unknown_outcome,
            result.job_id,
            result.staged,
            result.remaining,
            result.reserved,
          ],
          ['pending', 'unknown_outcome', true, null, null, null, null]
        );
        assert(typeof result.operation_id === 'string');
        assertEquals(first.sent.length, 0, 'no provider request while unresolved');
        assertEquals(await crawlLogs(db, source.id), [], 'no terminal event');
        const opened = await rows<{ operation_ids: string[]; status: string }>(
          db,
          `select operation_ids::text[] as operation_ids, status
             from public.knowledge_generation_jobs`
        );
        assertEquals(
          opened,
          visible ? [{ operation_ids: [result.operation_id as string], status: 'open' }] : []
        );

        // The next call reconciles: it continues the committed job, or opens
        // a new one; either way one generation is published.
        const second = await invoke(db, source.id, { at: '2026-10-25T01:00:00.000Z' });
        assertEquals(second.body.results[0].status, 'success');
        const promoted = await rows<{ operation_ids: string[] }>(
          db,
          `select operation_ids::text[] as operation_ids
             from public.knowledge_generation_jobs where status = 'promoted'`
        );
        assertEquals(promoted.length, 1);
        assertEquals(
          promoted[0].operation_ids.includes(result.operation_id as string),
          visible
        );
        assertEquals((await crawlLogs(db, source.id)).map(l => l.status), ['success']);
      } finally {
        await db.close();
      }
    }
  );
}
