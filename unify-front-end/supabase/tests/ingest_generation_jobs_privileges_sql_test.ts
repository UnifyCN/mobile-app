// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// Privileges of ingest_generation_jobs: the three private tables and every new
// function are for the service role only. The roles come from the baseline
// fixture, which mirrors Supabase's default privileges, so a function the
// migration forgets to revoke is callable by anon and authenticated. This is
// not hosted PostgREST: hosted roles still need the runbook's read-only check.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openIngestDb } from './support/ingestDb.ts';
import { rows } from './support/sharedDb.ts';

export const GENERATION_FUNCTIONS = [
  'ingest_generation_open(uuid, bigint, uuid, jsonb, text, text, text, text, jsonb, timestamptz, jsonb, integer)',
  'ingest_generation_begin_service(uuid, uuid, text, text, integer)',
  'ingest_generation_reserve(uuid, uuid, uuid, text, text, integer)',
  'ingest_generation_stage(uuid, uuid, uuid, text, text, jsonb, jsonb, integer)',
  'ingest_generation_promote(uuid, uuid, text, text, integer, integer)',
  'ingest_generation_reject(uuid, uuid, uuid, text, text, text, integer)',
  'ingest_generation_supersede(bigint, uuid, text, text, integer)',
  'ingest_generation_retire(uuid)',
  'ingest_generation_list_open()',
  'ingest_generation_status(uuid, uuid, uuid)',
  'ingest_generation_summary(uuid)',
  'ingest_generation_source_config(bigint)',
  'ingest_generation_lock_writer(bigint, uuid, text, text, integer)',
  'ingest_generation_lock_job(uuid, text, text)',
  'ingest_generation_job_source(uuid)',
  'ingest_generation_close(uuid, text, text, text, integer)',
];

// Falsifier: a function without an explicit revoke is executable by anon and
// authenticated through the public schema's default privileges.
Deno.test(
  'every generation function is executable by the service role only',
  async () => {
    const db = await openIngestDb();
    try {
      for (const signature of GENERATION_FUNCTIONS) {
        const [row] = await rows<Record<string, boolean>>(
          db,
          `select has_function_privilege('service_role', 'public.${signature}', 'execute') as service_role,
                  has_function_privilege('anon', 'public.${signature}', 'execute') as anon,
                  has_function_privilege('authenticated', 'public.${signature}', 'execute') as authenticated,
                  has_function_privilege('public', 'public.${signature}', 'execute') as public`
        );
        assertEquals(
          row,
          { service_role: true, anon: false, authenticated: false, public: false },
          signature
        );
      }
      const listed = await rows<{ signature: string }>(
        db,
        `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'ingest\\_generation\\_%'`
      );
      assertEquals(
        listed.length,
        GENERATION_FUNCTIONS.length,
        `unlisted functions: ${listed.map(r => r.signature).join('; ')}`
      );
    } finally {
      await db.close();
    }
  }
);

// Falsifier: a client role can read frozen source text, vectors or the
// reservation ledger, or forge a promotion record.
Deno.test(
  'the job, row and reservation tables have RLS and service-role-only privileges',
  async () => {
    const db = await openIngestDb();
    try {
      for (const table of [
        'knowledge_generation_jobs',
        'knowledge_generation_rows',
        'knowledge_generation_reservations',
      ]) {
        const [row] = await rows<Record<string, boolean | number>>(
          db,
          `select c.relrowsecurity as rls,
                  has_table_privilege('service_role', c.oid, 'select, insert, update, delete') as service_role,
                  has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
                    or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') as anon,
                  has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert')
                    or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete') as authenticated,
                  has_table_privilege('public', c.oid, 'select') as public,
                  (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
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
            policies: 0,
          },
          table
        );
      }
    } finally {
      await db.close();
    }
  }
);
