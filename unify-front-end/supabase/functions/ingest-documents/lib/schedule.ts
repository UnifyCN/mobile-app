import { type CrawlSource, pickDueSources } from './pickDueSources.ts';
import type { OpenJob } from './types.ts';

/** One selected unit of work: a fresh fetch, or an open job to continue. */
export type WorkItem =
  | { kind: 'fresh'; source: CrawlSource }
  | { kind: 'continue'; source: CrawlSource; job: OpenJob };

/**
 * A job worth continuing: compatible with the serving model and contract,
 * fetched under the source's current enabled configuration, and younger than
 * the source's crawl frequency (an older snapshot is fetched again, which
 * verifies equal content or supersedes the private work).
 */
export function isContinuable(job: OpenJob, now: Date): boolean {
  return eligible(job) && !isStale(job, now);
}

function eligible(job: OpenJob): boolean {
  return job.compatible && job.config_matches && job.source_enabled;
}

function isStale(job: OpenJob, now: Date): boolean {
  if (job.crawl_frequency_hours === null) return true;
  const age = now.getTime() - new Date(job.fetched_at).getTime();
  return age >= job.crawl_frequency_hours * 3_600_000;
}

const NEVER = '';

/**
 * The scheduled selection, at most `limit` (2) sources, served in order. When
 * both queues have work: one fresh source in the existing due order, then one
 * continuation. Otherwise up to `limit` from the one queue. Continuations go
 * by last service, creation time and id, so a failing job moves behind the
 * others once its service starts. Jobs that can never promote are returned
 * for retirement and never selected.
 */
export function selectWork(
  sources: CrawlSource[],
  jobs: OpenJob[],
  now: Date,
  limit = 2
): { work: WorkItem[]; retire: OpenJob[] } {
  const byId = new Map(sources.map(s => [s.id, s]));
  const retire = jobs.filter(j => !eligible(j));
  const continuations = jobs
    .filter(j => eligible(j) && !isStale(j, now) && byId.has(j.crawl_source_id))
    .sort(
      (a, b) =>
        (a.last_service_at ?? NEVER).localeCompare(b.last_service_at ?? NEVER) ||
        a.created_at.localeCompare(b.created_at) ||
        a.job_id.localeCompare(b.job_id)
    )
    .map(job => ({
      kind: 'continue' as const,
      source: byId.get(job.crawl_source_id)!,
      job,
    }));
  const continued = new Set(continuations.map(c => c.source.id));
  const fresh = pickDueSources(
    sources.filter(s => !continued.has(s.id)),
    now,
    limit
  ).map(source => ({ kind: 'fresh' as const, source }));
  const work: WorkItem[] =
    fresh.length > 0 && continuations.length > 0
      ? [fresh[0], continuations[0]].slice(0, limit)
      : [...fresh, ...continuations].slice(0, limit);
  return { work, retire };
}
