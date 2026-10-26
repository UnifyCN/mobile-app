import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EMBEDDING_MODEL } from '../../_shared/embeddings.ts';
import type { CrawlSource } from './pickDueSources.ts';
import { ingestUntilSettled, makeHarness, makeSource } from './testSupport.ts';

function fixtureText(name: string): string {
  return Deno.readTextFileSync(
    new URL(`./fixtures/ircc/${name}`, import.meta.url)
  );
}

const EE_URL =
  'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';

function eeSource(overrides: Partial<CrawlSource> = {}): CrawlSource {
  return makeSource(7, {
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html',
    label: 'Express Entry - Rounds of Invitations',
    crawl_frequency_hours: 24,
    source_kind: 'ircc_express_entry_rounds',
    data_urls: [EE_URL],
    ...overrides,
  });
}

// Falsifier: the html path fetches the citation page, finds no JSON, and
// writes no chunk per draw.
Deno.test(
  'a draw source writes one chunk per draw with its own date',
  async () => {
    const source = eeSource();
    const h = makeHarness([source], {
      [EE_URL]: fixtureText('ee_rounds_sample.json'),
    });

    const result = await ingestUntilSettled(source, h.deps);

    assertEquals(result, {
      source_id: 7,
      status: 'success',
      chunks_created: 10,
    });
    assertEquals(h.fetched, [EE_URL]);
    const doc = h.store.documents[0];
    assertEquals(doc.url, source.url);
    assertEquals(doc.title, 'Express Entry - Rounds of Invitations');
    const chunks = h.store.chunksOf(doc.id);
    assertEquals(chunks.length, 10);
    assertEquals(
      chunks[0].chunk_text,
      'Express Entry draw #450 on October 16, 2026: French-Language proficiency 2026-Version 2, 5,000 invitations, minimum CRS 435.'
    );
    assertEquals(chunks[0].metadata, {
      source: 'crawler',
      fetched_at: '2026-10-23T12:00:00.000Z',
      published_at: '2026-10-16',
    });
    assertEquals(chunks[9].metadata.published_at, '2026-09-04');
    assertEquals(
      chunks.map(c => c.chunk_index),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    assert(
      chunks.every(c => c.chunk_text.split(/\s+/).length < 30),
      'records are short and must not be dropped by the prose filter'
    );
  }
);

const PROCESSING_PAGE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';
const JSON_BASE = 'https://www.canada.ca/content/dam/ircc/documents/json/';
const PROCESSING_FILES = [
  'data-ptime-en.json',
  'data-ptime-non-country-en.json',
  'data-country-name-en.json',
  'flpt-en.json',
  'flpt-by-week-en.json',
];
const FIXTURE_OF: Record<string, string> = {
  'data-ptime-en.json': 'ptime_country.json',
  'data-ptime-non-country-en.json': 'ptime_non_country.json',
  'data-country-name-en.json': 'country_names.json',
  'flpt-en.json': 'flpt_current.json',
  'flpt-by-week-en.json': 'flpt_by_week.json',
};

function processingSource(overrides: Partial<CrawlSource> = {}): CrawlSource {
  return makeSource(3, {
    url: PROCESSING_PAGE,
    label: 'Check IRCC Processing Times',
    crawl_frequency_hours: 24,
    source_kind: 'ircc_processing_times',
    data_urls: PROCESSING_FILES.map(f => JSON_BASE + f),
    ...overrides,
  });
}

function processingPages(): Record<string, string> {
  return Object.fromEntries(
    PROCESSING_FILES.map(f => [JSON_BASE + f, fixtureText(FIXTURE_OF[f])])
  );
}

Deno.test(
  'every processing time becomes one chunk, in batches of at most 20',
  async () => {
    const source = processingSource();
    const h = makeHarness([source], processingPages());

    const result = await ingestUntilSettled(source, h.deps);

    assertEquals(result, {
      source_id: 3,
      status: 'success',
      chunks_created: 1950,
    });
    const chunks = h.store.chunksOf(h.store.documents[0].id);
    assertEquals(chunks.length, 1950);
    assertEquals(
      h.embedBatches.reduce((a, b) => a + b, 0),
      1950
    );
    assert(h.embedBatches.every(n => n <= 20));
    // Each file keeps its own date: country and non-country 2026-10-21, flpt
    // 2026-10-09, extension queue 2026-10-17.
    const dates = new Map<string, number>();
    for (const c of chunks) {
      const d = String(c.metadata.published_at);
      dates.set(d, (dates.get(d) ?? 0) + 1);
    }
    assertEquals(Object.fromEntries(dates), {
      '2026-10-21': 1924,
      '2026-10-09': 24,
      '2026-10-17': 2,
    });
  }
);

Deno.test(
  'an unchanged crawl embeds nothing and refreshes every record fetched_at, keeping each date',
  async () => {
    const source = eeSource();
    const pages = { [EE_URL]: fixtureText('ee_rounds_sample.json') };
    const h = makeHarness([source], pages);
    await ingestUntilSettled(source, h.deps);
    const doc = h.store.documents[0];
    const datesBefore = h.store
      .chunksOf(doc.id)
      .map(c => c.metadata.published_at);
    const batchesBefore = h.embedBatches.length;

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second.status, 'skipped');
    assertEquals(h.embedBatches.length, batchesBefore);
    const after = h.store.chunksOf(doc.id);
    assertEquals(after.length, 10);
    assertEquals(
      after.map(c => c.metadata.published_at),
      datesBefore
    );
    assertEquals(new Set(datesBefore).size, 10);
    assert(
      after.every(c => c.metadata.fetched_at === '2026-10-23T12:01:00.000Z')
    );
    assertEquals(doc.metadata.fetched_at, '2026-10-23T12:01:00.000Z');
    assertEquals(doc.metadata.published_at, '2026-10-16');
  }
);

Deno.test(
  'an unchanged record whose source date moved gets the new date and no new embedding',
  async () => {
    const source = processingSource();
    const pages = processingPages();
    const h = makeHarness([source], pages);
    await ingestUntilSettled(source, h.deps);
    const doc = h.store.documents[0];
    const batchesBefore = h.embedBatches.length;
    const country = JSON.parse(pages[JSON_BASE + 'data-ptime-en.json']);
    country.work.lastupdated = 'October 28, 2026';
    pages[JSON_BASE + 'data-ptime-en.json'] = JSON.stringify(country);

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second.status, 'skipped');
    assertEquals(h.embedBatches.length, batchesBefore);
    const chunks = h.store.chunksOf(doc.id);
    const work = chunks.filter(c =>
      c.chunk_text.includes('Work permit (from outside Canada)')
    );
    const study = chunks.filter(c =>
      c.chunk_text.includes('Study permit (from outside Canada)')
    );
    assert(
      work.length > 50 &&
        work.every(c => c.metadata.published_at === '2026-10-28')
    );
    assert(
      study.length > 50 &&
        study.every(c => c.metadata.published_at === '2026-10-21')
    );
  }
);

function texts(h: ReturnType<typeof makeHarness>): string[] {
  return h.store.chunksOf(h.store.documents[0].id).map(c => c.chunk_text);
}

// Falsifier: with no stale delete, the oldest draw of the first crawl stays.
Deno.test(
  'a changed source removes records that are no longer in it',
  async () => {
    const source = eeSource();
    const first = JSON.parse(fixtureText('ee_rounds_sample.json'));
    const pages = { [EE_URL]: JSON.stringify(first) };
    const h = makeHarness([source], pages);
    await ingestUntilSettled(source, h.deps);
    assert(texts(h).some(t => t.includes('draw #441 ')));
    const next = {
      rounds: [
        {
          ...first.rounds[0],
          drawNumber: '451',
          drawDate: '2026-10-22',
          drawDateFull: 'October 22, 2026',
          drawName: 'Canadian Experience Class',
          drawSize: '3,000',
          drawCRS: '501',
        },
        ...first.rounds,
      ],
    };
    pages[EE_URL] = JSON.stringify(next);

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second, {
      source_id: 7,
      status: 'success',
      chunks_created: 10,
    });
    const after = texts(h);
    assertEquals(after.length, 10);
    assertEquals(
      after[0],
      'Express Entry draw #451 on October 22, 2026: Canadian Experience Class, 3,000 invitations, minimum CRS 501.'
    );
    assert(
      !after.some(t => t.includes('draw #441 ')),
      'draw 441 left the top ten'
    );
    assertEquals(h.store.documents.length, 1);
    const chunks = h.store.chunksOf(h.store.documents[0].id);
    assertEquals(
      chunks.map(c => c.chunk_index),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
  }
);

Deno.test(
  'a failed data file keeps the previous records and stamps the attempt',
  async () => {
    const source = processingSource();
    const pages: Record<string, string | Error> = processingPages();
    const h = makeHarness([source], pages);
    await ingestUntilSettled(source, h.deps);
    const before = texts(h);
    pages[JSON_BASE + 'flpt-by-week-en.json'] = new Error(
      'HTTP 503: unavailable'
    );

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second.status, 'error');
    assertEquals(second.error, 'HTTP 503: unavailable');
    assertEquals(texts(h), before);
    // The first publish took four calls (12:00 to 12:03, 25 requests each at
    // most); the failed call is the fifth.
    assertEquals(
      h.store.sources[0].last_crawled_at,
      '2026-10-23T12:04:00.000Z'
    );
    assertEquals(h.store.logs.at(-1)?.status, 'error');
  }
);

Deno.test(
  'a file with an unexpected shape or no records keeps the previous records',
  async () => {
    const source = eeSource();
    const pages: Record<string, string> = {
      [EE_URL]: fixtureText('ee_rounds_sample.json'),
    };
    const h = makeHarness([source], pages);
    await ingestUntilSettled(source, h.deps);
    const before = texts(h);

    for (const [body, message] of [
      ['{"rounds": 5}', 'Express Entry rounds: no rounds list'],
      ['not json', `Invalid JSON from ${EE_URL}`],
      ['{"rounds": []}', 'No records in the source'],
      [
        JSON.stringify({ rounds: [{ drawNumber: 'x' }] }),
        'Express Entry rounds: malformed draw x',
      ],
      [
        JSON.stringify({ rounds: [{ drawNumber: '402' }] }),
        'Express Entry rounds: malformed draw 402',
      ],
    ]) {
      pages[EE_URL] = body;
      const result = await ingestUntilSettled(source, h.deps);
      assertEquals(result.error, message);
      assertEquals(texts(h), before);
    }
  }
);

Deno.test(
  'a record source without data_urls, with an http address or with an unknown kind fails without writing',
  async () => {
    const cases: Array<[CrawlSource, string]> = [
      [eeSource({ data_urls: null }), 'Source 7 has no data_urls'],
      [eeSource({ data_urls: [] }), 'Source 7 has no data_urls'],
      [
        eeSource({ data_urls: ['http://www.canada.ca/x.json'] }),
        'Data address is not https: http://www.canada.ca/x.json',
      ],
      [eeSource({ source_kind: 'rss' as never }), 'Unknown source kind: rss'],
      [
        processingSource({ data_urls: [JSON_BASE + 'data-ptime-en.json'] }),
        'Source 3 data_urls has no data-ptime-non-country-en.json',
      ],
    ];
    for (const [source, message] of cases) {
      const h = makeHarness([source], {});
      const result = await ingestUntilSettled(source, h.deps);
      assertEquals(result.error, message);
      assertEquals(h.store.documents.length, 0);
      assertEquals(
        h.store.sources[0].last_crawled_at,
        '2026-10-23T12:00:00.000Z'
      );
    }
  }
);

Deno.test(
  'the key order of a source file does not make an unchanged crawl look changed',
  async () => {
    const source = processingSource();
    const pages = processingPages();
    const h = makeHarness([source], pages);
    await ingestUntilSettled(source, h.deps);
    const reverse = (v: unknown): unknown =>
      v !== null && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v)
              .reverse()
              .map(([k, x]) => [k, reverse(x)])
          )
        : v;
    for (const f of PROCESSING_FILES) {
      pages[JSON_BASE + f] = JSON.stringify(
        reverse(JSON.parse(pages[JSON_BASE + f].replace(/^\uFEFF/, '')))
      );
    }

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second.status, 'skipped');
  }
);

Deno.test(
  'a province source keeps its province on every record chunk; a national one has none',
  async () => {
    const national = eeSource();
    const provincial = eeSource({ province: 'Ontario' });
    for (const [source, expected] of [
      [national, undefined],
      [provincial, 'Ontario'],
    ] as const) {
      const h = makeHarness([source], {
        [EE_URL]: fixtureText('ee_rounds_sample.json'),
      });
      await ingestUntilSettled(source, h.deps);
      const chunks = h.store.chunksOf(h.store.documents[0].id);
      assert(chunks.every(c => c.metadata.province === expected));
      assertEquals('province' in chunks[0].metadata, expected !== undefined);
    }
  }
);

const NEWS_URL =
  'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=100';

function newsSource(overrides: Partial<CrawlSource> = {}): CrawlSource {
  return makeSource(30, {
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news.html',
    label: 'IRCC Newsroom',
    crawl_frequency_hours: 24,
    source_kind: 'ircc_newsroom',
    data_urls: [NEWS_URL],
    ...overrides,
  });
}

Deno.test(
  'newsroom items keep their own page and the 30-day window follows the run clock',
  async () => {
    const source = newsSource();
    const h = makeHarness([source], {
      [NEWS_URL]: fixtureText('newsroom_shape.json'),
    });
    // The harness clock starts at 2026-10-23T12:00Z, so the window opens 2026-09-23.

    const result = await ingestUntilSettled(source, h.deps);

    assertEquals(result.chunks_created, 8);
    const chunks = h.store.chunksOf(h.store.documents[0].id);
    assertEquals(h.store.documents[0].url, source.url);
    assertEquals(chunks[0].metadata, {
      source: 'crawler',
      fetched_at: '2026-10-23T12:00:00.000Z',
      published_at: '2026-10-16',
      source_url:
        'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/canada-refocusing-express-entry-on-top-talent-that-drives-economic-growth.html',
    });
    assert(chunks.every(c => typeof c.metadata.source_url === 'string'));
    assertEquals(
      chunks.map(c => c.metadata.published_at),
      [
        '2026-10-16',
        '2026-10-16',
        '2026-10-15',
        '2026-10-09',
        '2026-10-08',
        '2026-09-29',
        '2026-09-29',
        '2026-09-25',
      ]
    );
  }
);

Deno.test(
  'an item that ages out of the window is removed on the next changed crawl',
  async () => {
    const source = newsSource();
    const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
    const h = makeHarness([source], {
      [NEWS_URL]: fixtureText('newsroom_shape.json'),
    });
    h.deps.now = () => clock.now;
    await ingestUntilSettled(source, h.deps);
    assert(texts(h).some(t => t.startsWith('September 25, 2026')));
    clock.now = new Date('2026-10-27T12:00:00.000Z'); // window opens 2026-09-27

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second.status, 'success');
    const after = texts(h);
    assertEquals(after.length, 7);
    assert(!after.some(t => t.startsWith('September 25, 2026')));
  }
);

// Falsifier: an error for the empty window keeps the expired item forever.
Deno.test(
  'a readable feed with no item left in the window clears the news',
  async () => {
    const source = newsSource();
    const clock = { now: new Date('2026-10-23T12:00:00.000Z') };
    const h = makeHarness([source], {
      [NEWS_URL]: fixtureText('newsroom_shape.json'),
    });
    h.deps.now = () => clock.now;
    await ingestUntilSettled(source, h.deps);
    clock.now = new Date('2026-12-01T12:00:00.000Z');

    const second = await ingestUntilSettled(source, h.deps);

    assertEquals(second, {
      source_id: 30,
      status: 'success',
      chunks_created: 0,
    });
    assertEquals(texts(h), []);
    assertEquals(h.store.documents[0].metadata.published_at, '2026-12-01');
  }
);

// Falsifier: a second call that does not respect the claim writes a second
// version while the first is still embedding.
Deno.test(
  'a call for a source that is being refreshed is skipped',
  async () => {
    const source = eeSource();
    const h = makeHarness([source], {
      [EE_URL]: fixtureText('ee_rounds_sample.json'),
    });
    await h.store.claimSource(source.id, 300, EMBEDDING_MODEL);

    const result = await ingestUntilSettled(source, h.deps);

    assertEquals(result, {
      source_id: 7,
      status: 'skipped',
      error: 'Another call is refreshing this source',
    });
    assertEquals(h.fetched, []);
    assertEquals(h.store.sources[0].last_crawled_at, null);
    assertEquals(
      h.store.logs.at(-1)?.error_message,
      'Another call is refreshing this source'
    );
  }
);
