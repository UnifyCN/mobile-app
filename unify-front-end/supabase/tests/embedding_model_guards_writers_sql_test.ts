// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The guarded writer functions of qwen_embedding_model_guards: claim, stage,
// promote and refresh with an explicit embedding model. PGlite runs one
// statement at a time, so these tests prove the functions' own checks, not two
// transactions waiting on the control-row lock.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openIngestDb } from './support/ingestDb.ts';
import {
  LEGACY,
  QWEN,
  seedChunk,
  setControl,
} from './support/embeddingModels.ts';
import { embedding, rows, type Db } from './support/sharedDb.ts';

async function htmlSource(db: Db) {
  const [row] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  return row;
}

const claim = async (db: Db, id: number) =>
  (
    await rows<{ token: string | null }>(
      db,
      `select public.claim_crawl_source(
        $1, 300, (select serving_model from public.knowledge_embedding_cutover)
      )::text as token`,
      [id]
    )
  )[0].token;

const chunkRow = (index: number, text = `chunk ${index}`) => ({
  chunk_index: index,
  chunk_text: text,
  embedding: JSON.parse(embedding(0.5)),
  metadata: { published_at: '2026-10-20' },
});

/** The explicit-model overloads, called by position. */
const stage = (
  db: Db,
  id: number,
  token: string,
  chunks: unknown[],
  model: string
) =>
  db.query(
    `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300, $4::text)`,
    [id, token, JSON.stringify(chunks), model]
  );
const promote = (
  db: Db,
  id: number,
  token: string,
  count: number,
  model: string,
  hash = 'h1'
) =>
  db.query(
    `select public.promote_knowledge_generation($1, $2::uuid, 'Title', '{"source":"crawler"}'::jsonb, $3, $4, '2026-10-24T00:00:00Z', $5::text)`,
    [id, token, hash, count, model]
  );
const refresh = async (
  db: Db,
  id: number,
  token: string,
  model: string,
  hash = 'h1',
  groups: unknown = [{ metadata: { fetched_at: 'now' }, indexes: null }]
) =>
  (
    await rows<{ ok: boolean }>(
      db,
      `select public.refresh_knowledge_metadata($1, $2::uuid, $3, '{"fetched_at":"now"}'::jsonb, $4::jsonb, $5::text) as ok`,
      [id, token, hash, JSON.stringify(groups), model]
    )
  )[0].ok;
// The pre-migration signatures, by position.
const legacyStage = (db: Db, id: number, token: string, chunks: unknown[]) =>
  db.query(
    `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300)`,
    [id, token, JSON.stringify(chunks)]
  );
const legacyPromote = (db: Db, id: number, token: string, count: number) =>
  db.query(
    `select public.promote_knowledge_generation($1, $2::uuid, 'Title', '{}'::jsonb, 'h1', $3, '2026-10-24T00:00:00Z')`,
    [id, token, count]
  );
const release = (db: Db, id: number, token: string) =>
  db.query(`select public.release_crawl_source($1, $2::uuid)`, [id, token]);

const documents = (db: Db) =>
  rows<{ embedding_model: string }>(
    db,
    `select embedding_model from public.knowledge_documents order by id`
  );
const chunks = (db: Db) =>
  rows<{ chunk_text: string; embedding_model: string }>(
    db,
    `select chunk_text, embedding_model from public.knowledge_chunks order by id`
  );

// Falsifier: the old SQL accepts any writer at any time, so an old worker can
// stage and promote OpenAI vectors after Qwen is serving, and a new worker can
// promote Qwen vectors before the cutover.
Deno.test(
  'a writer must name the serving model; the legacy signatures name the legacy model',
  async () => {
    const db = await openIngestDb();
    try {
      const { id } = await htmlSource(db);

      // Before the cutover: serving legacy.
      const first = (await claim(db, id))!;
      await assertRejects(
        () => stage(db, id, first, [chunkRow(0)], QWEN),
        Error,
        'is not the serving model'
      );
      await legacyStage(db, id, first, [chunkRow(0, 'legacy text')]);
      await assertRejects(
        () => promote(db, id, first, 1, QWEN),
        Error,
        'is not the serving model'
      );
      await legacyPromote(db, id, first, 1);
      assertEquals(await chunks(db), [
        { chunk_text: 'legacy text', embedding_model: LEGACY },
      ]);
      await release(db, id, first);

      // After the cutover: serving Qwen, writers enabled.
      await setControl(db, 'qwen', QWEN);
      const second = (await claim(db, id))!;
      await assertRejects(
        () => legacyStage(db, id, second, [chunkRow(0, 'old worker')]),
        Error,
        'is not the serving model'
      );
      await stage(db, id, second, [chunkRow(0, 'qwen text')], QWEN);
      await assertRejects(
        () => legacyPromote(db, id, second, 1),
        Error,
        'is not the serving model'
      );
      assertEquals((await chunks(db))[0].chunk_text, 'legacy text');
      await promote(db, id, second, 1, QWEN, 'h2');
      assertEquals(await chunks(db), [
        { chunk_text: 'qwen text', embedding_model: QWEN },
      ]);
      assertEquals(await documents(db), [{ embedding_model: QWEN }]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a paused writer that still claims or writes can race the rebuild.
Deno.test(
  'paused writers cannot claim, stage, promote or refresh',
  async () => {
    const db = await openIngestDb();
    try {
      const { id } = await htmlSource(db);
      const token = (await claim(db, id))!;
      // Another source holds no lease, so only the pause can refuse its claim.
      const [{ id: other }] = await rows<{ id: number }>(
        db,
        `select id::int as id from public.crawl_sources where id <> $1 order by id limit 1`,
        [id]
      );
      await db.query(
        `update public.knowledge_embedding_cutover set writers_paused = true`
      );

      assertEquals(await claim(db, other), null, 'busy while paused');
      await assertRejects(
        () => stage(db, id, token, [chunkRow(0)], LEGACY),
        Error,
        'paused'
      );
      await assertRejects(
        () => promote(db, id, token, 1, LEGACY),
        Error,
        'paused'
      );
      await assertRejects(
        () => refresh(db, id, token, LEGACY),
        Error,
        'paused'
      );
      await assertRejects(
        () => legacyStage(db, id, token, [chunkRow(0)]),
        Error,
        'paused'
      );

      await db.query(
        `update public.knowledge_embedding_cutover set writers_paused = false`
      );
      await release(db, id, token);
      assert(
        (await claim(db, id)) !== null,
        'claims again once writers resume'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: promoting staged rows of two models writes a mixed generation.
Deno.test(
  'a generation with a staged row of another model is not promoted',
  async () => {
    const db = await openIngestDb();
    try {
      const { id } = await htmlSource(db);
      const token = (await claim(db, id))!;
      await stage(db, id, token, [chunkRow(0, 'new qwen')], LEGACY);
      // The worker's lease survives a switch of the serving model by hand; its
      // staged row still names the legacy model.
      await setControl(db, 'qwen', QWEN);
      await assertRejects(
        () => promote(db, id, token, 1, QWEN),
        Error,
        'another embedding model'
      );
      assertEquals(await chunks(db), []);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the model check must also apply to a generation with no chunks
// (an empty newsroom), which stages nothing that could carry the model.
Deno.test('an empty generation still needs the serving model', async () => {
  const db = await openIngestDb();
  try {
    const { id } = await htmlSource(db);
    await setControl(db, 'qwen', QWEN);
    const token = (await claim(db, id))!;
    await assertRejects(
      () => promote(db, id, token, 0, LEGACY),
      Error,
      'is not the serving model'
    );
    assertEquals(await documents(db), []);
    await promote(db, id, token, 0, QWEN);
    assertEquals(await documents(db), [{ embedding_model: QWEN }]);
    assertEquals(await chunks(db), []);
  } finally {
    await db.close();
  }
});

// Falsifier: equal hashes with the wrong model, a missing vector or a mix of
// models would be refreshed in place and keep stale vectors.
Deno.test(
  'a metadata refresh needs a complete generation of the requested model',
  async () => {
    const db = await openIngestDb();
    try {
      const { id, url } = await htmlSource(db);
      await setControl(db, 'qwen', QWEN);
      const { documentId } = await seedChunk(db, {
        url,
        text: 'a',
        model: QWEN,
      });
      await db.query(
        `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding, embedding_model)
       values ($1, 1, 'b', $2::vector, $3)`,
        [documentId, embedding(0.5), QWEN]
      );
      await db.query(
        `update public.knowledge_documents set content_hash = 'h1'`
      );
      const token = (await claim(db, id))!;

      assertEquals(await refresh(db, id, token, QWEN), true);

      await db.query(
        `update public.knowledge_chunks set embedding_model = $1 where chunk_index = 1`,
        [LEGACY]
      );
      assertEquals(
        await refresh(db, id, token, QWEN),
        false,
        'one chunk is legacy'
      );
      await db.query(
        `update public.knowledge_chunks set embedding_model = $1, embedding = null where chunk_index = 1`,
        [QWEN]
      );
      assertEquals(
        await refresh(db, id, token, QWEN),
        false,
        'one vector is missing'
      );
      await db.query(
        `update public.knowledge_chunks set embedding = $2::vector where chunk_index = 1 and $1 = $1`,
        [QWEN, embedding(0.5)]
      );
      await db.query(
        `update public.knowledge_documents set embedding_model = $1`,
        [LEGACY]
      );
      assertEquals(
        await refresh(db, id, token, QWEN),
        false,
        'the document is legacy'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: an empty document of the right model refreshes; of another model
// it does not, since a zero-chunk document has no vector to prove its model.
Deno.test(
  'a zero-chunk document refreshes only under its own model',
  async () => {
    const db = await openIngestDb();
    try {
      const { id, url } = await htmlSource(db);
      await setControl(db, 'qwen', QWEN);
      await db.query(
        `insert into public.knowledge_documents (title, storage_path, source_url, content_hash, embedding_model)
       values ('t', '', $1, 'h1', $2)`,
        [url, QWEN]
      );
      const token = (await claim(db, id))!;
      const groups = [{ metadata: {}, indexes: [] }];
      assertEquals(await refresh(db, id, token, QWEN, 'h1', groups), true);
      await db.query(
        `update public.knowledge_documents set embedding_model = $1`,
        [LEGACY]
      );
      assertEquals(await refresh(db, id, token, QWEN, 'h1', groups), false);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the batch and completeness rules of the old functions must hold
// for the new overloads too.
Deno.test(
  'the explicit-model overloads keep the batch and completeness rules',
  async () => {
    const db = await openIngestDb();
    try {
      const { id } = await htmlSource(db);
      const token = (await claim(db, id))!;
      await assertRejects(
        () =>
          stage(
            db,
            id,
            token,
            Array.from({ length: 21 }, (_, i) => chunkRow(i)),
            LEGACY
          ),
        Error,
        'between 1 and 20'
      );
      await assertRejects(
        () => stage(db, id, token, [], LEGACY),
        Error,
        'between 1 and 20'
      );
      await assertRejects(
        () =>
          db.query(
            `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300, $4::text)`,
            [
              id,
              token,
              JSON.stringify([{ ...chunkRow(0), embedding_model: QWEN }]),
              LEGACY,
            ]
          ),
        Error,
        'another embedding model'
      );
      await stage(db, id, token, [chunkRow(0), chunkRow(2)], LEGACY);
      await assertRejects(
        () => promote(db, id, token, 2, LEGACY),
        Error,
        'incomplete'
      );
      await assertRejects(
        () =>
          promote(db, id, '00000000-0000-0000-0000-000000000000', 2, LEGACY),
        Error,
        'lease lost'
      );
      assertEquals(await chunks(db), []);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a claim that ignores the caller's model lets an ingester of the
// other model fetch a page and buy vectors that its later write must refuse.
Deno.test(
  'a claim names the model: the wrong model and the old signature get no lease while Qwen serves',
  async () => {
    const db = await openIngestDb();
    try {
      const { id } = await htmlSource(db);
      const claimAs = async (model: string) =>
        (
          await rows<{ token: string | null }>(
            db,
            `select public.claim_crawl_source($1, 300, $2)::text as token`,
            [id, model]
          )
        )[0].token;
      const leases = () => rows(db, `select 1 from public.crawl_source_leases`);

      // Legacy serves: the Qwen ingester is refused, the old signature works.
      assertEquals(await claimAs(QWEN), null);
      assertEquals(await leases(), []);
      const legacy = (
        await rows<{ token: string | null }>(
          db,
          `select public.claim_crawl_source($1, 300)::text as token`,
          [id]
        )
      )[0].token;
      assert(legacy !== null);
      await release(db, id, legacy);

      // Qwen serves: the old signature and the legacy name are refused.
      await setControl(db, 'qwen', QWEN);
      assertEquals(await claimAs(LEGACY), null);
      assertEquals(
        (
          await rows<{ token: string | null }>(
            db,
            `select public.claim_crawl_source($1, 300)::text as token`,
            [id]
          )
        )[0].token,
        null
      );
      assertEquals(await leases(), []);
      assert((await claimAs(QWEN)) !== null);
    } finally {
      await db.close();
    }
  }
);
