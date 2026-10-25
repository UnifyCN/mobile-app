// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Privileges and call dispatch of qwen_embedding_model_guards. The roles come
// from the baseline fixture, which mirrors Supabase's default privileges: a new
// function is callable by anon and authenticated until the migration revokes
// it. The shim picks a function overload by the exact set of named arguments,
// as PostgREST does; it is not PostgREST, so hosted dispatch, roles and RLS
// still need the checks in the runbook.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openIngestDb } from './support/ingestDb.ts';
import { LEGACY, QWEN } from './support/embeddingModels.ts';
import { postgrestShim } from './support/postgrestShim.ts';
import { embedding, rows } from './support/sharedDb.ts';

const FUNCTIONS = [
  'match_chunks(vector, double precision, integer, text, text)',
  'match_chunks(vector, double precision, integer, text)',
  'match_chunks(vector, double precision, integer)',
  'claim_crawl_source(bigint, integer)',
  'stage_knowledge_chunks(bigint, uuid, jsonb, integer)',
  'stage_knowledge_chunks(bigint, uuid, jsonb, integer, text)',
  'promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz)',
  'promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz, text)',
  'refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb)',
  'refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb, text)',
  'record_crawl_attempt(bigint, timestamptz)',
  'release_crawl_source(bigint, uuid)',
  'knowledge_embedding_begin(text, text)',
  'knowledge_embedding_acquire_worker(uuid, integer)',
  'knowledge_embedding_release_worker(uuid, uuid)',
  'knowledge_embedding_next_batch(uuid, uuid, integer, integer)',
  'knowledge_embedding_stage_batch(uuid, uuid, text, text, jsonb, integer)',
  'knowledge_embedding_activate(uuid, uuid)',
  'knowledge_embedding_abort(uuid)',
  'knowledge_embedding_enable_writers()',
  'knowledge_embedding_rollback()',
  'knowledge_embedding_return_to_qwen()',
  'knowledge_embedding_status()',
];

// Falsifier: a function without an explicit revoke is executable by anon and
// authenticated through the default privileges of the public schema.
Deno.test(
  'every function and overload is executable by the service role only',
  async () => {
    const db = await openIngestDb();
    try {
      for (const signature of FUNCTIONS) {
        const [row] = await rows<Record<string, boolean>>(
          db,
          `select has_function_privilege('service_role', 'public.${signature}', 'execute') as service_role,
                has_function_privilege('anon', 'public.${signature}', 'execute') as anon,
                has_function_privilege('authenticated', 'public.${signature}', 'execute') as authenticated,
                has_function_privilege('public', 'public.${signature}', 'execute') as public`
        );
        assertEquals(
          row,
          {
            service_role: true,
            anon: false,
            authenticated: false,
            public: false,
          },
          signature
        );
      }
      // No function the migration added escapes the list above.
      const listed = await rows<{ proname: string }>(
        db,
        `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'knowledge_embedding\\_%'`
      );
      assertEquals(
        listed.map(r => r.proname).sort(),
        [
          ...new Set(
            FUNCTIONS.filter(f => f.startsWith('knowledge_embedding')).map(
              f => f.split('(')[0]
            )
          ),
        ].sort()
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a table readable by a client role leaks the full corpus snapshot
// and lets a client move the serving pointer.
Deno.test(
  'the new tables have row level security and service-role-only privileges',
  async () => {
    const db = await openIngestDb();
    try {
      for (const table of [
        'knowledge_embedding_cutover',
        'knowledge_embedding_rebuild_rows',
      ]) {
        const [row] = await rows<Record<string, boolean>>(
          db,
          `select c.relrowsecurity as rls,
                has_table_privilege('service_role', c.oid, 'select, insert, update, delete') as service_role,
                has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') as anon,
                has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete') as authenticated,
                has_table_privilege('public', c.oid, 'select') as public
           from pg_class c where c.oid = ('public.' || $1)::regclass`,
          [table]
        );
        assertEquals(
          row,
          {
            rls: true,
            service_role: true,
            anon: false,
            authenticated: false,
            public: false,
          },
          table
        );
      }
      const [policies] = await rows<{ n: number }>(
        db,
        `select count(*)::int as n from pg_policies where tablename in ('knowledge_embedding_cutover', 'knowledge_embedding_rebuild_rows')`
      );
      assertEquals(policies.n, 0);
    } finally {
      await db.close();
    }
  }
);

// Falsifier: if the legacy and the explicit-model calls resolve to the same
// function, an old writer would reach the new guard (or skip it).
Deno.test(
  'named arguments resolve the old signatures to wrappers and the new ones to the overloads',
  async () => {
    const db = await openIngestDb();
    try {
      const { client } = postgrestShim(db);
      const [{ id }] = await rows<{ id: number }>(
        db,
        `select id::int as id from public.crawl_sources where source_kind = 'html' order by id limit 1`
      );
      const token = (
        await client.rpc('claim_crawl_source', {
          p_source_id: id,
          p_lease_seconds: 300,
        })
      ).data as string;
      const row = {
        chunk_index: 0,
        chunk_text: 't',
        embedding: JSON.parse(embedding(0.5)),
      };
      const base = {
        p_source_id: id,
        p_token: token,
        p_rows: [row],
        p_lease_seconds: 300,
      };

      // Serving legacy: the old signature stages; the new one with Qwen is refused.
      assertEquals(
        (await client.rpc('stage_knowledge_chunks', base)).error,
        null
      );
      const refused = await client.rpc('stage_knowledge_chunks', {
        ...base,
        p_embedding_model: QWEN,
      });
      assert(
        String(refused.error?.message).includes('is not the serving model')
      );
      assertEquals(
        (
          await client.rpc('stage_knowledge_chunks', {
            ...base,
            p_rows: [{ ...row, chunk_index: 1 }],
            p_embedding_model: LEGACY,
          })
        ).error,
        null
      );
      // An argument set that matches no overload is not found.
      const unknown = await client.rpc('stage_knowledge_chunks', {
        ...base,
        p_extra: 1,
      });
      assertEquals(unknown.error?.code, 'PGRST202');

      const promoteBase = {
        p_source_id: id,
        p_token: token,
        p_title: 't',
        p_metadata: {},
        p_content_hash: 'h',
        p_chunk_count: 3,
        p_updated_at: '2026-10-25T00:00:00Z',
      };
      assert(
        String(
          (
            await client.rpc('promote_knowledge_generation', {
              ...promoteBase,
              p_embedding_model: QWEN,
            })
          ).error?.message
        ).includes('is not the serving model')
      );
      assert(
        String(
          (await client.rpc('promote_knowledge_generation', promoteBase)).error
            ?.message
        ).includes('incomplete')
      );

      const refreshBase = {
        p_source_id: id,
        p_token: token,
        p_content_hash: 'h',
        p_document_patch: {},
        p_chunk_groups: [{ metadata: {}, indexes: null }],
      };
      assertEquals(
        (await client.rpc('refresh_knowledge_metadata', refreshBase)).data,
        false
      );
      assert(
        String(
          (
            await client.rpc('refresh_knowledge_metadata', {
              ...refreshBase,
              p_embedding_model: QWEN,
            })
          ).error?.message
        ).includes('is not the serving model')
      );

      // match_chunks returns a table, which the shim does not model, so its
      // overloads are called with named arguments in SQL, as PostgREST would.
      const named = (args: string) =>
        db.query(
          `select * from public.match_chunks(${args.replaceAll('$2', `'${LEGACY}'`)})`,
          [embedding(0.5)]
        );
      const q =
        'query_embedding => $1::vector, match_threshold => 0.3, match_count => 5';
      await named(q);
      await named(`${q}, filter_province => null`);
      await named(`${q}, filter_province => null, query_embedding_model => $2`);
      // The model is required, and an argument set that matches nothing fails.
      await assertRejects(
        () =>
          named(`${q}, filter_province => null, query_embedding_model => null`),
        Error,
        'Name the embedding model'
      );
      await assertRejects(
        () => named(`${q}, query_embedding_model => $2`),
        Error,
        'does not exist'
      );
    } finally {
      await db.close();
    }
  }
);
