// Named `_test.ts` (Deno convention) so the repo's jest run, which globs
// `*.test.ts`, does not try to execute it. Run with:
//   deno test unify-front-end/supabase/functions/ingest-documents/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickDueSources, type CrawlSource } from './pickDueSources.ts';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

function source(id: number, overrides: Partial<CrawlSource> = {}): CrawlSource {
  return {
    id,
    url: `https://www.canada.ca/page-${id}`,
    label: `Page ${id}`,
    enabled: true,
    crawl_frequency_hours: 24,
    last_crawled_at: hoursAgo(48),
    ...overrides,
  };
}

const ids = (list: CrawlSource[]) => list.map(s => s.id);

// Falsifier: if never-fetched sources are not first, id 2 (fetched 500h ago)
// would be returned before id 3 (never fetched).
Deno.test('never-fetched sources come before oldest-fetched sources', () => {
  const sources = [
    source(1, { last_crawled_at: hoursAgo(100) }),
    source(2, { last_crawled_at: hoursAgo(500) }),
    source(3, { last_crawled_at: null }),
  ];
  assertEquals(ids(pickDueSources(sources, NOW)), [3, 2]);
});

// Falsifier: if due filtering is missing, id 1 (fetched 2h ago, 24h cycle) and
// id 2 (disabled) would be returned.
Deno.test('sources that are disabled or not yet due are excluded', () => {
  const sources = [
    source(1, { last_crawled_at: hoursAgo(2) }),
    source(2, { enabled: false, last_crawled_at: null }),
    source(3, { last_crawled_at: hoursAgo(30) }),
    source(4, { crawl_frequency_hours: 168, last_crawled_at: hoursAgo(100) }),
  ];
  assertEquals(ids(pickDueSources(sources, NOW)), [3]);
});

// Falsifier: if the comparison were off by a frequency, 23h59m would be due or
// 24h01m would be skipped.
Deno.test(
  'a source is due once its last attempt is older than the frequency',
  () => {
    const justInside = source(1, { last_crawled_at: hoursAgo(24 - 1 / 60) });
    const justPast = source(2, { last_crawled_at: hoursAgo(24 + 1 / 60) });
    assertEquals(ids(pickDueSources([justInside, justPast], NOW)), [2]);
  }
);

// Falsifier: with no cap, all five due sources would be returned.
// (Characterisation: the cap was introduced with the first cycle, so this test
// passes on arrival. Recorded as green-on-arrival in the proof logs.)
Deno.test('at most two due sources are returned, oldest first', () => {
  const sources = [
    source(1, { last_crawled_at: hoursAgo(50) }),
    source(2, { last_crawled_at: hoursAgo(90) }),
    source(3, { last_crawled_at: hoursAgo(70) }),
    source(4, { last_crawled_at: hoursAgo(60) }),
    source(5, { last_crawled_at: hoursAgo(80) }),
  ];
  assertEquals(ids(pickDueSources(sources, NOW)), [2, 5]);
  assertEquals(ids(pickDueSources(sources, NOW, 1)), [2]);
});
