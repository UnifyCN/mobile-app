// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyMigration,
  canadianProvinces,
  openBaselineDb,
  rows,
} from './support/sharedDb.ts';

async function insertProvince(
  db: Awaited<ReturnType<typeof openBaselineDb>>,
  index: number,
  province: string | null
): Promise<string | null> {
  try {
    await db.query(
      'insert into public.crawl_sources (url, province) values ($1, $2)',
      [`https://example.test/${index}`, province]
    );
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

// Falsifier: without the migration there is no province column, so the query
// returns no row.
Deno.test('crawl_sources gets a nullable text province column', async () => {
  const db = await openBaselineDb();
  await applyMigration(db, 'crawl_sources_province');

  const columns = await rows(
    db,
    `select data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'crawl_sources'
        and column_name = 'province'`
  );

  assertEquals(columns, [
    { data_type: 'text', is_nullable: 'YES', column_default: null },
  ]);
  await db.close();
});

// Falsifier: with no check, every rejected value below is stored (no error).
Deno.test('province accepts the 13 exact names and null, and nothing else', async () => {
  const names = await canadianProvinces();
  assertEquals(names.length, 13);
  const db = await openBaselineDb();
  await applyMigration(db, 'crawl_sources_province');

  const accepted: Array<string | null> = [];
  for (const [i, value] of [...names, null].entries()) {
    if ((await insertProvince(db, i, value)) === null) accepted.push(value);
  }
  const rejected: Record<string, string | null> = {};
  const bad = ['ontario', 'ON', 'Québec', '', ' Ontario', 'Atlantis', 'Ontario '];
  for (const [i, value] of bad.entries()) {
    rejected[value] = await insertProvince(db, 100 + i, value);
  }

  assertEquals(accepted, [...names, null]);
  // 23514 is check_violation.
  assertEquals(
    Object.values(rejected),
    bad.map(() => '23514')
  );
  await db.close();
});

// Falsifier: a default or backfill that sets any province turns a national
// source into a provincial one. Also fails if the migration cannot run twice.
Deno.test('existing sources stay national and keep their settings, on a repeat run too', async () => {
  const db = await openBaselineDb();
  const before = await rows(
    db,
    `select id, url, label, subject, enabled, crawl_frequency_hours, last_crawled_at
       from public.crawl_sources order by id`
  );
  assertEquals(before.length, 25);

  await applyMigration(db, 'crawl_sources_province');
  await applyMigration(db, 'crawl_sources_province');

  const after = await rows(
    db,
    `select id, url, label, subject, enabled, crawl_frequency_hours, last_crawled_at
       from public.crawl_sources order by id`
  );
  assertEquals(after, before);
  assertEquals(
    await rows(db, 'select count(*)::int as n from public.crawl_sources where province is not null'),
    [{ n: 0 }]
  );
  await db.close();
});

// Falsifier: if the migration re-granted the table to anon, anon could read it.
Deno.test('only service_role can read crawl_sources.province', async () => {
  const db = await openBaselineDb();
  await applyMigration(db, 'crawl_sources_province');

  const access = await rows(
    db,
    `select r as role,
            has_column_privilege(r, 'public.crawl_sources', 'province', 'select') as can_read
       from unnest(array['anon', 'authenticated', 'service_role']) as r`
  );

  assertEquals(access, [
    { role: 'anon', can_read: false },
    { role: 'authenticated', can_read: false },
    { role: 'service_role', can_read: true },
  ]);
  await db.close();
});

// Falsifier: with no seed migration there are no provincial sources, and the
// query returns an empty list.
Deno.test('the seed adds the official OINP, BC PNP and AAIP pages at 168 hours', async () => {
  const db = await openBaselineDb();
  await applyMigration(db, 'crawl_sources_province');
  await applyMigration(db, 'seed_province_crawl_sources');

  const provincial = await rows(
    db,
    `select province, url, enabled, crawl_frequency_hours, last_crawled_at
       from public.crawl_sources where province is not null order by province`
  );

  assertEquals(provincial, [
    {
      province: 'Alberta',
      url: 'https://www.alberta.ca/alberta-advantage-immigration-program',
      enabled: true,
      crawl_frequency_hours: 168,
      last_crawled_at: null,
    },
    {
      province: 'British Columbia',
      url: 'https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program',
      enabled: true,
      crawl_frequency_hours: 168,
      last_crawled_at: null,
    },
    {
      province: 'Ontario',
      url: 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp',
      enabled: true,
      crawl_frequency_hours: 168,
      last_crawled_at: null,
    },
  ]);
  await db.close();
});

// Falsifier: an insert without a conflict guard fails on the second run, and a
// seed that touches existing rows changes the 25 national sources.
Deno.test('the seed runs twice without duplicates and leaves the national sources alone', async () => {
  const db = await openBaselineDb();
  await applyMigration(db, 'crawl_sources_province');
  await applyMigration(db, 'seed_province_crawl_sources');
  await applyMigration(db, 'seed_province_crawl_sources');

  assertEquals(
    await rows(
      db,
      `select count(*)::int as total,
              count(*) filter (where province is null)::int as national
         from public.crawl_sources`
    ),
    [{ total: 28, national: 25 }]
  );
  await db.close();
});
