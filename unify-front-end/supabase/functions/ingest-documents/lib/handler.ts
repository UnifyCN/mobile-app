import {
  BackstopError,
  Budget,
  CONTINUATION_START_MS,
  FRESH_START_MS,
  MAX_SENDS_PER_INVOCATION,
  realTimers,
} from './budget.ts';
import {
  continueJob,
  ingestSource,
  newProgress,
  pendingResult,
  type Progress,
  type SourceRun,
} from './ingest.ts';
import type { CrawlSource } from './pickDueSources.ts';
import { handleRebuildAction, type RebuildStore } from './rebuild.ts';
import { isContinuable, selectWork, type WorkItem } from './schedule.ts';
import type { IngestDeps, SourceResult } from './types.ts';

/** Sources handled per scheduled run. Lower to 1 if the worker still runs out of memory. */
export const MAX_SOURCES_PER_RUN = 2;
/** The ingestion response format: per-source results, pending work, unstarted sources. */
export const RESPONSE_VERSION = 2;

export type HandlerDeps = IngestDeps & {
  serviceRoleKey: string;
  /** The administrative embedding rebuild; absent in tests of the crawl alone. */
  rebuild?: RebuildStore;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Compares in time that depends only on the length of the longer value. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Only the service role key may call this function (cron and manual calls). */
export function isAuthorized(req: Request, serviceRoleKey: string): boolean {
  if (!serviceRoleKey) return false;
  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  return match !== null && safeEqual(match[1], serviceRoleKey);
}

/** What the invocation has done so far, answerable at any moment. */
class Report {
  /** Null until the sources are chosen. */
  private selected: number[] | null = null;
  private results: SourceResult[] = [];
  private progress = new Map<number, Progress>();
  private skippedStart = new Set<number>();

  constructor(private readonly budget: Budget) {}

  select(items: WorkItem[]): void {
    this.selected = items.map(i => i.source.id);
  }
  start(sourceId: number): Progress {
    const progress = newProgress(sourceId);
    this.progress.set(sourceId, progress);
    return progress;
  }
  notStarted(sourceId: number): void {
    this.skippedStart.add(sourceId);
  }
  finish(result: SourceResult): void {
    this.results.push(result);
  }
  /** Whether the body was read and the sources chosen. */
  get setupComplete(): boolean {
    return this.selected !== null;
  }
  /**
   * Started but unfinished sources are pending at the backstop. Before the
   * sources are chosen nothing is known about them, so that is all it says.
   */
  body(atBackstop: boolean) {
    if (this.selected === null) {
      return {
        version: RESPONSE_VERSION,
        results: [],
        unstarted_source_ids: null,
        provider_sends: this.budget.sends,
        setup_complete: false,
        stop_reason: 'response_backstop',
      };
    }
    const finished = new Set(this.results.map(r => r.source_id));
    const results = [...this.results];
    if (atBackstop) {
      for (const p of this.progress.values()) {
        if (p.started && !finished.has(p.source_id)) {
          results.push(pendingResult(p, 'response_backstop'));
        }
      }
    }
    return {
      version: RESPONSE_VERSION,
      results,
      unstarted_source_ids: this.selected.filter(
        id =>
          this.skippedStart.has(id) ||
          !(this.progress.get(id)?.started ?? false)
      ),
      provider_sends: this.budget.sends,
    };
  }
}

export async function handleIngestRequest(
  req: Request,
  deps: HandlerDeps
): Promise<Response> {
  // The invocation's budget starts at handler entry.
  const budget = new Budget(deps.timers ?? realTimers);
  try {
    if (!isAuthorized(req, deps.serviceRoleKey)) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Reading the body, choosing the sources and serving them all run under
    // the response backstop.
    const report = new Report(budget);
    const work = run(req, deps, budget, report);
    const first = await Promise.race([
      work,
      budget.backstop.then(() => 'backstop' as const),
    ]);
    if (first !== 'backstop') {
      // The administrative rebuild runs as before, outside the crawl's budget.
      return first instanceof Response ? first : await first.rebuild();
    }
    // Nothing may start now; the work in flight stops at its next check.
    budget.close();
    work.catch(() => {});
    return json(report.body(true), report.setupComplete ? 200 : 503);
  } finally {
    budget.dispose();
  }
}

/**
 * One request after authentication: its answer, or the administrative
 * rebuild to run. After the backstop every store call is refused and no
 * source starts, so a step that finishes late starts nothing.
 */
async function run(
  req: Request,
  deps: HandlerDeps,
  budget: Budget,
  report: Report
): Promise<Response | { rebuild: () => Promise<Response> }> {
  const parsed = await readBody(req);
  if (parsed === null) return json({ error: 'Invalid JSON body' }, 400);

  // The one administrative action. Anything else with an action is refused,
  // so a mistyped action can never start a crawl.
  if (parsed.action !== undefined) {
    return parsed.action === 'embedding_rebuild'
      ? { rebuild: () => handleRebuildAction(parsed, deps) }
      : json({ error: 'Unknown action' }, 400);
  }

  const selection = await select(parsed, deps, budget);
  if (selection instanceof Response) return selection;

  report.select(selection);
  await serve(selection, deps, budget, report);
  return json(report.body(false));
}

/** The sources this call serves, or a refusal for a bad manual call. */
async function select(
  parsed: Record<string, unknown>,
  deps: HandlerDeps,
  budget: Budget
): Promise<WorkItem[] | Response> {
  const { store } = deps;
  const rpc = <T>(f: (call: { signal: AbortSignal }) => Promise<T>) => {
    budget.assertOpen();
    const scoped = budget.rpcSignal();
    return f({ signal: scoped.signal }).finally(scoped.dispose);
  };
  let manual: CrawlSource | null = null;
  if (parsed.crawl_source_id !== undefined && parsed.crawl_source_id !== null) {
    // Manual call for one stored source.
    const id = parsed.crawl_source_id;
    const source =
      typeof id === 'number' || typeof id === 'string'
        ? await rpc(c => store.getCrawlSource(id, c))
        : null;
    if (!source) {
      return json({ error: `crawl_source_id ${String(id)} not found` }, 400);
    }
    manual = source;
  } else if (parsed.url !== undefined && parsed.url !== null) {
    // Manual call by URL. The URL only names a stored, enabled source; the
    // fetch always uses the stored row, never the request value.
    const source =
      typeof parsed.url === 'string'
        ? await rpc(c => store.findEnabledCrawlSourceByUrl(parsed.url as string, c))
        : null;
    if (!source) {
      return json({ error: 'URL not in crawl_sources allowlist' }, 403);
    }
    manual = source;
  }

  if (manual) {
    const jobs = await rpc(c => store.listOpenJobs(c));
    const job = jobs.find(j => j.crawl_source_id === manual!.id);
    if (job && isContinuable(job, deps.now())) {
      return [{ kind: 'continue', source: manual, job }];
    }
    return [{ kind: 'fresh', source: manual }];
  }

  // Scheduled call: due sources and open jobs, fairly.
  const sources = await rpc(c => store.listCrawlSources(c));
  const jobs = await rpc(c => store.listOpenJobs(c));
  const { work, retire } = selectWork(
    sources,
    jobs,
    deps.now(),
    MAX_SOURCES_PER_RUN
  );
  for (const job of retire) {
    // Private cleanup only; a failure leaves the job inert until next time.
    await rpc(c => store.retireJob(job.job_id, c)).catch(error =>
      console.error(`Retiring job ${job.job_id} failed: ${error}`)
    );
  }
  return work;
}

/**
 * Serves the selected sources one at a time. Each starts only with its share
 * of the remaining work time (the time left divided by the sources left), so
 * the first of two gets at most half and the second the rest; and it may use
 * the sends left, less one kept for each source after it.
 */
async function serve(
  items: WorkItem[],
  deps: HandlerDeps,
  budget: Budget,
  report: Report
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const later = items.length - i - 1;
    const share = budget.workLeft() / (later + 1);
    const needed =
      item.kind === 'fresh' ? FRESH_START_MS : CONTINUATION_START_MS;
    if (budget.closed || share < needed) {
      // Not started: not claimed, not stamped, still due.
      report.notStarted(item.source.id);
      continue;
    }
    const run: SourceRun = {
      budget,
      shareEndsAt: budget.elapsed() + share,
      sendLimit: Math.max(0, MAX_SENDS_PER_INVOCATION - budget.sends - later),
      progress: report.start(item.source.id),
    };
    try {
      report.finish(
        item.kind === 'fresh'
          ? await ingestSource(item.source, deps, run)
          : await continueJob(item.source, item.job, deps, run)
      );
    } catch (error) {
      if (error instanceof BackstopError || budget.closed) return;
      // Source-level failure (for example the database): report it, keep going.
      const message = error instanceof Error ? error.message : 'Ingest failed';
      console.error(`Ingest failed for source ${item.source.id}: ${message}`);
      report.finish({ source_id: item.source.id, status: 'error', error: message });
    }
  }
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.trim() === '') return {};
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
