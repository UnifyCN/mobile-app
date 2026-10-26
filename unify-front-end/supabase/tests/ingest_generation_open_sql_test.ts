// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// ingest_generation_open, on the real migrations in a local Postgres (PGlite
// with pgvector). What this proves: the server computes the text hashes, the
// fingerprint and the request cap; a repeated operation id never makes a
// second job; the job binds the fetched source configuration; limits and the
// live-write guards refuse a bad open with no change. PGlite runs one
// statement at a time, so lock waits are covered by the native PostgreSQL
// checks, not here.
import {
  assertEquals,
  assertMatch,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { LEGACY } from './support/embeddingModels.ts';
import {
  call,
  chunkRows,
  claim,
  configOf,
  EMPTY_SHA256,
  fingerprintOf,
  open,
  sourceId,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

async function jobs(db: Db) {
  return await rows<{ status: string; chunk_count: number }>(
    db,
    `select status, chunk_count from public.knowledge_generation_jobs order by created_at`
  );
}

// Falsifier: a client-supplied fingerprint, a cap of another formula, or
// counts that do not come from the stored rows.
Deno.test(
  'open stores the frozen rows with server hashes, fingerprint and cap',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'html');
      const token = await claim(db, id);
      const input = chunkRows(45);
      const result = await open(db, {
        source: id,
        token,
        config: await configOf(db, id),
        rows: input,
      });

      assertEquals(result.status, 'open');
      assertEquals(result.total, 45);
      assertEquals(result.staged, 0);
      assertEquals(result.remaining, 45);
      assertEquals(result.reserved, 0);
      assertEquals(result.cap, 11, '2 * ceil(45 / 20) + 5');
      assertEquals(result.resumed, false);
      assertEquals(
        result.fingerprint,
        await fingerprintOf(input.map(r => r.chunk_text))
      );
      assertMatch(String(result.job_id), /^[0-9a-f-]{36}$/);
      const stored = await rows<{ chunk_index: number; text_sha256: string }>(
        db,
        `select chunk_index, text_sha256 from public.knowledge_generation_rows
          where job_id = $1 order by chunk_index`,
        [result.job_id]
      );
      assertEquals(stored.length, 45);
      assertEquals(stored[0].text_sha256.length, 64);
      // The live tables are untouched until promotion.
      assertEquals(await rows(db, `select 1 from public.knowledge_chunks`), []);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a lost response followed by a retry with the same operation id
// creates a second job.
Deno.test('a repeated operation id returns the same job', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const token = await claim(db, id);
    const operation = crypto.randomUUID();
    const config = await configOf(db, id);
    const first = await open(db, {
      operation,
      source: id,
      token,
      config,
      rows: chunkRows(3),
    });
    const again = await open(db, {
      operation,
      source: id,
      token,
      config,
      rows: chunkRows(3),
    });
    assertEquals(again.job_id, first.job_id);
    assertEquals(again.replayed, true);
    assertEquals((await jobs(db)).length, 1);
  } finally {
    await db.close();
  }
});

// Falsifier: an empty generation for a page source, or a null fingerprint
// from an empty aggregate.
Deno.test(
  'only the newsroom may open an empty generation, with the empty-text fingerprint',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const page = await sourceId(db, 'html');
      const pageToken = await claim(db, page);
      const pageConfig = await configOf(db, page);
      await assertRejects(
        () =>
          open(db, {
            source: page,
            token: pageToken,
            config: pageConfig,
            rows: [],
          }),
        Error,
        'Only the newsroom can have an empty generation'
      );
      const news = await sourceId(db, 'ircc_newsroom');
      const result = await open(db, {
        source: news,
        token: await claim(db, news),
        config: await configOf(db, news),
        rows: [],
      });
      assertEquals(result.fingerprint, EMPTY_SHA256);
      assertEquals(result.total, 0);
      assertEquals(result.cap, 5);
      assertEquals((await jobs(db)).length, 1);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: text fetched under one configuration is accepted for another,
// or for a disabled source.
Deno.test(
  'open refuses a configuration that differs from the locked source',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const id = await sourceId(db, 'html');
      const token = await claim(db, id);
      const config = await configOf(db, id);
      for (const changed of [
        { ...config, url: config.url + '?changed' },
        { ...config, data_urls: ['https://www.canada.ca/x.json'] },
        { ...config, source_kind: 'ircc_newsroom' },
        { ...config, province: 'Ontario' },
        { ...config, label: 'Another label' },
        { ...config, crawl_frequency_hours: config.crawl_frequency_hours + 1 },
        { ...config, enabled: false },
      ]) {
        await assertRejects(
          () => open(db, { source: id, token, config: changed, rows: chunkRows(2) }),
          Error,
          'Source configuration changed'
        );
      }
      await db.query(`update public.crawl_sources set enabled = false where id = $1`, [id]);
      await assertRejects(
        () =>
          open(db, {
            source: id,
            token,
            config: { ...config, enabled: false },
            rows: chunkRows(2),
          }),
        Error,
        'Source is disabled'
      );
      assertEquals(await jobs(db), []);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a gap, a repeat or a negative index is stored as a generation.
Deno.test('open requires indexes 0..n-1 once each', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const token = await claim(db, id);
    const config = await configOf(db, id);
    const gap = chunkRows(3);
    gap[2].chunk_index = 5;
    const repeat = chunkRows(3);
    repeat[2].chunk_index = 1;
    for (const bad of [gap, repeat]) {
      await assertRejects(
        () => open(db, { source: id, token, config, rows: bad }),
        Error,
        'Rows must have indexes 0 to n-1 once each'
      );
    }
    assertEquals(await jobs(db), []);
  } finally {
    await db.close();
  }
});

// Falsifier: an oversized input is truncated to fit, or stored.
Deno.test('open refuses every oversized input without truncating it', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const token = await claim(db, id);
    const config = await configOf(db, id);
    const longText = chunkRows(2);
    longText[1].chunk_text = 'é'.repeat(4097); // 8194 UTF-8 bytes
    const bigMetadata = chunkRows(2);
    bigMetadata[0].metadata = { note: 'x'.repeat(16_400) };
    const cases: Array<[string, Parameters<typeof open>[1]]> = [
      ['too many rows', { source: id, token, config, rows: chunkRows(5001) }],
      ['chunk text', { source: id, token, config, rows: longText }],
      ['chunk metadata', { source: id, token, config, rows: bigMetadata }],
      ['title', { source: id, token, config, rows: chunkRows(1), title: 't'.repeat(8193) }],
      [
        'document metadata',
        {
          source: id,
          token,
          config,
          rows: chunkRows(1),
          documentMetadata: { note: 'x'.repeat(16_400) },
        },
      ],
      [
        'payload',
        {
          source: id,
          token,
          config,
          // 1100 rows of 7.9 KB text: under every per-row limit, over 8 MiB.
          rows: chunkRows(1100).map(r => ({ ...r, chunk_text: 'p'.repeat(7900) })),
        },
      ],
    ];
    for (const [name, input] of cases) {
      await assertRejects(
        () => open(db, input),
        Error,
        'Generation input exceeds a limit',
        name
      );
    }
    assertEquals(await jobs(db), []);
  } finally {
    await db.close();
  }
});

// Falsifier: an open without the live issuer token, while writers are
// paused, or for another model or contract succeeds.
Deno.test('open needs the live lease, the serving model and contract', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const token = await claim(db, id);
    const config = await configOf(db, id);
    const base = { source: id, token, config, rows: chunkRows(2) };
    await assertRejects(
      () => open(db, { ...base, token: crypto.randomUUID() }),
      Error,
      'Crawl source lease lost'
    );
    await assertRejects(
      () => open(db, { ...base, model: LEGACY }),
      Error,
      'Embedding model is not the serving model'
    );
    await assertRejects(
      () => open(db, { ...base, contract: 'another-contract' }),
      Error,
      'Embedding contract is not the serving contract'
    );
    await db.query(`update public.knowledge_embedding_cutover set writers_paused = true`);
    await assertRejects(() => open(db, base), Error, 'Knowledge writes are paused');
    await db.query(`update public.knowledge_embedding_cutover set writers_paused = false`);
    await db.query(
      `update public.crawl_source_leases set expires_at = now() - interval '1 second'
        where crawl_source_id = $1`,
      [id]
    );
    await assertRejects(() => open(db, base), Error, 'Crawl source lease lost');
    assertEquals(await jobs(db), []);
  } finally {
    await db.close();
  }
});

// Falsifier: a changed input keeps the old private rows, or two open jobs
// exist for one source.
Deno.test('a changed input supersedes the open job and its rows', async () => {
  const db = await openQwenIngestDb();
  try {
    const id = await sourceId(db, 'html');
    const token = await claim(db, id);
    const config = await configOf(db, id);
    const first = await open(db, { source: id, token, config, rows: chunkRows(3, 'a') });
    const second = await open(db, { source: id, token, config, rows: chunkRows(4, 'b') });

    assertEquals(second.resumed, false);
    assertEquals(await jobs(db), [
      { status: 'superseded', chunk_count: 3 },
      { status: 'open', chunk_count: 4 },
    ]);
    assertEquals(
      await rows(db, `select 1 from public.knowledge_generation_rows where job_id = $1`, [
        first.job_id,
      ]),
      []
    );
    const status = await call(db, `public.ingest_generation_status($1::uuid, null, null)`, [
      first.job_id,
    ]);
    assertEquals(status.status, 'superseded');
    assertEquals(status.terminal_reason, 'superseded');
  } finally {
    await db.close();
  }
});
