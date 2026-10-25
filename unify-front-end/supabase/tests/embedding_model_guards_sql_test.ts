// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The qwen_embedding_model_guards migration, run for real in a local Postgres
// (PGlite with pgvector). Both embedding models get identical-looking
// 1536-coordinate vectors, so the vector length cannot act as the guard: only
// the stored model identity separates the corpora. PGlite runs one statement at
// a time, so these tests do not show two transactions waiting on a lock, and
// they do not prove hosted roles or PostgREST dispatch.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { INGEST_RELEASE_ORDER, openIngestDb } from './support/ingestDb.ts';
import {
  LEGACY,
  QWEN,
  seedChunk,
  setControl,
} from './support/embeddingModels.ts';
import {
  applyMigration,
  embedding,
  rows,
  type Db,
} from './support/sharedDb.ts';

/** Same rows, order and fields; scores may differ by the clock between calls. */
function assertSameResult(
  actual: Record<string, unknown>[],
  expected: Record<string, unknown>[]
) {
  const strip = (r: Record<string, unknown>) => ({ ...r, similarity: 0 });
  assertEquals(actual.map(strip), expected.map(strip));
  actual.forEach((row, i) =>
    assert(
      Math.abs(
        (row.similarity as number) - (expected[i].similarity as number)
      ) < 1e-6
    )
  );
}

const search = (db: Db, model: string | null, args = '0.3, 10, null') =>
  rows<{ id: number; chunk_text: string }>(
    db,
    `select id::int as id, chunk_text from public.match_chunks($1::vector, ${args}, $2)`,
    [embedding(0.9), model]
  );

// Falsifier: the old function ranks every non-null embedding, so a Qwen query
// returns the OpenAI chunk (and the reverse) as soon as both exist.
Deno.test(
  'a query only retrieves chunks embedded with its own model, in every phase',
  async () => {
    const db = await openIngestDb();
    try {
      await seedChunk(db, {
        url: 'https://a.test/legacy',
        text: 'legacy chunk',
      });
      await seedChunk(db, {
        url: 'https://a.test/qwen',
        text: 'qwen chunk',
        model: QWEN,
      });

      for (const [phase, serving] of [
        ['legacy', LEGACY],
        ['rebuilding', LEGACY],
      ]) {
        await setControl(db, phase, serving);
        assertEquals(
          (await search(db, LEGACY)).map(r => r.chunk_text),
          ['legacy chunk'],
          phase
        );
        assertEquals(
          await search(db, QWEN),
          [],
          `${phase}: a Qwen query gets nothing`
        );
      }

      await setControl(db, 'qwen', QWEN);
      assertEquals(
        (await search(db, QWEN)).map(r => r.chunk_text),
        ['qwen chunk']
      );
      assertEquals(
        await search(db, LEGACY),
        [],
        'qwen: an OpenAI query gets nothing'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a document labelled with another model than its chunk must not
// leak the chunk, and a null model request must not match anything.
Deno.test(
  'a chunk needs a matching document, and the request must name a model',
  async () => {
    const db = await openIngestDb();
    try {
      await seedChunk(db, {
        url: 'https://a.test/mixed',
        text: 'mixed',
        model: QWEN,
        documentModel: LEGACY,
      });
      // And the reverse: a Qwen document label over a legacy chunk.
      await seedChunk(db, {
        url: 'https://a.test/mixed-reverse',
        text: 'mixed reverse',
        model: LEGACY,
        documentModel: QWEN,
      });
      await setControl(db, 'qwen', QWEN);
      assertEquals(await search(db, QWEN), []);
      await assertRejects(
        () => search(db, null),
        Error,
        'Name the embedding model'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a query vector that is zero or the wrong length gives meaningless
// scores; the SQL boundary refuses it as well as the HTTP adapter.
Deno.test(
  'the SQL boundary refuses a zero or shortened query vector',
  async () => {
    const db = await openIngestDb();
    try {
      await setControl(db, 'qwen', QWEN);
      const zero = `[${new Array(1536).fill(0).join(',')}]`;
      await assertRejects(
        () =>
          db.query(
            `select * from public.match_chunks($1::vector, 0.3, 10, null, $2)`,
            [zero, QWEN]
          ),
        Error,
        'query vector'
      );
      await assertRejects(
        () =>
          db.query(
            `select * from public.match_chunks('[1,2,3]'::vector, 0.3, 10, null, $1)`,
            [QWEN]
          ),
        Error,
        'query vector'
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: the legacy three- and four-argument calls must keep their result
// (ranking, dates, province, threshold, count) and must never address the
// serving model: after Qwen goes live they return nothing.
Deno.test(
  'the legacy signatures keep the pre-migration result and never read Qwen rows',
  async () => {
    const db = await openIngestDb(
      INGEST_RELEASE_ORDER.slice(
        0,
        INGEST_RELEASE_ORDER.indexOf('qwen_embedding_model_guards')
      )
    );
    try {
      const seed = async (
        url: string,
        text: string,
        w: number,
        meta: object
      ) => {
        const [d] = await rows<{ id: number }>(
          db,
          `insert into public.knowledge_documents (title, storage_path, source_url, updated_at)
         values ($1, '', $2, '2026-10-02T00:00:00Z') returning id::int as id`,
          [url, url]
        );
        await db.query(
          `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding, metadata, updated_at)
         values ($1, 0, $2, $3::vector, $4::jsonb, '2026-10-05T00:00:00Z')`,
          [d.id, text, embedding(w), JSON.stringify(meta)]
        );
      };
      await seed('https://a.test/1', 'national', 0.95, {
        published_at: '2026-09-01',
        fetched_at: '2026-10-01T00:00:00Z',
        source_url: 'https://item.test/1',
      });
      await seed('https://a.test/2', 'ontario', 0.9, { province: 'Ontario' });
      await seed('https://a.test/3', 'bc', 0.99, {
        province: 'British Columbia',
      });
      await seed('https://a.test/4', 'weak', 0.1, {});

      const old3 = await rows(
        db,
        `select * from public.match_chunks($1::vector, 0.3, 10)`,
        [embedding(0.9)]
      );
      const old4 = await rows(
        db,
        `select * from public.match_chunks($1::vector, 0.3, 10, 'Ontario')`,
        [embedding(0.9)]
      );
      assert(old3.length >= 1 && old4.length >= 2);

      await applyMigration(db, 'qwen_embedding_model_guards');

      assertSameResult(
        await rows(
          db,
          `select * from public.match_chunks($1::vector, 0.3, 10)`,
          [embedding(0.9)]
        ),
        old3
      );
      assertSameResult(
        await rows(
          db,
          `select * from public.match_chunks($1::vector, 0.3, 10, 'Ontario')`,
          [embedding(0.9)]
        ),
        old4
      );
      assertSameResult(
        await rows(
          db,
          `select * from public.match_chunks($1::vector, 0.3, 10, 'Ontario', $2)`,
          [embedding(0.9), LEGACY]
        ),
        old4
      );

      await setControl(db, 'qwen', QWEN);
      assertEquals(
        await rows(
          db,
          `select * from public.match_chunks($1::vector, 0.3, 10)`,
          [embedding(0.9)]
        ),
        []
      );
      assertEquals(
        await rows(
          db,
          `select * from public.match_chunks($1::vector, 0.3, 10, 'Ontario')`,
          [embedding(0.9)]
        ),
        []
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a migration that fails on a second run cannot be applied again
// after an interrupted deploy. Control state and the rebuild tables stay as
// they are.
Deno.test(
  'the migration can run twice and keeps the control state',
  async () => {
    const db = await openIngestDb();
    try {
      await seedChunk(db, {
        url: 'https://a.test/q',
        text: 'qwen',
        model: QWEN,
      });
      await setControl(db, 'qwen', QWEN);
      await db.exec(
        `update public.knowledge_embedding_cutover set writers_paused = true`
      );

      await applyMigration(db, 'qwen_embedding_model_guards');

      assertEquals(
        await rows(
          db,
          `select phase, serving_model, writers_paused from public.knowledge_embedding_cutover`
        ),
        [{ phase: 'qwen', serving_model: QWEN, writers_paused: true }]
      );
      assertEquals(
        (await search(db, QWEN)).map(r => r.chunk_text),
        ['qwen']
      );
    } finally {
      await db.close();
    }
  }
);
