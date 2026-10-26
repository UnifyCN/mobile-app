// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// ingest_generation_refresh on the real migrations (PGlite): the unchanged-
// content refresh compares the fetched configuration in the transaction that
// writes the live dates. Falsifier for every case: content fetched under one
// configuration takes live dates, province or a superseded job under another.
// Competing transactions are proven on native PostgreSQL, not here.
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { CONTRACT, QWEN, seedChunk } from './support/embeddingModels.ts';
import {
  call,
  chunkRows,
  claim,
  CONFIG_CHANGES,
  configOf,
  live,
  open,
  type SourceConfig,
  sourceId,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

const HASH = 'live-content-hash';
const PATCH = { fetched_at: '2026-10-26T00:00:00.000Z', province: null };
const GROUPS = [{ metadata: { fetched_at: '2026-10-26T00:00:00.000Z' }, indexes: null }];

function refresh(db: Db, o: { source: number; token: string; config: SourceConfig }) {
  return call<boolean>(
    db,
    `public.ingest_generation_refresh(
       p_source_id => $1, p_token => $2::uuid, p_source_config => $3::jsonb,
       p_embedding_model => $4, p_contract => $5, p_content_hash => $6,
       p_document_patch => $7::jsonb, p_chunk_groups => $8::jsonb,
       p_lease_seconds => 300)`,
    [
      o.source,
      o.token,
      JSON.stringify(o.config),
      QWEN,
      CONTRACT,
      HASH,
      JSON.stringify(PATCH),
      JSON.stringify(GROUPS),
    ]
  );
}

/** A record source with one live Qwen chunk, a claim and an open job. */
async function setup(db: Db) {
  const id = await sourceId(db, 'ircc_processing_times');
  const config = await configOf(db, id);
  const { documentId } = await seedChunk(db, {
    url: config.url,
    text: 'Live text.',
    model: QWEN,
    metadata: { fetched_at: '2026-10-25T00:00:00.000Z' },
  });
  await db.query(`update public.knowledge_documents set content_hash = $1 where id = $2`, [
    HASH,
    documentId,
  ]);
  const token = await claim(db, id);
  const job = (await open(db, { source: id, token, config, rows: chunkRows(3) })).job_id;
  return { id, config, token, job };
}

async function jobStatus(db: Db, job: unknown) {
  const [row] = await rows<{ status: string }>(
    db,
    `select status from public.knowledge_generation_jobs where id = $1`,
    [job]
  );
  return row.status;
}

for (const [field, change] of CONFIG_CHANGES) {
  Deno.test(`a changed ${field} refuses the refresh and writes nothing`, async () => {
    const db = await openQwenIngestDb();
    try {
      const { id, config, token, job } = await setup(db);
      const before = await live(db, config.url);
      await db.query(`update public.crawl_sources set ${change} where id = $1`, [id]);

      await assertRejects(
        () => refresh(db, { source: id, token, config }),
        Error,
        'Source configuration changed'
      );
      assertEquals(await live(db, config.url), before);
      assertEquals(await jobStatus(db, job), 'open', 'the refused call changed no job');
    } finally {
      await db.close();
    }
  });
}

Deno.test('a disabled source refuses the refresh even when the caller saw it disabled', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, config, token } = await setup(db);
    const before = await live(db, config.url);
    await db.query(`update public.crawl_sources set enabled = false where id = $1`, [id]);

    await assertRejects(
      () => refresh(db, { source: id, token, config: { ...config, enabled: false } }),
      Error,
      'Source is disabled'
    );
    assertEquals(await live(db, config.url), before);
  } finally {
    await db.close();
  }
});

Deno.test('an unchanged configuration supersedes the open job and refreshes the dates', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, config, token, job } = await setup(db);

    assertEquals(await refresh(db, { source: id, token, config }), true);
    assertEquals(await jobStatus(db, job), 'superseded');
    const after = await live(db, config.url);
    assertEquals(after.documents[0].metadata, PATCH);
    assertEquals(after.chunks[0].metadata, GROUPS[0].metadata);
  } finally {
    await db.close();
  }
});

Deno.test('the refresh needs the live lease and the serving contract', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, config, token } = await setup(db);
    const before = await live(db, config.url);

    await assertRejects(
      () => refresh(db, { source: id, token: crypto.randomUUID(), config }),
      Error,
      'Crawl source lease lost'
    );
    await assertRejects(
      () =>
        call(
          db,
          `public.ingest_generation_refresh($1, $2::uuid, $3::jsonb, $4, 'other-contract',
             $5, '{}'::jsonb, '[{"metadata":{},"indexes":null}]'::jsonb, 300)`,
          [id, token, JSON.stringify(config), QWEN, HASH]
        ),
      Error,
      'Embedding contract is not the serving contract'
    );
    assertEquals(await live(db, config.url), before);
  } finally {
    await db.close();
  }
});
