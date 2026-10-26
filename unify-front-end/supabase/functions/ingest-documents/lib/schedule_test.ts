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
