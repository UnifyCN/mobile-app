// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The ingest_refresh_generations migration, called directly in SQL in a local
// Postgres (PGlite with pgvector). These tests prove the functions' own checks
// and grants. PGlite runs one statement at a time, so they do not show two
// transactions waiting on a row lock; nor do they prove hosted roles or
// PostgREST dispatch.
import { withReceipt } from './support/embeddingModels.ts';
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ingestSource } from '../functions/ingest-documents/lib/ingest.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { openIngestDb, openQwenIngestDb } from './support/ingestDb.ts';
import {
  applyMigration,
  embedding,
  rows,
  type Db,
} from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const EE_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';

async function eeSourceId(db: Db): Promise<number> {
  const [row] = await rows<{ id: number }>(
    db,
    `select id::int as id from public.crawl_sources where url = $1`,
    [EE_PAGE]
  );
  return row.id;
}

const claim = async (db: Db, id: number) =>
  (
    await rows<{ token: string | null }>(
      db,
      `select public.claim_crawl_source($1, 300)::text as token`,
      [id]
    )
  )[0].token;

function chunkRow(index: number, text = `chunk ${index}`) {
  return {
    chunk_index: index,
    chunk_text: text,
    embedding: JSON.parse(embedding(0.5)),
    metadata: { published_at: '2026-10-20' },
  };
}

const stage = (db: Db, id: number, token: string, chunks: unknown[]) =>
  db.query(
    `select public.stage_knowledge_chunks($1, $2::uuid, $3::jsonb, 300)`,
    [id, token, JSON.stringify(chunks)]
  );

const promote = (
  db: Db,
  id: number,
  token: string,
  count: number,
  hash = 'h1'
) =>
  db.query(
    `select public.promote_knowledge_generation($1, $2::uuid, 'Title', '{"source":"crawler"}'::jsonb, $3, $4, '2026-10-24T00:00:00Z')`,
    [id, token, hash, count]
  );

const visibleChunks = (db: Db) =>
  rows<{ chunk_index: number; chunk_text: string }>(
    db,
    `select chunk_index, chunk_text from public.knowledge_chunks order by chunk_index, id`
  );

// Falsifier: a promotion that trusts any token lets the old owner overwrite
// the new owner's version.
Deno.test(
  'a token replaced by a newer claim can neither stage nor promote',
  async () => {
    const db = await openIngestDb();
    try {
      const id = await eeSourceId(db);
      const old = (await claim(db, id))!;
      await stage(db, id, old, [chunkRow(0, 'old')]);
      assertEquals(await claim(db, id), null, 'a live lease is not taken');
      await db.exec(
        `update public.crawl_source_leases set expires_at = now() - interval '1 second'`
      );
      const fresh = (await claim(db, id))!;
      assert(fresh !== old);

      await assertRejects(
        () => promote(db, id, old, 1),
        Error,
        'Crawl source lease lost'
      );
      await assertRejects(
        () => stage(db, id, old, [chunkRow(1)]),
        Error,
        'Crawl source lease lost'
      );
      assertEquals(await visibleChunks(db), []);
      // The takeover dropped the old owner's staged row.
      assertEquals(
        await rows(
          db,
          `select token::text as token from public.knowledge_chunk_staging`
        ),
        []
      );

      await stage(db, id, fresh, [chunkRow(0, 'new')]);
      await promote(db, id, fresh, 1);
      assertEquals(await visibleChunks(db), [
        { chunk_index: 0, chunk_text: 'new' },
      ]);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: promoting a partial staging set publishes a partial version.
Deno.test(
  'an incomplete or oversized generation is refused and nothing changes',
  async () => {
    const db = await openIngestDb();
    try {
      const id = await eeSourceId(db);
      const first = (await claim(db, id))!;
      await stage(db, id, first, [chunkRow(0, 'kept')]);
      await promote(db, id, first, 1, 'kept');
      await db.query(`select public.release_crawl_source($1, $2::uuid)`, [
        id,
        first,
      ]);

      const token = (await claim(db, id))!;
      await stage(db, id, token, [chunkRow(0), chunkRow(2)]);
      await assertRejects(
        () => promote(db, id, token, 2),
        Error,
        'Staged chunks are incomplete'
      );
      await assertRejects(
        () => promote(db, id, token, 3),
        Error,
        'Staged chunks are incomplete'
      );
      await assertRejects(
        () =>
          stage(
            db,
            id,
            token,
            Array.from({ length: 21 }, (_, i) => chunkRow(10 + i))
          ),
        Error,
        'Stage between 1 and 20 chunks per call'
      );
      await assertRejects(
        () => stage(db, id, token, []),
        Error,
        'Stage between 1 and 20'
      );
      await assertRejects(
        () => stage(db, id, token, [chunkRow(0)]),
        Error,
        'duplicate key'
      );

      assertEquals(await visibleChunks(db), [
        { chunk_index: 0, chunk_text: 'kept' },
      ]);
      assertEquals(
        await rows(db, `select content_hash from public.knowledge_documents`),
        [{ content_hash: 'kept' }]
      );
      // Staged rows are never visible to retrieval.
      assertEquals(
        (
          await rows<{ chunk_text: string }>(
            db,
            `select chunk_text from public.match_chunks($1::vector, 0.1, 10)`,
            [embedding(0.5)]
          )
        ).map(r => r.chunk_text),
        ['kept']
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: an unchanged refresh over a mixed set (left by the reviewed code
// after a failed delete) assigns dates by index across two generations.
Deno.test(
  'an unchanged refresh refuses a mixed set and the next crawl replaces it',
  async () => {
    const db = await openQwenIngestDb();
    try {
      const store = createStore(supabaseHttp(db).client);
      const source = (await store.findEnabledCrawlSourceByUrl(EE_PAGE))!;
      const draw = (n: number) => ({
        drawNumber: String(n),
        drawDate: '2026-10-20',
        drawName: 'Canadian Experience Class',
        drawSize: '1,000',
        drawCRS: '500',
      });
      const body = JSON.stringify({ rounds: [draw(401)] });
      const deps = (at: string) => ({
        store,
        now: () => new Date(at),
        fetchPage: () => Promise.resolve(body),
        embedChecked: withReceipt((texts: string[]) =>
          Promise.resolve(texts.map(() => new Array(1536).fill(0.01)))
        ),
      });
      await ingestSource(source, deps('2026-10-23T00:00:00Z'));
      // The state the reviewed code could leave: an old chunk with the same index.
      await db.exec(`insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding, metadata)
      select document_id, 0, 'stale #400', embedding, metadata from public.knowledge_chunks`);

      const result = await ingestSource(source, deps('2026-10-24T00:00:00Z'));

      assertEquals(result.status, 'success');
      assertEquals(
        (await visibleChunks(db)).map(c => c.chunk_text),
        [
          'Express Entry draw #401 on October 20, 2026: Canadian Experience Class, 1,000 invitations, minimum CRS 500.',
        ]
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a plain update lets an older attempt move the stamp back.
Deno.test('the attempt stamp never moves backwards', async () => {
  const db = await openIngestDb();
  try {
    const id = await eeSourceId(db);
    for (const at of ['2026-10-23T00:05:00Z', '2026-10-23T00:00:00Z']) {
      await db.query(
        `select public.record_crawl_attempt($1, $2::timestamptz)`,
        [id, at]
      );
    }
    assertEquals(
      await rows(
        db,
        `select to_char(last_crawled_at at time zone 'utc', 'HH24:MI') as at from public.crawl_sources where id = $1`,
        [id]
      ),
      [{ at: '00:05' }]
    );
  } finally {
    await db.close();
  }
});

const FUNCTIONS = [
  'claim_crawl_source(bigint,integer)',
  'stage_knowledge_chunks(bigint,uuid,jsonb,integer)',
  'promote_knowledge_generation(bigint,uuid,text,jsonb,text,integer,timestamp with time zone)',
  'refresh_knowledge_metadata(bigint,uuid,text,jsonb,jsonb)',
  'record_crawl_attempt(bigint,timestamp with time zone)',
  'release_crawl_source(bigint,uuid)',
];

// Falsifier: Supabase's default privileges make a new table and function
// usable by anon and authenticated until the migration revokes them.
Deno.test(
  'only service_role can reach the new tables and functions',
  async () => {
    const db = await openIngestDb();
    try {
      for (const table of ['crawl_source_leases', 'knowledge_chunk_staging']) {
        const [row] = await rows<Record<string, boolean>>(
          db,
          `select c.relrowsecurity as rls,
                has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon,
                has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated,
                has_table_privilege('service_role', c.oid, 'select,insert,delete') as service
           from pg_class c where c.oid = ('public.' || $1)::regclass`,
          [table]
        );
        assertEquals(
          row,
          { rls: true, anon: false, authenticated: false, service: true },
          table
        );
        assertEquals(
          await rows(
            db,
            `select policyname from pg_policies where tablename = $1`,
            [table]
          ),
          [],
          `${table} has no policy`
        );
      }
      for (const fn of FUNCTIONS) {
        const [row] = await rows<Record<string, unknown>>(
          db,
          `select has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
                has_function_privilege('service_role', p.oid, 'execute') as service,
                p.prosecdef as definer, p.proconfig as config
           from pg_proc p where p.oid = ('public.' || $1)::regprocedure`,
          [fn]
        );
        assertEquals(
          row,
          {
            anon: false,
            authenticated: false,
            service: true,
            definer: false,
            config: ['search_path=""'],
          },
          fn
        );
      }

      // On Supabase, service_role bypasses row level security and may use the
      // public sequences (default privileges the test baseline does not copy).
      // With those and this migration's grants, the full cycle works.
      await db.exec(`alter role service_role bypassrls;
      grant usage on all sequences in schema public to service_role;`);
      const id = await eeSourceId(db);
      await db.exec(`set role service_role`);
      const token = (await claim(db, id))!;
      await stage(db, id, token, [chunkRow(0)]);
      await promote(db, id, token, 1);
      await db.query(`select public.release_crawl_source($1, $2::uuid)`, [
        id,
        token,
      ]);
      await db.exec(`reset role`);
      assertEquals((await visibleChunks(db)).length, 1);
      assertEquals(
        await rows(
          db,
          `select count(*)::int as n from public.crawl_source_leases`
        ),
        [{ n: 0 }]
      );
    } finally {
      await db.close();
    }
  }
);

Deno.test('the generations migration can run twice', async () => {
  const db = await openIngestDb();
  try {
    await applyMigration(db, 'ingest_refresh_generations');
    const [row] = await rows<{ n: number }>(
      db,
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [FUNCTIONS.map(f => f.slice(0, f.indexOf('(')))]
    );
    // Six names; the Qwen migration adds an explicit-model overload of claim,
    // stage, promote and refresh.
    assertEquals(row.n, 10);
  } finally {
    await db.close();
  }
});
