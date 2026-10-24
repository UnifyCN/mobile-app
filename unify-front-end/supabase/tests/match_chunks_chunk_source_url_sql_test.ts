// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyMigration,
  type Db,
  embedding,
  openBaselineDb,
  rows,
} from './support/sharedDb.ts';

const BEFORE = ['crawl_sources_province', 'match_chunks_province_filter'];

async function migratedDb(withChunkUrl: boolean): Promise<Db> {
  const db = await openBaselineDb();
  for (const slug of BEFORE) await applyMigration(db, slug);
  if (withChunkUrl) await applyMigration(db, 'match_chunks_chunk_source_url');
  return db;
}

interface Hit {
  chunk_text: string;
  knowledge_documents: Record<string, unknown>;
}

const CALLS = [
  'public.match_chunks($1::vector, 0.3, 10)',
  'public.match_chunks($1::vector, 0.3, 10, null)',
  "public.match_chunks($1::vector, 0.3, 10, 'Ontario')",
];

async function hits(db: Db, call: string): Promise<Hit[]> {
  const found = await rows<Hit & { chunk_index: number }>(
    db,
    `select chunk_text, chunk_index, knowledge_documents from ${call}`,
    [embedding(1)]
  );
  return found.sort((a, b) => a.chunk_text.localeCompare(b.chunk_text));
}

async function seedNews(db: Db) {
  const doc = await rows<{ id: number }>(
    db,
    `insert into public.knowledge_documents (title, source_url)
     values ('IRCC Newsroom', 'https://example.test/newsroom') returning id`
  );
  const metadata = [
    {
      published_at: '2026-10-16',
      source_url: 'https://example.test/news/item-a.html',
    },
    {
      published_at: '2026-10-15',
      source_url: 'https://example.test/news/item-b.html',
    },
    { published_at: '2026-10-14' },
  ];
  for (const [i, m] of metadata.entries()) {
    await db.query(
      `insert into public.knowledge_chunks
         (document_id, chunk_index, chunk_text, embedding, metadata)
       values ($1, $2, $3, $4::vector, $5::jsonb)`,
      [doc[0].id, i, `item ${i}`, embedding(1), JSON.stringify(m)]
    );
  }
}

// Falsifier: before the migration the key is missing, not null.
Deno.test(
  'each chunk returns its own item address, and null when it has none',
  async () => {
    const db = await migratedDb(true);
    await seedNews(db);

    for (const call of CALLS) {
      const found = await hits(db, call);
      assertEquals(
        found.map(h => [h.chunk_text, h.knowledge_documents.chunk_source_url]),
        [
          ['item 0', 'https://example.test/news/item-a.html'],
          ['item 1', 'https://example.test/news/item-b.html'],
          ['item 2', null],
        ],
        call
      );
      // The document address is still the page the document came from.
      assertEquals(
        found.map(h => h.knowledge_documents.source_url),
        [
          'https://example.test/newsroom',
          'https://example.test/newsroom',
          'https://example.test/newsroom',
        ],
        call
      );
    }
    await db.close();
  }
);

// Falsifier: a rewrite that changes the document keys, the ranking or the
// count shows here. Only chunk_source_url is added.
Deno.test('nothing else in the result changes', async () => {
  const db = await migratedDb(false);
  await seedNews(db);
  const before = await Promise.all(CALLS.map(call => hits(db, call)));
  await applyMigration(db, 'match_chunks_chunk_source_url');
  const after = await Promise.all(CALLS.map(call => hits(db, call)));

  after.forEach((found, i) => {
    assertEquals(
      found.map(h => h.chunk_text),
      before[i].map(h => h.chunk_text),
      CALLS[i]
    );
    found.forEach((hit, j) => {
      const { chunk_source_url: _added, ...rest } = hit.knowledge_documents;
      assertEquals(rest, before[i][j].knowledge_documents);
      assertEquals(Object.keys(hit.knowledge_documents).sort(), [
        'chunk_source_url',
        'fetched_at',
        'id',
        'published_at',
        'section',
        'source_url',
        'storage_path',
        'subject',
        'title',
        'updated_at',
      ]);
    });
  });
  await db.close();
});

Deno.test(
  'the grants stay with service_role and the migration can run twice',
  async () => {
    const db = await migratedDb(true);
    await applyMigration(db, 'match_chunks_chunk_source_url');

    const access = await rows(
      db,
      `select p.pronargs::int as args, r as role,
            has_function_privilege(r, p.oid, 'execute') as can_execute
       from pg_proc p, unnest(array['anon', 'authenticated', 'service_role']) as r
      where p.proname = 'match_chunks' and p.pronamespace = 'public'::regnamespace
      order by p.pronargs, r`
    );

    assertEquals(
      access.map(a => [a.args, a.role, a.can_execute]),
      [
        [3, 'anon', false],
        [3, 'authenticated', false],
        [3, 'service_role', true],
        [4, 'anon', false],
        [4, 'authenticated', false],
        [4, 'service_role', true],
      ]
    );
    assertEquals(
      await rows(
        db,
        `select count(*)::int as n from pg_proc where proname = 'match_chunks'`
      ),
      [{ n: 2 }]
    );
    await db.close();
  }
);
