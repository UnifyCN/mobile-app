// Run with: deno test --allow-read --allow-env unify-front-end/supabase/functions/ingest-documents/lib/schedule_test.ts
//
// The scheduled selection of fresh fetches and open-job continuations, at its
// public seam (a pure function).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { CrawlSource } from './pickDueSources.ts';
import { selectWork } from './schedule.ts';
import type { OpenJob } from './types.ts';

const NOW = new Date('2026-10-25T12:00:00.000Z');
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
    province: null,
    source_kind: 'html',
    data_urls: null,
    ...overrides,
  };
}

function job(id: string, sourceId: number, overrides: Partial<OpenJob> = {}): OpenJob {
  return {
    job_id: id,
    crawl_source_id: sourceId,
    created_at: hoursAgo(5),
    last_service_at: hoursAgo(1),
    fetched_at: hoursAgo(5),
    fingerprint: 'f',
    total: 100,
    staged: 20,
    reserved: 1,
    cap: 15,
    compatible: true,
    config_matches: true,
    source_enabled: true,
    crawl_frequency_hours: 24,
    ...overrides,
  };
}

const shape = (s: ReturnType<typeof selectWork>) => ({
  work: s.work.map(w => (w.kind === 'fresh' ? `fresh:${w.source.id}` : `continue:${w.job.job_id}`)),
  retire: s.retire.map(j => j.job_id),
});

// Falsifier: fresh work fills both places and an open job is never served.
Deno.test('with both queues, one fresh source and one continuation are selected', () => {
  const sources = [source(1, { last_crawled_at: null }), source(2, { last_crawled_at: null }), source(3)];
  const selected = selectWork(sources, [job('j3', 3)], NOW);
  assertEquals(shape(selected), { work: ['fresh:1', 'continue:j3'], retire: [] });
});

// Falsifier: with no open job the old two-source cap or due order changes.
Deno.test('with only fresh work, two sources in the existing due order', () => {
  const sources = [source(1), source(2, { last_crawled_at: null }), source(3, { last_crawled_at: hoursAgo(30) })];
  assertEquals(shape(selectWork(sources, [], NOW)), { work: ['fresh:2', 'fresh:1'], retire: [] });
});

// Falsifier: a failing job keeps the first place forever, or ties are not
// broken by creation time and id.
Deno.test('with only continuations, two by last service, creation time and id', () => {
  const sources = [source(1, { last_crawled_at: hoursAgo(1) }), source(2, { last_crawled_at: hoursAgo(1) }), source(3, { last_crawled_at: hoursAgo(1) })];
  const jobs = [
    job('b', 1, { last_service_at: hoursAgo(2), created_at: hoursAgo(9) }),
    job('a', 2, { last_service_at: hoursAgo(2), created_at: hoursAgo(9) }),
    job('c', 3, { last_service_at: null, created_at: hoursAgo(3) }),
  ];
  assertEquals(shape(selectWork(sources, jobs, NOW)), { work: ['continue:c', 'continue:a'], retire: [] });
});

// Falsifier: a due source with a usable open job is fetched again, losing
// its progress to a new attempt stamp.
Deno.test('a due source with a continuable job is continued, not fetched', () => {
  const sources = [source(1)];
  assertEquals(shape(selectWork(sources, [job('j1', 1)], NOW)), { work: ['continue:j1'], retire: [] });
});

// Falsifier: a snapshot older than the source frequency keeps being continued
// instead of being verified by a fresh fetch.
Deno.test('a stale snapshot is fetched fresh instead of continued', () => {
  const sources = [source(1, { last_crawled_at: hoursAgo(25) })];
  const stale = job('j1', 1, { fetched_at: hoursAgo(25) });
  assertEquals(shape(selectWork(sources, [stale], NOW)), { work: ['fresh:1'], retire: [] });
});

// Falsifier: an incompatible, changed or disabled job is selected, or left
// open forever.
Deno.test('ineligible jobs are never selected and go to retirement', () => {
  const sources = [source(1), source(2), source(3)];
  const jobs = [
    job('model', 1, { compatible: false }),
    job('config', 2, { config_matches: false }),
    job('disabled', 4, { source_enabled: false }),
  ];
  assertEquals(shape(selectWork(sources, jobs, NOW)), {
    work: ['fresh:1', 'fresh:2'],
    retire: ['model', 'config', 'disabled'],
  });
});

// The one-source fallback (MAX_SOURCES_PER_RUN lowered to 1). A compatible
// weekly job last served 48 hours ago and an hourly source attempted 2 hours ago.
const hourly = source(1, { crawl_frequency_hours: 1, last_crawled_at: hoursAgo(2) });
const weekly = source(2, { crawl_frequency_hours: 168, last_crawled_at: hoursAgo(1) });
const waiting = job('older', 2, {
  created_at: hoursAgo(72),
  last_service_at: hoursAgo(48),
  fetched_at: hoursAgo(72),
  crawl_frequency_hours: 168,
});

// Falsifier: with one place, fresh work always wins and the older job waits.
Deno.test('with one place, a continuation that waited longer is served', () => {
  assertEquals(shape(selectWork([hourly, weekly], [waiting], NOW, 1)), { work: ['continue:older'], retire: [] });
});

// Falsifier: the times are compared as text, so a UTC offset or PostgREST's
// microsecond form reverses which item waited longer.
Deno.test('with one place, the wait is compared as instants in any timestamp form', () => {
  const fresh = source(1, { crawl_frequency_hours: 1, last_crawled_at: '2026-10-25T09:00:00Z' });
  const later = { ...waiting, last_service_at: '2026-10-25T06:00:00-05:00' };
  assertEquals(shape(selectWork([fresh, weekly], [later], NOW, 1)).work, ['fresh:1']);
  const offsetFresh = source(1, { crawl_frequency_hours: 1, last_crawled_at: '2026-10-25T04:30:00-05:00' });
  const earlier = { ...waiting, last_service_at: '2026-10-25T08:00:00.123456+00:00' };
  assertEquals(shape(selectWork([offsetFresh, weekly], [earlier], NOW, 1)).work, ['continue:older']);
});

// Falsifier: a never-served job counts as waiting forever and displaces a
// source that waited longer, or a never-crawled source loses its place.
Deno.test('with one place, never-served jobs wait from creation and never-crawled sources wait longest', () => {
  const newJob = { ...waiting, last_service_at: null, created_at: hoursAgo(1), fetched_at: hoursAgo(1) };
  const dayOld = source(1, { last_crawled_at: hoursAgo(30) });
  assertEquals(shape(selectWork([dayOld, weekly], [newJob], NOW, 1)).work, ['fresh:1']);
  const oldJob = { ...waiting, last_service_at: null, created_at: hoursAgo(48) };
  assertEquals(shape(selectWork([hourly, weekly], [oldJob], NOW, 1)).work, ['continue:older']);
  const neverCrawled = source(1, { last_crawled_at: null });
  assertEquals(shape(selectWork([neverCrawled, weekly], [oldJob], NOW, 1)).work, ['fresh:1']);
});

// Falsifier: an older fresh source or an equal wait loses its place to the
// continuation, so the choice is not deterministic.
Deno.test('with one place, an older or equally old fresh source is served', () => {
  const older = source(1, { crawl_frequency_hours: 1, last_crawled_at: hoursAgo(50) });
  assertEquals(shape(selectWork([older, weekly], [waiting], NOW, 1)).work, ['fresh:1']);
  const tied = source(1, { crawl_frequency_hours: 1, last_crawled_at: '2026-10-23T12:00:00Z' });
  const sameInstant = { ...waiting, last_service_at: '2026-10-23T07:00:00.000000-05:00' };
  assertEquals(shape(selectWork([tied, weekly], [sameInstant], NOW, 1)).work, ['fresh:1']);
});

// Falsifier: one place with one queue no longer serves that queue's head.
Deno.test('with one place and one queue, the head of that queue is served', () => {
  assertEquals(shape(selectWork([hourly, source(3, { last_crawled_at: null })], [], NOW, 1)).work, ['fresh:3']);
  assertEquals(shape(selectWork([source(1, { last_crawled_at: hoursAgo(1) }), weekly], [waiting], NOW, 1)).work, ['continue:older']);
});

// Falsifier: the production two-source order changes with the waits.
Deno.test('with two places, fresh then continuation whichever waited longer', () => {
  assertEquals(shape(selectWork([hourly, weekly], [waiting], NOW, 2)).work, ['fresh:1', 'continue:older']);
  const older = source(1, { crawl_frequency_hours: 1, last_crawled_at: hoursAgo(50) });
  assertEquals(shape(selectWork([older, weekly], [waiting], NOW)).work, ['fresh:1', 'continue:older']);
});
