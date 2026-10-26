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
  privateState,
  reserve,
  type SourceConfig,
  sourceId,
  stage,
  stageRows,
} from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';

const HASH = 'live-content-hash';
const PATCH = { fetched_at: '2026-10-26T00:00:00.000Z', province: null };
const GROUPS = [{ metadata: { fetched_at: '2026-10-26T00:00:00.000Z' }, indexes: null }];

interface RefreshInput {
  patch?: Record<string, unknown>;
  groups?: Array<{ metadata: Record<string, unknown>; indexes: number[] | null }>;
}

function refresh(
  db: Db,
  o: { source: number; token: string; config: SourceConfig } & RefreshInput
) {
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
      JSON.stringify(o.patch ?? PATCH),
      JSON.stringify(o.groups ?? GROUPS),
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

/** A 25-row job with 20 checked rows and one reserved, unstaged batch of 5. */
async function partialJob(db: Db, o: { id: number; token: string; config: SourceConfig }) {
  const job = (await open(db, { source: o.id, token: o.token, config: o.config, rows: chunkRows(25) }))
    .job_id;
  const first = await reserve(db, { job, token: o.token });
  await stage(db, { request: first.request_id, job, token: o.token, rows: stageRows(first.rows) });
  const second = await reserve(db, { job, token: o.token });
  assertEquals(second.rows.length, 5);
  return { job, second };
}

/** Removes the vector of the one live chunk: the live generation needs repair. */
async function needRepair(db: Db, url: string) {
  await db.query(
    `update public.knowledge_chunks set embedding = null
      where document_id = (select id from public.knowledge_documents where source_url = $1)`,
    [url]
  );
}

// Falsifier: a refresh that cannot write live data (false) closes the open job,
// deletes its checked vectors or reservations, or changes its debit.
Deno.test('a false refresh keeps the open job, its checked vectors, reservations and debit', async () => {
  const db = await openQwenIngestDb();
  try {
    // setup's 3-row job is superseded by the different 25-row open.
    const { id, config, token } = await setup(db);
    const { job, second } = await partialJob(db, { id, config, token });
    await needRepair(db, config.url);
    const liveBefore = await live(db, config.url);
    const before = await privateState(db, job);
    assertEquals(before.rows.filter(r => r.embedding !== null).length, 20);
    assertEquals(before.reservations.map(r => r.outcome), ['staged', 'reserved']);
    assertEquals(before.job[0].requests_reserved, 2);

    assertEquals(await refresh(db, { source: id, token, config }), false);

    assertEquals(await privateState(db, job), before, 'the private job is unchanged');
    assertEquals(await live(db, config.url), liveBefore, 'no live row changed');
    // The retained reservation still stages under the same owner, with no new debit.
    await stage(db, { request: second.request_id, job, token, rows: stageRows(second.rows) });
    const after = await privateState(db, job);
    assertEquals(after.rows.filter(r => r.embedding === null).length, 0);
    assertEquals(after.job[0].requests_reserved, 2);
    assertEquals(after.job[0].status, 'open');
  } finally {
    await db.close();
  }
});

// Control: a true refresh still supersedes an obsolete job with checked rows.
Deno.test('a true refresh supersedes an obsolete job and drops its checked rows', async () => {
  const db = await openQwenIngestDb();
  try {
    // setup's 3-row job is superseded by the different 25-row open.
    const { id, config, token } = await setup(db);
    const { job } = await partialJob(db, { id, config, token });

    assertEquals(await refresh(db, { source: id, token, config }), true);

    const after = await privateState(db, job);
    assertEquals(after.job[0].status, 'superseded');
    assertEquals(after.job[0].requests_reserved, 2, 'the debit history stays on the closed job');
    assertEquals(after.rows, []);
    assertEquals(after.reservations, []);
    assertEquals((await live(db, config.url)).documents[0].metadata, PATCH);
  } finally {
    await db.close();
  }
});

// Control: an error inside the live refresh rolls back the whole call.
Deno.test('a refresh that raises after the job lock changes no job and no live row', async () => {
  const db = await openQwenIngestDb();
  try {
    // setup's 3-row job is superseded by the different 25-row open.
    const { id, config, token } = await setup(db);
    const { job } = await partialJob(db, { id, config, token });
    const liveBefore = await live(db, config.url);
    const before = await privateState(db, job);

    await assertRejects(
      () =>
        call(
          db,
          `public.ingest_generation_refresh($1, $2::uuid, $3::jsonb, $4, $5, $6,
             '{}'::jsonb, '[]'::jsonb, 300)`,
          [id, token, JSON.stringify(config), QWEN, CONTRACT, HASH]
        ),
      Error,
      'Chunk metadata groups are required'
    );
    assertEquals(await privateState(db, job), before);
    assertEquals(await live(db, config.url), liveBefore);
  } finally {
    await db.close();
  }
});

/** Metadata whose jsonb text is exactly `bytes` UTF-8 bytes: {"source_url": "..."}. */
function metadataOf(bytes: number, unit = 'a') {
  const pad = bytes - '{"source_url": ""}'.length;
  return { source_url: unit.repeat(pad / new TextEncoder().encode(unit).byteLength) };
}

async function storedChunkBytes(db: Db, url: string) {
  const [row] = await rows<{ bytes: number }>(
    db,
    `select octet_length(kc.metadata::text)::int as bytes from public.knowledge_chunks kc
       join public.knowledge_documents kd on kd.id = kc.document_id where kd.source_url = $1`,
    [url]
  );
  return row.bytes;
}

// Falsifier: SQL forwards a metadata value over 16 KiB (counted in UTF-8 bytes,
// not characters) to the live refresh, or the refusal leaves a partial write,
// supersedes the checked job or changes its rows, reservations or debit.
const OVERSIZED: Array<[string, RefreshInput]> = [
  ['a chunk group (2-byte characters)', { groups: [{ metadata: metadataOf(16_386, 'é'), indexes: null }] }],
  [
    'a later chunk group',
    {
      groups: [
        { metadata: { fetched_at: '2026-10-26T00:00:00.000Z' }, indexes: [0] },
        { metadata: metadataOf(16_385), indexes: [] },
      ],
    },
  ],
  ['the document patch', { patch: metadataOf(16_385) }],
];
for (const [name, input] of OVERSIZED) {
  Deno.test(`SQL refuses ${name} over 16 KiB and changes nothing`, async () => {
    const db = await openQwenIngestDb();
    try {
      // setup's 3-row job is superseded by the different 25-row open.
      const { id, config, token } = await setup(db);
      const { job } = await partialJob(db, { id, config, token });
      const liveBefore = await live(db, config.url);
      const before = await privateState(db, job);
      assertEquals(before.rows.filter(r => r.embedding !== null).length, 20);

      await assertRejects(
        () => refresh(db, { source: id, token, config, ...input }),
        Error,
        'Generation input exceeds a limit'
      );
      assertEquals(await privateState(db, job), before, 'the private job changed');
      assertEquals(await live(db, config.url), liveBefore, 'live data changed');
    } finally {
      await db.close();
    }
  });
}

// Control: a value of exactly 16 KiB is within the limit and is written whole.
Deno.test('SQL accepts chunk metadata and a document patch of exactly 16 KiB', async () => {
  const db = await openQwenIngestDb();
  try {
    const { id, config, token, job } = await setup(db);
    const metadata = metadataOf(16_384);

    assertEquals(
      await refresh(db, {
        source: id,
        token,
        config,
        patch: metadataOf(16_384),
        groups: [{ metadata, indexes: null }],
      }),
      true
    );
    assertEquals(await storedChunkBytes(db, config.url), 16_384);
    assertEquals((await live(db, config.url)).chunks[0].metadata, metadata);
    assertEquals(await jobStatus(db, job), 'superseded');
  } finally {
    await db.close();
  }
});
