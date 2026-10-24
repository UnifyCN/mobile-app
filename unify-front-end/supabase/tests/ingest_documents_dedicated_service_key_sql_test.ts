// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The ingest_documents_dedicated_service_key migration, called directly in SQL
// in a local Postgres (PGlite). The real migration files run: the previous
// single-call driver first, then this one. Two boundaries are narrow stand-ins
// with distinct FAKE key values: vault.decrypted_secrets (a table) and
// net.http_post (a function that records its arguments). They prove which key
// the SQL picks and what request it builds. They do not prove real Vault
// decryption, real pg_net delivery, hosted roles, or that the hosted guard
// accepts the stored key.
import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyMigration,
  openBaselineDb,
  rows,
  type Db,
} from './support/sharedDb.ts';

const DEDICATED_KEY = 'FAKE-DEDICATED-INGEST-KEY-AAA';
const SHARED_KEY = 'FAKE-SHARED-SERVICE-ROLE-KEY-BBB';
const SUPABASE_URL = 'https://fake-project.supabase.test';
const CRON_SCHEDULE = '0 * * * *';

const MIGRATION_SLUG = 'ingest_documents_dedicated_service_key';

const FAKE_BOUNDARIES = `
  create schema vault;
  create table vault.decrypted_secrets (
    name text,
    decrypted_secret text
  );

  create schema net;
  create table net.captured_requests (
    id bigserial primary key,
    url text,
    body jsonb,
    params jsonb,
    headers jsonb,
    timeout_milliseconds integer
  );
  -- Same parameter names and order as pg_net's net.http_post.
  create function net.http_post(
    url text,
    body jsonb default '{}'::jsonb,
    params jsonb default '{}'::jsonb,
    headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds integer default 5000
  ) returns bigint language plpgsql as $$
  declare _id bigint;
  begin
    insert into net.captured_requests (url, body, params, headers, timeout_milliseconds)
    values (url, body, params, headers, timeout_milliseconds)
    returning id into _id;
    return _id;
  end;
  $$;

  create schema cron;
  create table cron.job (
    jobid bigserial primary key,
    jobname text,
    schedule text,
    command text
  );
  create table cron.calls (id bigserial primary key, what text);
  create function cron.schedule(job_name text, schedule text, command text)
    returns bigint language plpgsql as $$
  begin
    insert into cron.calls (what) values ('schedule ' || job_name);
    return 0;
  end;
  $$;
  create function cron.unschedule(job_name text)
    returns boolean language plpgsql as $$
  begin
    insert into cron.calls (what) values ('unschedule ' || job_name);
    return true;
  end;
  $$;
  insert into cron.job (jobname, schedule, command)
  values ('rag-crawl-batch', '${CRON_SCHEDULE}', 'select public.trigger_crawl_all()');
`;

async function openDriverDb(): Promise<Db> {
  const db = await openBaselineDb();
  await db.exec(FAKE_BOUNDARIES);
  // Release order: the single-call driver is live before this migration.
  await applyMigration(db, 'ingest_documents_single_scheduled_call');
  await applyMigration(db, MIGRATION_SLUG);
  return db;
}

async function putSecrets(
  db: Db,
  secrets: Record<string, string>
): Promise<void> {
  await db.exec('delete from vault.decrypted_secrets');
  for (const [name, value] of Object.entries(secrets)) {
    await db.query(
      'insert into vault.decrypted_secrets (name, decrypted_secret) values ($1, $2)',
      [name, value]
    );
  }
}

interface Captured {
  url: string;
  body: unknown;
  params: unknown;
  headers: Record<string, string>;
  timeout_milliseconds: number;
}

const requests = (db: Db) =>
  rows<Captured>(
    db,
    `select url, body, params, headers, timeout_milliseconds
       from net.captured_requests order by id`
  );

const runDriver = (db: Db) => db.query('select public.trigger_crawl_all()');

const URL_SECRET = { supabase_url: SUPABASE_URL };

function driverTest(name: string, body: (db: Db) => Promise<void>): void {
  Deno.test(name, async () => {
    const db = await openDriverDb();
    try {
      await body(db);
    } finally {
      await db.close();
    }
  });
}

// Falsifier: a driver that keeps sending the shared key sends SHARED_KEY here,
// which the hosted guard rejects with 401.
driverTest(
  'trigger_crawl_all prefers the dedicated ingestion key over the shared key',
  async db => {
    await putSecrets(db, {
      ...URL_SECRET,
      service_role_key: SHARED_KEY,
      ingest_documents_service_key: DEDICATED_KEY,
    });
    await runDriver(db);

    const sent = await requests(db);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].headers.Authorization, `Bearer ${DEDICATED_KEY}`);
    assertFalse(
      JSON.stringify(sent[0]).includes(SHARED_KEY),
      'the shared key must not appear anywhere in the request'
    );
  }
);

driverTest(
  'trigger_crawl_all falls back to the shared key when no dedicated key exists',
  async db => {
    await putSecrets(db, { ...URL_SECRET, service_role_key: SHARED_KEY });
    await runDriver(db);

    const sent = await requests(db);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].headers.Authorization, `Bearer ${SHARED_KEY}`);
  }
);

driverTest(
  'trigger_crawl_all falls back to the shared key when the dedicated key is empty',
  async db => {
    await putSecrets(db, {
      ...URL_SECRET,
      service_role_key: SHARED_KEY,
      ingest_documents_service_key: '',
    });
    await runDriver(db);

    const sent = await requests(db);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].headers.Authorization, `Bearer ${SHARED_KEY}`);
  }
);

driverTest(
  'trigger_crawl_all uses the dedicated key when the shared key is missing',
  async db => {
    await putSecrets(db, {
      ...URL_SECRET,
      ingest_documents_service_key: DEDICATED_KEY,
    });
    await runDriver(db);

    const sent = await requests(db);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].headers.Authorization, `Bearer ${DEDICATED_KEY}`);
  }
);

driverTest(
  'trigger_crawl_all queues nothing when every key is missing or empty',
  async db => {
    for (const secrets of [
      { ...URL_SECRET },
      { ...URL_SECRET, service_role_key: '', ingest_documents_service_key: '' },
    ]) {
      await putSecrets(db, secrets);
      await runDriver(db);
      assertEquals((await requests(db)).length, 0);
    }
  }
);

driverTest(
  'trigger_crawl_all queues nothing when the project URL is missing',
  async db => {
    await putSecrets(db, {
      service_role_key: SHARED_KEY,
      ingest_documents_service_key: DEDICATED_KEY,
    });
    await runDriver(db);
    assertEquals((await requests(db)).length, 0);
  }
);

driverTest(
  'trigger_crawl_all makes one empty-body request with the reviewed URL, headers and timeout',
  async db => {
    await putSecrets(db, {
      ...URL_SECRET,
      service_role_key: SHARED_KEY,
      ingest_documents_service_key: DEDICATED_KEY,
    });
    await runDriver(db);

    const sent = await requests(db);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].url, `${SUPABASE_URL}/functions/v1/ingest-documents`);
    assertEquals(sent[0].body, {});
    assertEquals(sent[0].params, {});
    // Authorization Bearer only: apikey alone is rejected by the guard.
    assertEquals(sent[0].headers, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEDICATED_KEY}`,
    });
    assertEquals(sent[0].timeout_milliseconds, 120000);

    await runDriver(db);
    assertEquals(
      (await requests(db)).length,
      2,
      'each run queues exactly one request'
    );
  }
);

driverTest('the migration leaves the cron schedule untouched', async db => {
  assertEquals(await rows(db, 'select what from cron.calls'), []);
  assertEquals(
    await rows(db, 'select jobname, schedule, command from cron.job'),
    [
      {
        jobname: 'rag-crawl-batch',
        schedule: CRON_SCHEDULE,
        command: 'select public.trigger_crawl_all()',
      },
    ]
  );
  const statements = (await migrationText()).replace(/--.*$/gm, '');
  assertFalse(
    /cron\./i.test(statements),
    'the migration must not reference cron outside comments'
  );
});

driverTest(
  'trigger_crawl_all keeps SECURITY DEFINER, search_path and its execute grants',
  async db => {
    const [fn] = await rows<{
      prosecdef: boolean;
      proconfig: string[];
    }>(
      db,
      `select prosecdef, proconfig from pg_proc
      where oid = 'public.trigger_crawl_all()'::regprocedure`
    );
    assert(fn.prosecdef, 'must stay SECURITY DEFINER');
    assertEquals(fn.proconfig, ['search_path=public']);

    await db.exec('create role probe nologin');
    const privilege = async (role: string) =>
      (
        await rows<{ allowed: boolean }>(
          db,
          `select has_function_privilege($1, 'public.trigger_crawl_all()', 'execute') as allowed`,
          [role]
        )
      )[0].allowed;
    assertFalse(await privilege('probe'), 'PUBLIC must not execute');
    assertFalse(await privilege('anon'));
    assertFalse(await privilege('authenticated'));
    assert(await privilege('service_role'));

    // The denial holds when the role really calls the function.
    await putSecrets(db, {
      ...URL_SECRET,
      ingest_documents_service_key: DEDICATED_KEY,
    });
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      let denied = false;
      try {
        await runDriver(db);
      } catch (error) {
        denied = /permission denied/i.test(String(error));
      } finally {
        await db.exec('reset role');
      }
      assert(denied, `${role} must be denied`);
    }
    assertEquals((await requests(db)).length, 0);

    await db.exec('set role service_role');
    try {
      await runDriver(db);
    } finally {
      await db.exec('reset role');
    }
    assertEquals((await requests(db)).length, 1);
  }
);

async function migrationText(): Promise<string> {
  const dir = new URL('../migrations/', import.meta.url);
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.endsWith(`_${MIGRATION_SLUG}.sql`)) {
      return await Deno.readTextFile(new URL(entry.name, dir));
    }
  }
  throw new Error('migration not found');
}
