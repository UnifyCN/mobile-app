// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The rebuild, cutover and rollback functions of qwen_embedding_model_guards,
// called directly in SQL in a local Postgres (PGlite with pgvector). The vectors
// are synthetic stand-ins: these tests prove the SQL's own checks, ordering and
// atomicity, not provider output. PGlite runs one statement at a time, so they
// do not show two transactions waiting on a lock; that needs a real PostgreSQL
// test database (see the runbook).
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openIngestDb } from './support/ingestDb.ts';
import {
  call,
  CONTRACT,
  LEGACY,
  QWEN,
  qwenVector,
  runBatch,
  seedChunk,
  seedStatedCorpus,
  sha256Hex,
} from './support/embeddingModels.ts';
import { embedding, rows, type Db } from './support/sharedDb.ts';

const begin = (db: Db) =>
  call<{ run_id: string }>(db, `public.knowledge_embedding_begin($1, $2)`, [
    QWEN,
    CONTRACT,
  ]);
const acquire = (db: Db, run: string) =>
  call<string | null>(
    db,
    `public.knowledge_embedding_acquire_worker($1::uuid, 300)::text`,
    [run]
  );
const activate = (db: Db, run: string, token: string) =>
  call(db, `public.knowledge_embedding_activate($1::uuid, $2::uuid)`, [
    run,
    token,
  ]);
const control = async (db: Db) =>
  (
    await rows<{
      phase: string;
      serving_model: string;
      writers_paused: boolean;
    }>(
      db,
      `select phase, serving_model, writers_paused from public.knowledge_embedding_cutover`
    )
  )[0];
const liveModels = (db: Db) =>
  rows<{ embedding_model: string; n: number }>(
    db,
    `select embedding_model, count(*)::int as n from public.knowledge_chunks group by 1 order by 1`
  );

/** Drains every missing vector with batches of 20, returning each batch size. */
async function drain(db: Db, run: string, token: string): Promise<number[]> {
  const sizes: number[] = [];
  for (;;) {
    const r = await runBatch(db, run, token);
    if (r.sent === 0) return sizes;
    sizes.push(r.sent);
  }
}

async function smallCorpus(db: Db) {
  const a = await seedChunk(db, {
    url: 'https://a.test/a',
    text: 'alpha',
    metadata: { province: 'Ontario', published_at: '2026-09-01' },
    updatedAt: '2026-09-10T00:00:00Z',
  });
  const b = await seedChunk(db, { url: 'https://a.test/b', text: 'beta' });
  return { a, b };
}

// Falsifier: a freeze that skips uploaded documents, leaves old leases alive or
// lets writers continue would let the snapshot and the live corpus drift.
Deno.test(
  'begin freezes the whole corpus, pauses writers and drops old leases',
  async () => {
    const db = await openIngestDb();
    try {
      const [{ id, url }] = await rows<{ id: number; url: string }>(
        db,
        `select id::int as id, url from public.crawl_sources where source_kind = 'html' order by id limit 1`
      );
      await seedStatedCorpus(db);
      const stale = (await call<string>(
        db,
        `public.claim_crawl_source($1, 300)::text`,
        [id]
      ))!;
      await db.query(
        `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300)`,
        [
          id,
          stale,
          JSON.stringify([
            {
              chunk_index: 0,
              chunk_text: 'x',
              embedding: JSON.parse(embedding(0.5)),
            },
          ]),
        ]
      );
      assert(url);

      const summary = await call<Record<string, number>>(
        db,
        `public.knowledge_embedding_begin($1, $2)`,
        [QWEN, CONTRACT]
      );

      assertEquals(summary.chunks, 351);
      assertEquals(summary.documents, 33);
      assertEquals(summary.source_linked_documents, 13);
      assertEquals(summary.source_linked_chunks, 13);
      assertEquals(summary.other_chunks, 338);
      assertEquals(summary.other_documents, 20);
      assertEquals(await control(db), {
        phase: 'rebuilding',
        serving_model: LEGACY,
        writers_paused: true,
      });
      assertEquals(
        await rows(
          db,
          `select 1 from public.crawl_source_leases union all select 1 from public.knowledge_chunk_staging`
        ),
        []
      );
      await assertRejects(
        () =>
          db.query(
            `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300)`,
            [
              id,
              stale,
              JSON.stringify([
                {
                  chunk_index: 1,
                  chunk_text: 'y',
                  embedding: JSON.parse(embedding(0.5)),
                },
              ]),
            ]
          ),
        Error
      );
      assertEquals(
        (
          await rows<{ n: number }>(
            db,
            `select count(*)::int as n from public.knowledge_embedding_rebuild_rows`
          )
        )[0].n,
        351
      );
      // The live corpus did not change.
      assertEquals(await liveModels(db), [{ embedding_model: LEGACY, n: 351 }]);
      // An active run is never overwritten.
      await assertRejects(() => begin(db), Error, 'already');
    } finally {
      await db.close();
    }
  }
);

// Falsifier: dropping an orphan chunk or a chunk without a vector from the
// snapshot loses it at cutover (or at rollback).
Deno.test(
  'an orphan chunk and a chunk without a vector are kept through the cutover',
  async () => {
    const db = await openIngestDb();
    try {
      await smallCorpus(db);
      // The hosted table allows a null document; the test baseline does not.
      await db.exec(
        `alter table public.knowledge_chunks alter column document_id drop not null`
      );
      await db.query(
        `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding, metadata)
       values (null, 0, 'orphan', $1::vector, '{"note":"keep"}'::jsonb)`,
        [embedding(0.4)]
      );
      await db.query(
        `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding)
       select id, 5, 'no vector', null from public.knowledge_documents order by id limit 1`
      );
      const before = await rows(
        db,
        `select id, document_id, chunk_index, chunk_text, metadata, created_at, updated_at
         from public.knowledge_chunks order by id`
      );

      const { run_id } = await begin(db);
      const token = (await acquire(db, run_id))!;
      assertEquals(
        (await drain(db, run_id, token)).reduce((a, b) => a + b, 0),
        4
      );
      await activate(db, run_id, token);

      assertEquals(
        await rows(
          db,
          `select id, document_id, chunk_index, chunk_text, metadata, created_at, updated_at
           from public.knowledge_chunks order by id`
        ),
        before
      );
      assertEquals(await liveModels(db), [{ embedding_model: QWEN, n: 4 }]);
      assertEquals(
        await rows(
          db,
          `select 1 from public.knowledge_chunks where embedding is null`
        ),
        []
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: batches over 20, rows that were not frozen, a vector computed from
// other text, a replaced vector or a wrong model/contract must not be staged.
Deno.test(
  'stage accepts only well-formed batches from the live worker',
  async () => {
    const db = await openIngestDb();
    try {
      const { a } = await smallCorpus(db);
      const { run_id } = await begin(db);
      const token = (await acquire(db, run_id))!;
      const good = async (id: number, text: string, v = 0.5) => ({
        chunk_id: id,
        text_sha256: await sha256Hex(text),
        embedding: JSON.parse(qwenVector(v)),
      });
      const stage = (
        worker: string,
        rowsToStage: unknown[],
        model = QWEN,
        contract = CONTRACT
      ) =>
        call(
          db,
          `public.knowledge_embedding_stage_batch($1::uuid, $2::uuid, $3, $4, $5::jsonb, 300)`,
          [run_id, worker, model, contract, JSON.stringify(rowsToStage)]
        );
      const first = await good(a.chunkId, 'alpha');
      const unknown = await good(999999, 'alpha');
      const tampered = await good(a.chunkId, 'other text');
      const conflicting = await good(a.chunkId, 'alpha', 0.9);

      await assertRejects(
        () => stage(token, [first], 'openai/text-embedding-3-small'),
        Error,
        'target model'
      );
      await assertRejects(
        () => stage(token, [first], QWEN, 'other-v1'),
        Error,
        'contract'
      );
      await assertRejects(
        () => stage('00000000-0000-0000-0000-000000000000', [first]),
        Error,
        'worker lease'
      );
      await assertRejects(() => stage(token, []), Error, 'between 1 and 20');
      await assertRejects(
        () =>
          stage(
            token,
            Array.from({ length: 21 }, () => first)
          ),
        Error,
        'between 1 and 20'
      );
      await assertRejects(
        () => stage(token, [unknown]),
        Error,
        'not part of this run'
      );
      await assertRejects(
        () => stage(token, [tampered]),
        Error,
        'changed from the frozen text'
      );
      await assertRejects(
        () => stage(token, [first, first]),
        Error,
        'more than once'
      );
      await assertRejects(
        () => stage(token, [{ ...first, embedding: new Array(1536).fill(0) }]),
        Error,
        'non-zero'
      );
      await assertRejects(
        () => stage(token, [{ ...first, embedding: [1, 2, 3] }]),
        Error
      );
      assertEquals(
        await rows(
          db,
          `select 1 from public.knowledge_embedding_rebuild_rows where qwen_embedding is not null`
        ),
        []
      );

      assertEquals(
        ((await stage(token, [first])) as { staged: number }).staged,
        1
      );
      assertEquals(
        ((await stage(token, [first])) as { staged: number }).staged,
        0,
        'repeat is a no-op'
      );
      await assertRejects(
        () => stage(token, [conflicting]),
        Error,
        'different vector'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a stopped worker that wakes up after it was replaced must not be
// able to stage or activate.
Deno.test('a replaced worker is fenced out at stage and activate', async () => {
  const db = await openIngestDb();
  try {
    await smallCorpus(db);
    const { run_id } = await begin(db);
    const old = (await acquire(db, run_id))!;
    assertEquals(
      await acquire(db, run_id),
      null,
      'a live worker is not replaced'
    );
    await runBatch(db, run_id, old, 1);

    await db.query(
      `update public.knowledge_embedding_cutover set worker_expires_at = now() - interval '1 second'`
    );
    const fresh = (await acquire(db, run_id))!;
    assert(fresh !== old);

    await assertRejects(() => runBatch(db, run_id, old), Error, 'worker lease');
    await assertRejects(() => activate(db, run_id, old), Error, 'worker lease');
    // A controlled release lets the next worker in at once.
    await call(
      db,
      `public.knowledge_embedding_release_worker($1::uuid, $2::uuid)`,
      [run_id, fresh]
    );
    const third = (await acquire(db, run_id))!;
    assert(third !== fresh);
    // Resume stages only what is missing, in chunk order.
    const resumed = await drain(db, run_id, third);
    assertEquals(
      resumed.reduce((a, b) => a + b, 0),
      1,
      'one chunk was already staged'
    );
    await activate(db, run_id, third);
    assertEquals((await control(db)).phase, 'qwen');
  } finally {
    await db.close();
  }
});

// Falsifier: an activation that tolerates a missing vector or any out-of-band
// change since the freeze serves a corpus that is not the one that was embedded.
const CHANGES: Array<[string, string]> = [
  [
    'a changed chunk text',
    `update public.knowledge_chunks set chunk_text = chunk_text || '!' where chunk_index = 0 and id = (select min(id) from public.knowledge_chunks)`,
  ],
  [
    'changed chunk metadata',
    `update public.knowledge_chunks set metadata = '{"province":"Alberta"}'::jsonb where id = (select min(id) from public.knowledge_chunks)`,
  ],
  [
    'a changed document',
    `update public.knowledge_documents set title = 'renamed' where id = (select min(id) from public.knowledge_documents)`,
  ],
  [
    'an inserted chunk',
    `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding) select id, 9, 'late upload', null from public.knowledge_documents limit 1`,
  ],
  [
    'a deleted chunk',
    `delete from public.knowledge_chunks where id = (select max(id) from public.knowledge_chunks)`,
  ],
  [
    'an inserted document',
    `insert into public.knowledge_documents (title, storage_path, source_url) values ('late', '', 'https://late.test')`,
  ],
  [
    'a deleted document',
    `delete from public.knowledge_documents where id = (select max(id) from public.knowledge_documents)`,
  ],
];
for (const [name, change] of CHANGES) {
  Deno.test(
    `activate refuses ${name} since the freeze and changes nothing`,
    async () => {
      const db = await openIngestDb();
      try {
        await smallCorpus(db);
        const { run_id } = await begin(db);
        const token = (await acquire(db, run_id))!;
        await drain(db, run_id, token);
        await db.exec(change);
        const live = await rows(
          db,
          `select kc.id, kc.embedding::text, kc.embedding_model from public.knowledge_chunks kc order by 1`
        );
        const docs = await rows(
          db,
          `select id, embedding_model from public.knowledge_documents order by 1`
        );

        await assertRejects(
          () => activate(db, run_id, token),
          Error,
          'changed since the snapshot'
        );

        assertEquals(await control(db), {
          phase: 'rebuilding',
          serving_model: LEGACY,
          writers_paused: true,
        });
        assertEquals(
          await rows(
            db,
            `select kc.id, kc.embedding::text, kc.embedding_model from public.knowledge_chunks kc order by 1`
          ),
          live
        );
        assertEquals(
          await rows(
            db,
            `select id, embedding_model from public.knowledge_documents order by 1`
          ),
          docs
        );
      } finally {
        await db.close();
      }
    }
  );
}

Deno.test(
  'activate refuses an incomplete rebuild and changes nothing',
  async () => {
    const db = await openIngestDb();
    try {
      await smallCorpus(db);
      const { run_id } = await begin(db);
      const token = (await acquire(db, run_id))!;
      await runBatch(db, run_id, token, 1);
      await assertRejects(
        () => activate(db, run_id, token),
        Error,
        'no vector'
      );
      assertEquals(await control(db), {
        phase: 'rebuilding',
        serving_model: LEGACY,
        writers_paused: true,
      });
      assertEquals(await liveModels(db), [{ embedding_model: LEGACY, n: 2 }]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a rollback that restores old rows over new content, or one that
// destroys either index, loses data. After a normal Qwen refresh replaced chunk
// ids, the old snapshot must still serve with its original dates and ids.
Deno.test(
  'after a refresh replaced chunk ids, rollback serves the saved index and keeps the Qwen one',
  async () => {
    const db = await openIngestDb();
    try {
      const { a, b } = await smallCorpus(db);
      const [{ id: sourceId, url }] = await rows<{ id: number; url: string }>(
        db,
        `select id::int as id, url from public.crawl_sources where source_kind = 'html' order by id limit 1`
      );
      await seedChunk(db, {
        url,
        text: 'crawled page',
        metadata: { fetched_at: '2026-10-01T00:00:00Z' },
      });
      const { run_id } = await begin(db);
      const token = (await acquire(db, run_id))!;
      await drain(db, run_id, token);
      await activate(db, run_id, token);
      assertEquals(
        (await control(db)).writers_paused,
        true,
        'writers stay paused after cutover'
      );
      await call(db, `public.knowledge_embedding_enable_writers()`);

      // A normal Qwen refresh replaces the crawled document's chunk ids.
      const idsBefore = await rows<{ id: number }>(
        db,
        `select id::int as id from public.knowledge_chunks order by id`
      );
      const lease = (await call<string>(
        db,
        `public.claim_crawl_source($1, 300, $2)::text`,
        [sourceId, QWEN]
      ))!;
      await db.query(
        `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300, $4)`,
        [
          sourceId,
          lease,
          JSON.stringify([
            {
              chunk_index: 0,
              chunk_text: 'fresh crawl',
              embedding: JSON.parse(qwenVector(0.6)),
              metadata: { fetched_at: '2026-10-25T00:00:00Z' },
            },
          ]),
          QWEN,
        ]
      );
      await db.query(
        `select public.promote_knowledge_generation($1, $2::uuid, 't', '{}'::jsonb, 'h2', 1, '2026-10-25T00:00:00Z', $3)`,
        [sourceId, lease, QWEN]
      );
      const idsAfter = await rows<{ id: number }>(
        db,
        `select id::int as id from public.knowledge_chunks order by id`
      );
      assert(
        JSON.stringify(idsBefore) !== JSON.stringify(idsAfter),
        'chunk ids changed'
      );
      const qwenCorpus = await rows(
        db,
        `select id, chunk_text, embedding::text from public.knowledge_chunks order by id`
      );

      const q = (model: string, v: string) =>
        rows<{
          id: number;
          chunk_text: string;
          knowledge_documents: Record<string, unknown>;
        }>(
          db,
          `select id::int as id, chunk_text, knowledge_documents from public.match_chunks($1::vector, 0.0, 20, 'Ontario', $2) order by id`,
          [v, model]
        );
      assertEquals(
        (await q(QWEN, qwenVector(0.6))).map(r => r.chunk_text).sort(),
        ['alpha', 'beta', 'fresh crawl']
      );
      assertEquals(
        await q(LEGACY, embedding(0.9)),
        [],
        'legacy gets nothing while Qwen serves'
      );

      await call(db, `public.knowledge_embedding_rollback()`);

      assertEquals(await control(db), {
        phase: 'rollback',
        serving_model: LEGACY,
        writers_paused: true,
      });
      assertEquals(
        await call(db, `public.claim_crawl_source($1, 300)::text`, [sourceId]),
        null
      );
      const saved = await q(LEGACY, embedding(0.9));
      assertEquals(saved.map(r => r.chunk_text).sort(), [
        'alpha',
        'beta',
        'crawled page',
      ]);
      assertEquals(
        saved.map(r => r.id).sort(),
        [a.chunkId, b.chunkId, idsBefore[2].id].sort()
      );
      const alpha = saved.find(r => r.chunk_text === 'alpha')!;
      assertEquals(alpha.knowledge_documents.published_at, '2026-09-01');
      assertEquals(alpha.knowledge_documents.updated_at !== null, true);
      assertEquals(
        await q(QWEN, qwenVector(0.6)),
        [],
        'Qwen gets nothing during rollback'
      );
      assertEquals(
        await rows(
          db,
          `select id, chunk_text, embedding::text from public.knowledge_chunks order by id`
        ),
        qwenCorpus,
        'the Qwen index is intact'
      );

      await call(db, `public.knowledge_embedding_return_to_qwen()`);

      assertEquals((await control(db)).phase, 'qwen');
      assertEquals(
        (await q(QWEN, qwenVector(0.6))).map(r => r.chunk_text).sort(),
        ['alpha', 'beta', 'fresh crawl']
      );
      assertEquals(await q(LEGACY, embedding(0.9)), []);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: abort that leaves writers paused, or begin that overwrites a run.
Deno.test(
  'abort serves legacy, keeps writers paused and the staged vectors, and allows a new run',
  async () => {
    const db = await openIngestDb();
    try {
      await smallCorpus(db);
      const first = await begin(db);
      const token = (await acquire(db, first.run_id))!;
      await runBatch(db, first.run_id, token, 1);

      await call(db, `public.knowledge_embedding_abort($1::uuid)`, [
        first.run_id,
      ]);

      assertEquals(await control(db), {
        phase: 'legacy',
        serving_model: LEGACY,
        writers_paused: true,
      });
      assertEquals(
        (
          await rows<{ n: number }>(
            db,
            `select count(*)::int as n from public.knowledge_embedding_rebuild_rows where run_id = $1 and qwen_embedding is not null`,
            [first.run_id]
          )
        )[0].n,
        1
      );
      await assertRejects(() => runBatch(db, first.run_id, token), Error);
      const second = await begin(db);
      assert(second.run_id !== first.run_id);
      await assertRejects(
        () =>
          call(db, `public.knowledge_embedding_abort($1::uuid)`, [
            first.run_id,
          ]),
        Error,
        'not the active run'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the return from rollback must keep writers paused while the read
// contract is checked, and the Qwen query caller must read nothing until the
// switch back. The documented order is: rollback, Qwen query deployed, return,
// read checks with writers paused, then enable writers.
Deno.test(
  'return from rollback keeps writers paused until the Qwen read checks pass',
  async () => {
    const db = await openIngestDb();
    try {
      await smallCorpus(db);
      const [{ id: sourceId }] = await rows<{ id: number }>(
        db,
        `select id::int as id from public.crawl_sources where source_kind = 'html' order by id limit 1`
      );
      const run = (await begin(db)).run_id;
      const token = (await acquire(db, run))!;
      await drain(db, run, token);
      await activate(db, run, token);
      await call(db, `public.knowledge_embedding_enable_writers()`);
      await call(db, `public.knowledge_embedding_rollback()`);

      const read = (model: string, v: string) =>
        rows<{ chunk_text: string }>(
          db,
          `select chunk_text from public.match_chunks($1::vector, 0.0, 20, 'Ontario', $2) order by id`,
          [v, model]
        );
      const claimAs = (model: string) =>
        call<string | null>(
          db,
          `public.claim_crawl_source($1, 300, $2)::text`,
          [sourceId, model]
        );

      // Rollback: the prior legacy caller reads; a Qwen caller deployed early
      // reads nothing.
      assertEquals(
        (await read(LEGACY, embedding(0.9))).map(r => r.chunk_text),
        ['alpha', 'beta']
      );
      assertEquals(await read(QWEN, qwenVector(0.6)), []);

      await call(db, `public.knowledge_embedding_return_to_qwen()`);

      // Writers are still paused: the compatible read contract can be checked
      // before any ingester runs.
      assertEquals(await control(db), {
        phase: 'qwen',
        serving_model: QWEN,
        writers_paused: true,
      });
      assertEquals(
        (await read(QWEN, qwenVector(0.6))).map(r => r.chunk_text).sort(),
        ['alpha', 'beta']
      );
      assertEquals(await read(LEGACY, embedding(0.9)), []);
      assertEquals(await claimAs(QWEN), null, 'no ingester yet');

      await call(db, `public.knowledge_embedding_enable_writers()`);
      assert((await claimAs(QWEN)) !== null, 'writers resumed');
    } finally {
      await db.close();
    }
  }
);
