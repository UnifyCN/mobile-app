// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyMigration, openBaselineDb, rows } from './support/sharedDb.ts';

const JSON_BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const EE_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';
const PROCESSING_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';
const NEWS_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/news.html';
const NEWS_API =
  'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=100';

async function withColumns() {
  const db = await openBaselineDb();
  await applyMigration(db, 'crawl_sources_province');
  await applyMigration(db, 'crawl_sources_record_sources');
  return db;
}

async function withSeed() {
  const db = await withColumns();
  await applyMigration(db, 'seed_province_crawl_sources');
  await applyMigration(db, 'seed_ircc_record_sources');
  return db;
}

// Falsifier: without the migration the query returns no rows.
Deno.test(
  'crawl_sources gets source_kind (default html) and a nullable data_urls array',
  async () => {
    const db = await withColumns();

    const columns = await rows(
      db,
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'crawl_sources'
        and column_name in ('source_kind', 'data_urls') order by column_name`
    );

    assertEquals(columns, [
      {
        column_name: 'data_urls',
        data_type: 'ARRAY',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'source_kind',
        data_type: 'text',
        is_nullable: 'NO',
        column_default: "'html'::text",
      },
    ]);
    assertEquals(
      await rows(
        db,
        `select count(*)::int as n from public.crawl_sources where source_kind = 'html' and data_urls is null`
      ),
      [{ n: 25 }]
    );
    await db.close();
  }
);

async function insertError(
  db: Awaited<ReturnType<typeof withColumns>>,
  kind: string,
  urls: string[] | null
): Promise<string | null> {
  try {
    await db.query(
      `insert into public.crawl_sources (url, source_kind, data_urls) values ($1, $2, $3)`,
      [`https://example.test/${Math.random()}`, kind, urls]
    );
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

// Falsifier: with no check, every rejected row below is stored.
Deno.test(
  'source_kind accepts the four kinds, and a record kind needs data_urls',
  async () => {
    const db = await withColumns();
    const u = ['https://example.test/a.json'];

    assertEquals(await insertError(db, 'html', null), null);
    assertEquals(await insertError(db, 'ircc_express_entry_rounds', u), null);
    assertEquals(await insertError(db, 'ircc_processing_times', u), null);
    assertEquals(await insertError(db, 'ircc_newsroom', u), null);
    // 23514 is check_violation.
    assertEquals(await insertError(db, 'rss', u), '23514');
    assertEquals(await insertError(db, 'HTML', null), '23514');
    assertEquals(await insertError(db, 'ircc_newsroom', null), '23514');
    assertEquals(await insertError(db, 'ircc_newsroom', []), '23514');
    await db.close();
  }
);

Deno.test('the columns migration can run twice', async () => {
  const db = await withColumns();
  await applyMigration(db, 'crawl_sources_record_sources');
  assertEquals(
    await rows(db, `select count(*)::int as n from public.crawl_sources`),
    [{ n: 25 }]
  );
  await db.close();
});

Deno.test('only service_role can read the new columns', async () => {
  const db = await withColumns();

  const access = await rows(
    db,
    `select r as role, c as col,
            has_column_privilege(r, 'public.crawl_sources', c, 'select') as can_read
       from unnest(array['anon', 'authenticated', 'service_role']) as r,
            unnest(array['source_kind', 'data_urls']) as c
      order by r, c`
  );

  assertEquals(
    access.map(a => [a.role, a.col, a.can_read]),
    [
      ['anon', 'data_urls', false],
      ['anon', 'source_kind', false],
      ['authenticated', 'data_urls', false],
      ['authenticated', 'source_kind', false],
      ['service_role', 'data_urls', true],
      ['service_role', 'source_kind', true],
    ]
  );
  await db.close();
});

// Falsifier: with no seed the two sources stay html at 168 hours.
Deno.test(
  'the seed moves Express Entry rounds and processing times to 24 hours on their official JSON',
  async () => {
    const db = await withSeed();

    const moved = await rows(
      db,
      `select url, label, enabled, crawl_frequency_hours, source_kind, data_urls, last_crawled_at
       from public.crawl_sources where source_kind <> 'html' and url <> $1 order by url`,
      [NEWS_PAGE]
    );

    assertEquals(moved, [
      {
        url: PROCESSING_PAGE,
        label: 'Check IRCC Processing Times',
        enabled: true,
        crawl_frequency_hours: 24,
        source_kind: 'ircc_processing_times',
        data_urls: [
          JSON_BASE + 'data-ptime-en.json',
          JSON_BASE + 'data-ptime-non-country-en.json',
          JSON_BASE + 'data-country-name-en.json',
          JSON_BASE + 'flpt-en.json',
          JSON_BASE + 'flpt-by-week-en.json',
        ],
        last_crawled_at: null,
      },
      {
        url: EE_PAGE,
        label: 'Express Entry – Rounds of Invitations',
        enabled: true,
        crawl_frequency_hours: 24,
        source_kind: 'ircc_express_entry_rounds',
        data_urls: [JSON_BASE + 'ee_rounds_123_en.json'],
        last_crawled_at: null,
      },
    ]);
    await db.close();
  }
);

Deno.test('the seed adds one newsroom source at 24 hours', async () => {
  const db = await withSeed();

  assertEquals(
    await rows(
      db,
      `select url, label, subject, enabled, crawl_frequency_hours, source_kind, data_urls, province
         from public.crawl_sources where url = $1`,
      [NEWS_PAGE]
    ),
    [
      {
        url: NEWS_PAGE,
        label: 'IRCC Newsroom',
        subject: 'general',
        enabled: true,
        crawl_frequency_hours: 24,
        source_kind: 'ircc_newsroom',
        data_urls: [NEWS_API],
        province: null,
      },
    ]
  );
  await db.close();
});

// Falsifier: a seed that touches other rows, or adds more than one source,
// changes these counts. The planned set is 25 existing, 3 province, 1 newsroom.
Deno.test(
  'the planned source set is 29 and no other source changes',
  async () => {
    const db = await openBaselineDb();
    const before = await rows(
      db,
      `select url, label, subject, enabled, crawl_frequency_hours from public.crawl_sources
      where url not in ($1, $2) order by url`,
      [EE_PAGE, PROCESSING_PAGE]
    );
    await applyMigration(db, 'crawl_sources_province');
    await applyMigration(db, 'crawl_sources_record_sources');
    await applyMigration(db, 'seed_province_crawl_sources');
    await applyMigration(db, 'seed_ircc_record_sources');

    assertEquals(
      await rows(db, `select count(*)::int as n from public.crawl_sources`),
      [{ n: 29 }]
    );
    const after = await rows(
      db,
      `select url, label, subject, enabled, crawl_frequency_hours from public.crawl_sources
      where url not in ($1, $2) and province is null and source_kind = 'html' order by url`,
      [EE_PAGE, PROCESSING_PAGE]
    );
    assertEquals(after, before);
    assertEquals(
      await rows(
        db,
        `select count(*)::int as n from public.crawl_sources where source_kind <> 'html'`
      ),
      [{ n: 3 }]
    );
    await db.close();
  }
);

Deno.test(
  'the seed can run twice without duplicates or a reset of crawl state',
  async () => {
    const db = await withSeed();
    await db.query(
      `update public.crawl_sources set last_crawled_at = '2026-10-23T12:00:00Z' where url = $1`,
      [NEWS_PAGE]
    );

    await applyMigration(db, 'seed_ircc_record_sources');

    assertEquals(
      await rows(db, `select count(*)::int as n from public.crawl_sources`),
      [{ n: 29 }]
    );
    assertEquals(
      await rows(
        db,
        `select to_char(last_crawled_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI') as at from public.crawl_sources where url = $1`,
        [NEWS_PAGE]
      ),
      [{ at: '2026-10-23T12:00' }]
    );
    await db.close();
  }
);

// Falsifier: a plain update that matches nothing succeeds silently and leaves
// the source on html.
Deno.test(
  'the seed fails loudly when an existing source is missing',
  async () => {
    const db = await withColumns();
    await db.query(`delete from public.crawl_sources where url = $1`, [
      EE_PAGE,
    ]);

    let message = '';
    try {
      await applyMigration(db, 'seed_ircc_record_sources');
    } catch (error) {
      message = (error as Error).message;
    }

    assertEquals(message.includes('crawl source not found'), true, message);
    await db.close();
  }
);
