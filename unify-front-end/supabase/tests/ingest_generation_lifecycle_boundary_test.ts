// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Job lifecycle at the public handler with the real store over the emulated
// HTTP hop, the real migrations (PGlite) and a manual clock: a contract
// failure is terminal, the per-job request cap is reached across calls, a
// paused compatible job stays inert until writers resume, and a stale snapshot
// is fetched again (equal text keeps its vectors; changed text supersedes).
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
import { openQwenIngestDb } from './support/ingestDb.ts';
import { QWEN, seedChunk } from './support/embeddingModels.ts';
import { crawlLogs, live, unitVector } from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const KEY = 'test-service-role-key';

type Provider = (texts: string[]) => 'ok' | 'http' | 'contract';

async function source(db: Db) {
  const [row] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  return row;
}

async function call(
  db: Db,
  sourceId: number,
  o: { at: string; body: string; provider?: Provider; batchMs?: number }
) {
  const clock = new ManualClock();
  const sent: string[][] = [];
  const res = await handleIngestRequest(
    new Request('https://example.test/ingest-documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ crawl_source_id: sourceId }),
    }),
    {
      store: createStore(supabaseHttp(db).client),
      now: () => new Date(o.at),
      timers: clock,
      fetchPage: () => Promise.resolve(o.body),
      embedChecked: async (texts, options) => {
        sent.push(texts);
        await Promise.resolve();
        clock.advance(o.batchMs ?? 1000);
        if (options?.signal?.aborted) {
          throw new EmbeddingError('network', 'Embedding request did not complete');
        }
        const answer = o.provider?.(texts) ?? 'ok';
        if (answer === 'http') {
          throw new EmbeddingError('http', 'Embedding request failed with HTTP 503', 503);
        }
        if (answer === 'contract') {
          throw new EmbeddingError(
            'response',
            'Invalid embedding response: the model identity is not accepted'
          );
        }
        return { vectors: texts.map(() => unitVector()), receipt: receipt(texts.length) };
      },
      serviceRoleKey: KEY,
    }
  );
  const body = await res.json();
  return { result: body.results[0] as Record<string, unknown>, sent, body };
}

async function jobRows(db: Db) {
  return await rows<{ status: string; terminal_reason: string | null }>(
    db,
    `select status, terminal_reason from public.knowledge_generation_jobs order by created_at`
  );
}

// Falsifier: a provider answer that breaks the contract leaves the job open,
// so the same input is sent again until the cap, or is logged twice or not at
// all; or the old document changes.
Deno.test('a contract failure closes the job with one log row and keeps the document', async () => {
  const db = await openQwenIngestDb();
  try {
    const s = await source(db);
    await seedChunk(db, { url: s.url, text: 'Previous text.', model: QWEN });
    const before = await live(db, s.url);
    const { result, sent } = await call(db, s.id, {
      at: '2026-10-25T00:00:00.000Z',
      body: page(prose(3_000, 'contract')),
      provider: () => 'contract',
    });
    assertEquals(result, {
      source_id: s.id,
      status: 'error',
      error: 'Invalid embedding response: the model identity is not accepted',
    });
    assertEquals(sent.length, 1);
    assertEquals(await jobRows(db), [{ status: 'failed', terminal_reason: 'contract_rejected' }]);
    assertEquals(
      await rows(db, `select 1 from public.knowledge_generation_rows`),
      []
    );
    assertEquals(await live(db, s.url), before);
    assertEquals((await crawlLogs(db, s.id)).map(l => [l.status, l.error_message]), [
      ['error', 'Invalid embedding response: the model identity is not accepted'],
    ]);
  } finally {
    await db.close();
  }
});

// Falsifier: a provider that always fails is retried without bound across
// calls; the cap must stop the job durably.
Deno.test('the per-job cap stops a job that keeps failing across calls', async () => {
  const db = await openQwenIngestDb();
  try {
    const s = await source(db);
    const body = page(prose(3_000, 'cap')); // one batch: cap 2 * 1 + 5 = 7
    let sends = 0;
    for (let hour = 0; hour < 7; hour++) {
      const { result, sent } = await call(db, s.id, {
        at: `2026-10-25T0${hour}:00:00.000Z`,
        body,
        provider: () => 'http',
      });
      sends += sent.length;
      assertEquals([result.status, result.stop_reason], ['pending', 'provider_error']);
    }
    assertEquals(sends, 7);
    const { result, sent } = await call(db, s.id, {
      at: '2026-10-25T07:00:00.000Z',
      body,
      provider: () => 'http',
    });
    assertEquals(sent, [], 'a request was sent past the cap');
    assertEquals(result, {
      source_id: s.id,
      status: 'error',
      error: 'Embedding request cap reached',
    });
    assertEquals(await jobRows(db), [{ status: 'failed', terminal_reason: 'request_cap' }]);
    assertEquals((await crawlLogs(db, s.id)).map(l => l.error_message), [
      'Embedding request cap reached',
    ]);
  } finally {
    await db.close();
  }
});

// Falsifier: a paused writer still works on its job, or the job is lost by
// the pause and starts over after resume.
Deno.test('a paused compatible job stays inert and resumes after writers resume', async () => {
  const db = await openQwenIngestDb();
  try {
    const s = await source(db);
    const body = page(prose(90_000, 'pause'));
    let calls = 0;
    const first = await call(db, s.id, {
      at: '2026-10-25T00:00:00.000Z',
      body,
      // The first batch is checked; the second fails, leaving the job open.
      provider: () => (calls++ > 0 ? 'http' : 'ok'),
    });
    assertEquals([first.result.status, first.result.staged], ['pending', 20]);

    await db.query(`update public.knowledge_embedding_cutover set writers_paused = true`);
    const paused = await call(db, s.id, { at: '2026-10-25T01:00:00.000Z', body });
    assertEquals(paused.result, {
      source_id: s.id,
      status: 'skipped',
      error: 'Another call is refreshing this source',
    });
    assertEquals(paused.sent, []);
    assertEquals(await jobRows(db), [{ status: 'open', terminal_reason: null }]);

    await db.query(`update public.knowledge_embedding_cutover set writers_paused = false`);
    const resumed = await call(db, s.id, { at: '2026-10-25T02:00:00.000Z', body });
    assertEquals(resumed.result.status, 'success');
    assertEquals(
      resumed.sent.flat().length,
      Number(resumed.result.chunks_created) - 20,
      'the staged rows were kept through the pause'
    );
  } finally {
    await db.close();
  }
});

// Falsifier: a snapshot older than the source frequency is published without
// a new fetch; or an equal re-fetch embeds again; or changed text keeps the
// old private rows.
Deno.test('a stale snapshot is fetched again: equal text keeps vectors, changed text supersedes', async () => {
  const db = await openQwenIngestDb();
  try {
    const s = await source(db);
    const [{ hours }] = await rows<{ hours: number }>(
      db,
      `select crawl_frequency_hours as hours from public.crawl_sources where id = $1`,
      [s.id]
    );
    const body = page(prose(90_000, 'stale'));
    let fails = 0;
    const once = await call(db, s.id, {
      at: '2026-10-01T00:00:00.000Z',
      body,
      provider: () => (fails++ > 0 ? 'http' : 'ok'),
    });
    assertEquals([once.result.status, once.result.staged], ['pending', 20]);

    // Past the frequency: a manual call fetches again instead of continuing.
    const later = new Date(Date.parse('2026-10-01T00:00:00.000Z') + (hours + 1) * 3_600_000);
    const equal = await call(db, s.id, { at: later.toISOString(), body });
    assertEquals(equal.result.status, 'success');
    assertEquals(equal.sent.flat().length, Number(equal.result.chunks_created) - 20);
    assertEquals(await jobRows(db), [{ status: 'promoted', terminal_reason: 'promoted' }]);
    const [{ fetched }] = await rows<{ fetched: string }>(
      db,
      `select metadata->>'fetched_at' as fetched from public.knowledge_documents where source_url = $1`,
      [s.url]
    );
    assertEquals(fetched, later.toISOString(), 'the newer fetch dates are published');

    // A second stale cycle with changed text supersedes the private work.
    fails = 0;
    const changedAt = new Date(later.getTime() + (hours + 1) * 3_600_000);
    const partial = await call(db, s.id, {
      at: changedAt.toISOString(),
      body: page(prose(90_000, 'changed-a')),
      provider: () => (fails++ > 0 ? 'http' : 'ok'),
    });
    assertEquals(partial.result.status, 'pending');
    const supersededAt = new Date(changedAt.getTime() + (hours + 1) * 3_600_000);
    const changed = await call(db, s.id, {
      at: supersededAt.toISOString(),
      body: page(prose(90_000, 'changed-b')),
    });
    assertEquals(changed.result.status, 'success');
    assertEquals(changed.sent.flat().length, Number(changed.result.chunks_created));
    assertEquals((await jobRows(db)).map(j => j.terminal_reason), [
      'promoted',
      'superseded',
      'promoted',
    ]);
    assert((await live(db, s.url)).chunks.every(c => String(c.chunk_text).includes('changed-b')));
  } finally {
    await db.close();
  }
});
