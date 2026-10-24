// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Runs the shipped migrations against the shared database as it was before the
// province work (see fixtures/shared_db_before_province.sql), in a local
// Postgres with pgvector. Hosted behaviour is proven separately.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyMigration,
  canadianProvinces,
  type Db,
  embedding,
  openBaselineDb,
  rows,
} from './support/sharedDb.ts';

const MIGRATIONS = ['crawl_sources_province', 'match_chunks_province_filter'];

async function migratedDb(): Promise<Db> {
  const db = await openBaselineDb();
  for (const slug of MIGRATIONS) await applyMigration(db, slug);
  return db;
}

Deno.test('match_chunks keeps the three-argument signature and adds a four-argument overload', async () => {
  const db = await migratedDb();

  const signatures = await rows<{ args: string }>(
    db,
    `select pg_get_function_identity_arguments(oid) as args
       from pg_proc
      where proname = 'match_chunks' and pronamespace = 'public'::regnamespace
      order by pronargs`
  );

  assertEquals(
    signatures.map(s => s.args),
    [
      'query_embedding vector, match_threshold double precision, match_count integer',
      'query_embedding vector, match_threshold double precision, match_count integer, filter_province text',
    ]
  );
  await db.close();
});

interface ChunkSeed {
  text: string;
  /** Chunk metadata as stored. `undefined` stores SQL null. */
  metadata?: Record<string, unknown>;
  weight?: number;
  updatedAt?: string;
}

/** One document per chunk, so a chunk label is also its document label. */
async function seedChunks(db: Db, chunks: ChunkSeed[]): Promise<void> {
  for (const [i, c] of chunks.entries()) {
    const doc = await rows<{ id: number }>(
      db,
      `insert into public.knowledge_documents (title, subject, source_url, updated_at)
       values ($1, 'pr', $2, now()) returning id`,
      [c.text, `https://example.test/doc-${i}`]
    );
    await db.query(
      `insert into public.knowledge_chunks
         (document_id, chunk_index, chunk_text, embedding, metadata, updated_at)
       values ($1, 0, $2, $3::vector, $4::jsonb, coalesce($5::timestamptz, now()))`,
      [
        doc[0].id,
        c.text,
        embedding(c.weight ?? 1),
        c.metadata === undefined ? null : JSON.stringify(c.metadata),
        c.updatedAt ?? null,
      ]
    );
  }
}

const QUERY = embedding(1);

/** `call` reads the query vector as $1. */
async function texts(db: Db, call: string): Promise<string[]> {
  const found = await rows<{ chunk_text: string }>(
    db,
    `select chunk_text from ${call} order by chunk_text`,
    [QUERY]
  );
  return found.map(r => r.chunk_text);
}

const SAME_VECTOR_CHUNKS: ChunkSeed[] = [
  { text: 'national', metadata: { source: 'crawler' } },
  { text: 'national-no-metadata' },
  { text: 'national-json-null', metadata: { province: null } },
  { text: 'ontario', metadata: { province: 'Ontario' } },
  { text: 'bc', metadata: { province: 'British Columbia' } },
];

// Falsifier: with no filter, the Ontario and BC chunks come back for a null province.
Deno.test('a null province returns national chunks only', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);

  const found = await texts(
    db,
    `public.match_chunks($1::vector, 0.3, 10, null)`
  );

  assertEquals(found, ['national', 'national-json-null', 'national-no-metadata']);
  await db.close();
});

// Falsifier: a filter that returns every province, or only the province chunks,
// breaks one of the two halves of this list.
Deno.test('Ontario returns national chunks plus Ontario, and never British Columbia', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);

  const found = await texts(
    db,
    `public.match_chunks($1::vector, 0.3, 10, 'Ontario')`
  );

  assertEquals(found, [
    'national',
    'national-json-null',
    'national-no-metadata',
    'ontario',
  ]);
  await db.close();
});

// Falsifier: an exact-match-only filter returns the Atlantis chunk for 'Atlantis',
// and a case-insensitive one returns the Ontario chunk for 'ontario' or 'ON'.
Deno.test('a filter that is not one of the 13 names behaves as null', async () => {
  const db = await migratedDb();
  await seedChunks(db, [
    ...SAME_VECTOR_CHUNKS,
    { text: 'atlantis', metadata: { province: 'Atlantis' } },
    { text: 'empty-province', metadata: { province: '' } },
  ]);

  const results: Record<string, string[]> = {};
  for (const bad of ['Atlantis', 'ontario', 'ON', '', ' Ontario', 'Ontario ']) {
    results[bad] = await texts(
      db,
      `public.match_chunks($1::vector, 0.3, 10, '${bad}')`
    );
  }

  const national = ['national', 'national-json-null', 'national-no-metadata'];
  for (const [bad, found] of Object.entries(results)) {
    assertEquals(found, national, `filter ${JSON.stringify(bad)}`);
  }
  await db.close();
});

// Falsifier: a filter that leaks a neighbour shows up as an extra name in one
// of the 13 results. It also fails if the function list and the constraint
// list differ, because a name the function rejects returns national only.
Deno.test('each of the 13 provinces returns national chunks plus its own', async () => {
  const names = await canadianProvinces();
  const db = await migratedDb();
  await seedChunks(db, [
    { text: 'national' },
    ...names.map(name => ({ text: `chunk ${name}`, metadata: { province: name } })),
  ]);

  const results: Record<string, string[]> = {};
  for (const name of names) {
    results[name] = await texts(
      db,
      `public.match_chunks($1::vector, 0.3, 20, '${name}')`
    );
  }

  for (const name of names) {
    assertEquals(results[name], ['national', `chunk ${name}`].sort(), name);
  }
  await db.close();
});

// Falsifier: while the three-argument function ignores province, every old
// caller receives Ontario and BC chunks.
Deno.test('the legacy three-argument call returns national chunks only', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);
  const national = ['national', 'national-json-null', 'national-no-metadata'];

  const calls = [
    `public.match_chunks($1::vector, 0.3, 10)`,
    `public.match_chunks(query_embedding => $1::vector, match_threshold => 0.3, match_count => 10)`,
    // The old defaults are 0.5 for the threshold and 5 for the count.
    `public.match_chunks($1::vector, 0.3)`,
    `public.match_chunks($1::vector)`,
    `public.match_chunks(query_embedding => $1::vector)`,
  ];

  for (const call of calls) assertEquals(await texts(db, call), national, call);
  await db.close();
});

// Falsifier: a filter applied after the limit takes the best chunk (BC), drops
// it, and returns nothing. A count of 1 must still return the best chunk that
// is allowed for the caller.
Deno.test('the province filter applies before the count limit', async () => {
  const db = await migratedDb();
  await seedChunks(db, [
    { text: 'bc-best', weight: 1, metadata: { province: 'British Columbia' } },
    { text: 'bc-second', weight: 0.99, metadata: { province: 'British Columbia' } },
    { text: 'ontario-third', weight: 0.9, metadata: { province: 'Ontario' } },
    { text: 'national-fourth', weight: 0.8 },
  ]);

  assertEquals(
    await texts(db, `public.match_chunks($1::vector, 0.3, 1, 'Ontario')`),
    ['ontario-third']
  );
  assertEquals(
    await texts(db, `public.match_chunks($1::vector, 0.3, 1, null)`),
    ['national-fourth']
  );
  assertEquals(
    await texts(db, `public.match_chunks($1::vector, 0.3, 2, 'Ontario')`),
    ['national-fourth', 'ontario-third']
  );
  await db.close();
});

interface Match {
  id: number;
  document_id: number;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
  knowledge_documents: Record<string, unknown>;
}

const HOSTED_DOCUMENT_KEYS = [
  'id',
  'title',
  'storage_path',
  'subject',
  'section',
  'source_url',
  'updated_at',
];

function onlyHostedKeys(match: Match) {
  return {
    ...match,
    knowledge_documents: Object.fromEntries(
      HOSTED_DOCUMENT_KEYS.map(k => [k, match.knowledge_documents[k]])
    ),
  };
}

async function matches(db: Db, call: string): Promise<Match[]> {
  return await rows<Match>(db, `select * from ${call}`, [QUERY]);
}

// Falsifier: the expected results come from the hosted function itself, run
// before the migration. Any change to the 0.85 / 0.15 weights, the 180-day
// recency window, the threshold test or the count changes the order or the
// similarity values below.
Deno.test('ranking, threshold and count match the hosted function on national data', async () => {
  const db = await openBaselineDb();
  const day = (n: number) => `now() - interval '${n} days'`;
  const weights = [1, 0.95, 0.9, 0.8, 0.7, 0.55, 0.4, 0.32, 0.2];
  const ages = [0, 150, 10, 200, 40, 90, 0, 365, 5];
  for (const [i, w] of weights.entries()) {
    const doc = await rows<{ id: number }>(
      db,
      `insert into public.knowledge_documents (title, source_url)
       values ($1, $2) returning id`,
      [`doc ${i}`, `https://example.test/${i}`]
    );
    await db.query(
      `insert into public.knowledge_chunks
         (document_id, chunk_index, chunk_text, embedding, metadata, updated_at)
       values ($1, 0, $2, $3::vector, '{"source":"crawler"}', ${day(ages[i])})`,
      [doc[0].id, `chunk ${i}`, embedding(w)]
    );
  }
  // A chunk without an embedding never matches.
  const noEmbedding = await rows<{ id: number }>(
    db,
    `insert into public.knowledge_documents (title) values ('no embedding') returning id`
  );
  await db.query(
    `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text)
     values ($1, 0, 'no embedding')`,
    [noEmbedding[0].id]
  );
  const calls = [];
  for (const threshold of [0.5, 0.3, 0, -1]) {
    for (const count of [1, 3, 10]) calls.push([threshold, count]);
  }
  const expected = new Map<string, Match[]>();
  for (const [t, c] of calls) {
    expected.set(`${t}/${c}`, await matches(db, `public.match_chunks($1::vector, ${t}, ${c})`));
  }
  assertEquals(expected.get('0/10')!.length, 9);
  assertEquals(expected.get('0.3/10')!.length, 8);
  assertEquals(expected.get('0.5/10')!.length, 6);

  for (const slug of MIGRATIONS) await applyMigration(db, slug);

  for (const [t, c] of calls) {
    const want = expected.get(`${t}/${c}`)!;
    for (const call of [
      `public.match_chunks($1::vector, ${t}, ${c})`,
      `public.match_chunks($1::vector, ${t}, ${c}, null)`,
    ]) {
      const got = (await matches(db, call)).map(onlyHostedKeys);
      assertEquals(
        got.map(m => [m.id, m.chunk_text]),
        want.map(m => [m.id, m.chunk_text]),
        call
      );
      got.forEach((m, i) => {
        // The recency term uses now(), which moves by milliseconds between runs.
        assertEquals(Math.abs(m.similarity - want[i].similarity) < 1e-6, true, call);
        assertEquals(m.knowledge_documents, onlyHostedKeys(want[i]).knowledge_documents);
      });
    }
  }
  await db.close();
});

// Falsifier: today the JSON has only the seven hosted keys. A document-level
// date (the second chunk shares the first chunk's document) would give both
// chunks the same date.
Deno.test('the returned document JSON carries each chunk\'s own published_at and fetched_at', async () => {
  const db = await migratedDb();
  const doc = await rows<{ id: number }>(
    db,
    `insert into public.knowledge_documents (title, source_url)
     values ('IRCC draws', 'https://example.test/draws') returning id`
  );
  const metadata = [
    { published_at: '2026-10-20', fetched_at: '2026-10-23T12:00:00.000Z' },
    { published_at: '2026-10-09', fetched_at: '2026-10-23T12:00:00.000Z' },
    undefined,
  ];
  for (const [i, m] of metadata.entries()) {
    await db.query(
      `insert into public.knowledge_chunks
         (document_id, chunk_index, chunk_text, embedding, metadata)
       values ($1, $2, $3, $4::vector, $5::jsonb)`,
      [doc[0].id, i, `chunk ${i}`, embedding(1), m ? JSON.stringify(m) : null]
    );
  }

  for (const call of [
    `public.match_chunks($1::vector, 0.3, 10)`,
    `public.match_chunks($1::vector, 0.3, 10, null)`,
  ]) {
    const found = (await matches(db, call)).sort((a, b) => a.chunk_index - b.chunk_index);
    assertEquals(
      found.map(m => Object.keys(m.knowledge_documents).sort()),
      found.map(() => [...HOSTED_DOCUMENT_KEYS, 'published_at', 'fetched_at'].sort()),
      call
    );
    assertEquals(
      found.map(m => [m.knowledge_documents.published_at, m.knowledge_documents.fetched_at]),
      [
        ['2026-10-20', '2026-10-23T12:00:00.000Z'],
        ['2026-10-09', '2026-10-23T12:00:00.000Z'],
        [null, null],
      ],
      call
    );
  }
  await db.close();
});

// Falsifier: a new function gets execute for public, anon and authenticated
// from the default privileges (the baseline sets them as Supabase does), so a
// migration that forgets the revoke fails here. A caller outside service_role
// could otherwise read the knowledge base.
Deno.test('both signatures are executable by service_role only', async () => {
  const db = await migratedDb();

  const access = await rows<Record<string, unknown>>(
    db,
    `select p.oid::regprocedure::text as signature,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
            has_function_privilege('service_role', p.oid, 'execute') as service_role,
            exists (
              select 1 from aclexplode(p.proacl) a where a.grantee = 0
            ) as public_grant
       from pg_proc p
      where p.proname = 'match_chunks' and p.pronamespace = 'public'::regnamespace
      order by p.pronargs`
  );

  assertEquals(access, [
    {
      signature: 'match_chunks(vector,double precision,integer)',
      anon: false,
      authenticated: false,
      service_role: true,
      public_grant: false,
    },
    {
      signature: 'match_chunks(vector,double precision,integer,text)',
      anon: false,
      authenticated: false,
      service_role: true,
      public_grant: false,
    },
  ]);
  await db.close();
});

// Falsifier: a changed OUT column list or type changes this string, and every
// consumer of the table result (rag-query) would break.
Deno.test('both overloads return the hosted table contract', async () => {
  const hosted = await openBaselineDb();
  const [{ result: before }] = await rows<{ result: string }>(
    hosted,
    `select pg_get_function_result('public.match_chunks(vector,double precision,integer)'::regprocedure) as result`
  );
  await hosted.close();
  const db = await migratedDb();

  const after = await rows<{ result: string }>(
    db,
    `select pg_get_function_result(p.oid) as result
       from pg_proc p
      where p.proname = 'match_chunks' and p.pronamespace = 'public'::regnamespace`
  );

  assertEquals(before, 'TABLE(id bigint, document_id bigint, chunk_index integer, chunk_text text, similarity double precision, knowledge_documents jsonb)');
  assertEquals(after.map(r => r.result), [before, before]);
  await db.close();
});

// Falsifier: a default on filter_province makes the legacy and the new function
// both match a three-argument call (SQLSTATE 42725). The count of defaults is
// the cause, so it is asserted next to the observable resolution.
Deno.test('the four-argument overload has no defaults and the legacy one keeps both', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);

  const defaults = await rows<{ pronargs: number; pronargdefaults: number }>(
    db,
    `select pronargs::int, pronargdefaults::int from pg_proc
      where proname = 'match_chunks' and pronamespace = 'public'::regnamespace
      order by pronargs`
  );
  assertEquals(defaults, [
    { pronargs: 3, pronargdefaults: 2 },
    { pronargs: 4, pronargdefaults: 0 },
  ]);
  // A call that omits the fourth argument resolves to the legacy function, not 42725.
  assertEquals(
    await texts(db, `public.match_chunks($1::vector, 0.3, 10)`),
    ['national', 'national-json-null', 'national-no-metadata']
  );
  await db.close();
});

// PostgREST calls a function by argument name, converting each JSON value to
// the declared type, and chooses the overload from the set of names in the
// request body. This emulates that call shape with json_to_record. It does not
// replace a check against hosted PostgREST.
Deno.test('named-argument calls resolve to the right overload', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);
  const body = (extra: Record<string, unknown>) =>
    JSON.stringify({ query_embedding: QUERY, match_threshold: 0.3, match_count: 10, ...extra });

  const threeNames = await rows<{ chunk_text: string }>(
    db,
    `select m.chunk_text from json_to_record($1::json) as a(query_embedding text, match_threshold text, match_count text),
       lateral public.match_chunks(
         query_embedding := a.query_embedding::vector,
         match_threshold := a.match_threshold::double precision,
         match_count := a.match_count::integer) m
     order by 1`,
    [body({})]
  );
  const fourNamesOntario = await rows<{ chunk_text: string }>(
    db,
    `select m.chunk_text from json_to_record($1::json) as a(query_embedding text, match_threshold text, match_count text, filter_province text),
       lateral public.match_chunks(
         query_embedding := a.query_embedding::vector,
         match_threshold := a.match_threshold::double precision,
         match_count := a.match_count::integer,
         filter_province := a.filter_province) m
     order by 1`,
    [body({ filter_province: 'Ontario' })]
  );
  const fourNamesNull = await rows<{ chunk_text: string }>(
    db,
    `select m.chunk_text from json_to_record($1::json) as a(query_embedding text, match_threshold text, match_count text, filter_province text),
       lateral public.match_chunks(
         query_embedding := a.query_embedding::vector,
         match_threshold := a.match_threshold::double precision,
         match_count := a.match_count::integer,
         filter_province := a.filter_province) m
     order by 1`,
    [body({ filter_province: null })]
  );

  const national = ['national', 'national-json-null', 'national-no-metadata'];
  assertEquals(threeNames.map(r => r.chunk_text), national);
  assertEquals(fourNamesNull.map(r => r.chunk_text), national);
  assertEquals(fourNamesOntario.map(r => r.chunk_text), [...national, 'ontario']);
  await db.close();
});

// Falsifier: a function that failed to run for service_role (for example a
// missing schema grant) fails here; anon must be refused before any row is read.
Deno.test('service_role can call both signatures and anon is refused', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);

  await db.exec('set role service_role');
  const three = await texts(db, `public.match_chunks($1::vector, 0.3, 10)`);
  const four = await texts(db, `public.match_chunks($1::vector, 0.3, 10, 'Ontario')`);
  await db.exec('reset role');
  await db.exec('set role anon');
  const refused: Array<string | undefined> = [];
  for (const call of [
    `public.match_chunks($1::vector, 0.3, 10)`,
    `public.match_chunks($1::vector, 0.3, 10, null)`,
  ]) {
    try {
      await texts(db, call);
      refused.push(undefined);
    } catch (error) {
      refused.push((error as { code?: string }).code);
    }
  }
  await db.exec('reset role');

  assertEquals(three.length, 3);
  assertEquals(four.length, 4);
  // 42501 is insufficient_privilege.
  assertEquals(refused, ['42501', '42501']);
  await db.close();
});

// Falsifier: a create (not create or replace) or a non-idempotent revoke fails
// when the migration is applied a second time.
Deno.test('the match_chunks migration can run twice', async () => {
  const db = await migratedDb();
  await seedChunks(db, SAME_VECTOR_CHUNKS);

  await applyMigration(db, 'match_chunks_province_filter');

  assertEquals(
    await texts(db, `public.match_chunks($1::vector, 0.3, 10, 'Ontario')`),
    ['national', 'national-json-null', 'national-no-metadata', 'ontario']
  );
  assertEquals(
    (await rows(db, `select 1 from pg_proc where proname = 'match_chunks'`)).length,
    2
  );
  await db.close();
});
