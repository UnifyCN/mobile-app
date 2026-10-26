// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// ingest_generation_stage on the real migrations (PGlite). What this proves: a
// vector is stored only for the exact rows of a confirmed reservation, by the
// owner that reserved them while its lease is live, with a receipt that
// matches the batch; repeats are no-ops and conflicts fail; and an equal
// re-fetch keeps checked vectors.
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import {
  call,
  chunkRows,
  claim,
  configOf,
  open,
  RECEIPT,
  replaceOwner,
  reserve,
  sourceId,
  stage,
  stageAll,
  stageRows,
  unitVector,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

async function setup(db: Db, count = 3) {
  const id = await sourceId(db, 'html');
  const token = await claim(db, id);
  const config = await configOf(db, id);
  const opened = await open(db, { source: id, token, config, rows: chunkRows(count) });
  const job = opened.job_id as string;
  const reserved = await reserve(db, { job, token });
  return { id, token, config, job, reserved };
}

async function stagedIndexes(db: Db, job: string) {
  return (
    await rows<{ chunk_index: number }>(
      db,
      `select chunk_index from public.knowledge_generation_rows
        where job_id = $1 and embedding is not null order by chunk_index`,
      [job]
    )
  ).map(r => r.chunk_index);
}

// Falsifier: a stage without a reservation id, or one that does not record
// which attempt supplied the rows.
Deno.test('a stage stores the reserved rows and closes their reservation', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job, reserved } = await setup(db);
    const result = await stage(db, {
      request: reserved.request_id,
      job,
      token,
      rows: stageRows(reserved.rows),
    });
    assertEquals(result.staged_now, 3);
    assertEquals(result.staged, 3);
    assertEquals(result.remaining, 0);
    assertEquals(await stagedIndexes(db, job), [0, 1, 2]);
    const [r] = await rows<{ outcome: string }>(
      db,
      `select outcome from public.knowledge_generation_reservations where request_id = $1`,
      [reserved.request_id]
    );
    assertEquals(r.outcome, 'staged');
    // Complete: no further reservation and no debit.
    const after = await reserve(db, { job, token });
    assertEquals(after.rows, []);
    assertEquals(after.reserved, 1);
  } finally {
    await db.close();
  }
});

// Falsifier: an unknown stage outcome cannot be retried, or a retry with other
// vectors overwrites the stored ones.
Deno.test('an identical repeat is a no-op and a different vector fails', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job, reserved } = await setup(db);
    const payload = stageRows(reserved.rows);
    await stage(db, { request: reserved.request_id, job, token, rows: payload });
    const again = await stage(db, { request: reserved.request_id, job, token, rows: payload });
    assertEquals(again.replayed, true);
    assertEquals(again.staged_now, 0);
    await assertRejects(
      () =>
        stage(db, {
          request: reserved.request_id,
          job,
          token,
          rows: stageRows(reserved.rows, () => unitVector(0.8)),
        }),
      Error,
      'A chunk already has a different vector'
    );
  } finally {
    await db.close();
  }
});

// Falsifier: a partial batch, an extra row or a changed text hash is staged.
Deno.test('a stage must carry exactly the reserved rows and hashes', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job, reserved } = await setup(db, 4);
    const full = stageRows(reserved.rows);
    const wrongHash = full.map((r, i) => (i === 1 ? { ...r, text_sha256: 'f'.repeat(64) } : r));
    const otherIndex = full.map((r, i) => (i === 1 ? { ...r, chunk_index: 9 } : r));
    for (const [name, bad] of [
      ['missing row', full.slice(1)],
      ['changed hash', wrongHash],
      ['unreserved index', otherIndex],
      ['repeated row', [...full.slice(0, 3), full[0]]],
    ] as const) {
      await assertRejects(
        () =>
          stage(db, {
            request: reserved.request_id,
            job,
            token,
            rows: [...bad],
            receipt: { ...RECEIPT, checked: bad.length },
          }),
        Error,
        'Stage exactly the reserved rows and hashes',
        name
      );
    }
    await assertRejects(
      () =>
        stage(db, {
          request: reserved.request_id,
          job,
          token,
          rows: stageRows(reserved.rows, () => new Array(1536).fill(0)),
        }),
      Error,
      'Every vector needs non-zero coordinates'
    );
    assertEquals(await stagedIndexes(db, job), []);
  } finally {
    await db.close();
  }
});

// Falsifier: a vector arrives without the adapter's checked receipt, or with
// a receipt for another model, contract, identity, count or dimension.
Deno.test('a stage needs a receipt that matches the batch', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job, reserved } = await setup(db);
    const payload = stageRows(reserved.rows);
    for (const receipt of [
      { ...RECEIPT, checked: 3, model: 'openai/text-embedding-3-small' },
      { ...RECEIPT, checked: 3, contract: 'other' },
      { ...RECEIPT, checked: 3, identity: 'unrecognized_string' },
      { ...RECEIPT, checked: 2 },
      { ...RECEIPT, checked: 3, native_dimensions: 1536 },
      { ...RECEIPT, checked: 3, stored_dimensions: 4096 },
    ]) {
      await assertRejects(
        () => stage(db, { request: reserved.request_id, job, token, rows: payload, receipt }),
        Error,
        'The receipt does not match the reserved batch'
      );
    }
    assertEquals(await stagedIndexes(db, job), []);
  } finally {
    await db.close();
  }
});

// Falsifier: a replacement owner submits the earlier owner's result, or the
// earlier owner still stages after the replacement.
Deno.test('only the owner that reserved can stage, and only while it owns', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job, reserved } = await setup(db);
    const payload = stageRows(reserved.rows);
    const next = await replaceOwner(db, id);
    await assertRejects(
      () => stage(db, { request: reserved.request_id, job, token, rows: payload }),
      Error,
      'Crawl source lease lost'
    );
    await assertRejects(
      () => stage(db, { request: reserved.request_id, job, token: next, rows: payload }),
      Error,
      'The reservation belongs to another owner'
    );
    // The new owner reserves for itself: the same rows, a new debit.
    const own = await reserve(db, { job, token: next });
    assertEquals(own.rows.map(r => r.chunk_index), [0, 1, 2]);
    assertEquals(own.reserved, 2);
    const done = await stage(db, {
      request: own.request_id,
      job,
      token: next,
      rows: stageRows(own.rows),
    });
    assertEquals(done.staged_now, 3);
  } finally {
    await db.close();
  }
});

// Falsifier: an abandoned reservation, whose debit was taken over by a newer
// one, can still deliver vectors.
Deno.test('an abandoned reservation cannot be staged', async () => {
  const db = await openQwenIngestDb();
  try {
    const { token, job, reserved } = await setup(db);
    await reserve(db, { job, token });
    await assertRejects(
      () =>
        stage(db, {
          request: reserved.request_id,
          job,
          token,
          rows: stageRows(reserved.rows),
        }),
      Error,
      'The reservation was abandoned'
    );
  } finally {
    await db.close();
  }
});

// Falsifier: vectors are staged into a job whose source changed after the fetch.
Deno.test('a changed source configuration closes the job at stage', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, token, job, reserved } = await setup(db);
    await db.query(
      `update public.crawl_sources set data_urls = array['https://www.canada.ca/a.json']
        where id = $1`,
      [id]
    );
    const result = await stage(db, {
      request: reserved.request_id,
      job,
      token,
      rows: stageRows(reserved.rows),
    });
    assertEquals(result.status, 'failed');
    assertEquals(result.terminal_reason, 'configuration_changed');
    assertEquals(result.staged_now, 0);
    assertEquals(
      await rows(db, `select 1 from public.knowledge_generation_rows where job_id = $1`, [job]),
      []
    );
  } finally {
    await db.close();
  }
});

// Falsifier: a re-fetch with equal text re-embeds confirmed rows, or keeps
// the old dates.
Deno.test('an equal re-fetch keeps checked vectors and takes the newer metadata', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const token = await claim(db, id);
    const config = await configOf(db, id);
    const first = await open(db, { source: id, token, config, rows: chunkRows(25) });
    const r = await reserve(db, { job: first.job_id, token });
    await stage(db, { request: r.request_id, job: first.job_id, token, rows: stageRows(r.rows) });

    const newer = chunkRows(25).map(c => ({
      ...c,
      metadata: { ...c.metadata, fetched_at: '2026-10-26T00:00:00.000Z' },
    }));
    const next = await replaceOwner(db, id);
    const again = await open(db, {
      source: id,
      token: next,
      config,
      rows: newer,
      fetchedAt: '2026-10-26T00:00:00.000Z',
    });
    assertEquals(again.job_id, first.job_id);
    assertEquals(again.resumed, true);
    assertEquals(again.staged, 20);
    assertEquals(again.remaining, 5);
    assertEquals(again.fetched_at, '2026-10-26T00:00:00+00:00');
    const [m] = await rows<{ fetched: string }>(
      db,
      `select metadata->>'fetched_at' as fetched from public.knowledge_generation_rows
        where job_id = $1 and chunk_index = 0`,
      [first.job_id]
    );
    assertEquals(m.fetched, '2026-10-26T00:00:00.000Z');
    const rest = await stageAll(db, first.job_id, next);
    assertEquals(rest.remaining, 0);
    assertEquals(rest.reserved, 2, 'one reservation per batch, none for kept rows');
    const status = await call(db, `public.ingest_generation_status($1::uuid, null, null)`, [
      first.job_id,
    ]);
    assertEquals(status.staged, 25);
  } finally {
    await db.close();
  }
});
