// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// ingest_generation_reserve on the real migrations (PGlite). What this proves:
// each provider attempt is recorded and debited once before its rows are
// returned; a repeated request id returns the same reservation without a new
// debit; the per-job cap is a durable terminal error; and only the live owner
// of an unchanged, compatible source can reserve.
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { LEGACY } from './support/embeddingModels.ts';
import {
  chunkRows,
  claim,
  configOf,
  crawlLogs,
  open,
  replaceOwner,
  reserve,
  sourceId,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

async function openJob(db: Db, count: number) {
  const id = await sourceId(db, 'html');
  const token = await claim(db, id);
  const job = await open(db, {
    source: id,
    token,
    config: await configOf(db, id),
    rows: chunkRows(count),
  });
  return { id, token, job: job.job_id as string };
}

async function reservations(db: Db, job: string) {
  return await rows<{ outcome: string; chunk_indexes: number[]; issuer_token: string }>(
    db,
    `select outcome, chunk_indexes, issuer_token::text as issuer_token
       from public.knowledge_generation_reservations where job_id = $1
      order by created_at`,
    [job]
  );
}

// Falsifier: an aggregate counter with no reservation record, a batch over 20,
// or rows that are not the lowest missing indexes.
Deno.test(
  'a reservation records the exact lowest 20 missing rows and debits once',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const { token, job } = await openJob(db, 45);
      const request = crypto.randomUUID();
      const result = await reserve(db, { request, job, token });

      assertEquals(result.reservation_outcome, 'reserved');
      assertEquals(result.request_id, request);
      assertEquals(result.reserved, 1);
      assertEquals(result.cap, 11);
      assertEquals(
        result.rows.map(r => r.chunk_index),
        Array.from({ length: 20 }, (_, i) => i)
      );
      assertEquals(
        result.rows[3].chunk_text,
        'Processing time for permit a-3: 4 weeks.'
      );
      assertEquals(String(result.rows[3].text_sha256).length, 64);
      assertEquals(await reservations(db, job), [
        {
          outcome: 'reserved',
          chunk_indexes: Array.from({ length: 20 }, (_, i) => i),
          issuer_token: token,
        },
      ]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a retry after a lost response debits again or returns other rows.
Deno.test('a repeated request id returns the same reservation without a debit', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job } = await openJob(db, 5);
    const request = crypto.randomUUID();
    const first = await reserve(db, { request, job, token });
    const again = await reserve(db, { request, job, token });

    assertEquals(again.replayed, true);
    assertEquals(again.reserved, 1);
    assertEquals(again.rows, first.rows);
    assertEquals((await reservations(db, job)).length, 1);
  } finally {
    await db.close();
  }
});

// Falsifier: a new reservation leaves the previous unsent one stageable, or
// reuses its debit.
Deno.test('a new reservation abandons the earlier unstaged one and debits again', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job } = await openJob(db, 5);
    await reserve(db, { job, token });
    const second = await reserve(db, { job, token });

    assertEquals(second.reserved, 2);
    assertEquals(
      (await reservations(db, job)).map(r => r.outcome),
      ['abandoned', 'reserved']
    );
  } finally {
    await db.close();
  }
});

// Falsifier: the cap is not enforced, is enforced on the client only, or
// leaves the job open with rows that could still be sent.
Deno.test(
  'the 2 * ceil(n / 20) + 5 cap is a durable terminal error with one log row',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const { id, token, job } = await openJob(db, 1);
      for (let i = 1; i <= 7; i++) {
        const r = await reserve(db, { job, token });
        assertEquals(r.reserved, i);
        assertEquals(r.reservation_outcome, 'reserved');
      }
      const over = await reserve(db, { job, token });
      assertEquals(over.status, 'failed');
      assertEquals(over.terminal_reason, 'request_cap');
      assertEquals(over.rows, []);
      assertEquals(over.reserved, 7);
      const later = await reserve(db, { job, token });
      assertEquals(later.status, 'failed');
      assertEquals(later.rows, []);
      assertEquals(
        await rows(db, `select 1 from public.knowledge_generation_rows where job_id = $1`, [job]),
        []
      );
      assertEquals(await reservations(db, job), []);
      assertEquals(await crawlLogs(db, id), [
        {
          status: 'error',
          error_message: 'Embedding request cap reached',
          chunks_created: 0,
          content_changed: false,
        },
      ]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: an expired, replaced or forged owner can reserve, or a paused or
// mismatched writer can.
Deno.test('only the live owner of a compatible job can reserve', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job } = await openJob(db, 3);
    await assertRejects(
      () => reserve(db, { job, token: crypto.randomUUID() }),
      Error,
      'Crawl source lease lost'
    );
    await assertRejects(
      () => reserve(db, { job, token, model: LEGACY }),
      Error,
      'Embedding model is not the serving model'
    );
    await db.query(`update public.knowledge_embedding_cutover set writers_paused = true`);
    await assertRejects(() => reserve(db, { job, token }), Error, 'Knowledge writes are paused');
    await db.query(`update public.knowledge_embedding_cutover set writers_paused = false`);
    const next = await replaceOwner(db, id);
    await assertRejects(() => reserve(db, { job, token }), Error, 'Crawl source lease lost');
    const fresh = await reserve(db, { job, token: next });
    assertEquals(fresh.reserved, 1, 'the job survives the lease replacement');
  } finally {
    await db.close();
  }
});

// Falsifier: a source whose configuration changed after the fetch keeps
// receiving work for the old input.
Deno.test('a changed source configuration closes the job at reserve', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job } = await openJob(db, 3);
    await db.query(`update public.crawl_sources set province = 'Ontario' where id = $1`, [id]);
    const result = await reserve(db, { job, token });

    assertEquals(result.status, 'failed');
    assertEquals(result.terminal_reason, 'configuration_changed');
    assertEquals(result.rows, []);
    assertEquals(result.reserved, 0);
    assertEquals(await reservations(db, job), []);
    assertEquals((await crawlLogs(db, id)).map(l => l.error_message), [
      'Source configuration changed',
    ]);
  } finally {
    await db.close();
  }
});
