import type { CheckedEmbeddings } from '../../_shared/embeddings.ts';
import { ingestSource } from './ingest.ts';
import { type CrawlSource, pickDueSources } from './pickDueSources.ts';
import { handleRebuildAction, type RebuildStore } from './rebuild.ts';
import type { IngestDeps, SourceResult } from './types.ts';

/** Due sources handled per scheduled run. Lower to 1 if the worker still runs out of memory. */
export const MAX_SOURCES_PER_RUN = 2;

export type HandlerDeps = IngestDeps & {
  serviceRoleKey: string;
  /** The administrative embedding rebuild; absent in tests of the crawl alone. */
  rebuild?: RebuildStore;
  /**
   * The rebuild's embedding call: the vectors and the receipt of the response
   * that produced them. Required with `rebuild`.
   */
  embedChecked?: (texts: string[]) => Promise<CheckedEmbeddings>;
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

export async function handleIngestRequest(
  req: Request,
  deps: HandlerDeps
): Promise<Response> {
  if (!isAuthorized(req, deps.serviceRoleKey)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const parsed = await readBody(req);
  if (parsed === null) return json({ error: 'Invalid JSON body' }, 400);

  // The one administrative action. Anything else with an action is refused,
  // so a mistyped action can never start a crawl.
  if (parsed.action !== undefined) {
    return parsed.action === 'embedding_rebuild'
      ? await handleRebuildAction(parsed, deps)
      : json({ error: 'Unknown action' }, 400);
  }

  const { store } = deps;
  let selected: CrawlSource[];

  if (parsed.crawl_source_id !== undefined && parsed.crawl_source_id !== null) {
    // Manual call for one stored source.
    const id = parsed.crawl_source_id;
    const source =
      typeof id === 'number' || typeof id === 'string'
        ? await store.getCrawlSource(id)
        : null;
    if (!source) {
      return json({ error: `crawl_source_id ${String(id)} not found` }, 400);
    }
    selected = [source];
  } else if (parsed.url !== undefined && parsed.url !== null) {
    // Manual call by URL. The URL only names a stored, enabled source; the
    // fetch always uses the stored row, never the request value.
    const source =
      typeof parsed.url === 'string'
        ? await store.findEnabledCrawlSourceByUrl(parsed.url)
        : null;
    if (!source) {
      return json({ error: 'URL not in crawl_sources allowlist' }, 403);
    }
    selected = [source];
  } else {
    // Scheduled call: pick the due sources.
    selected = pickDueSources(
      await store.listCrawlSources(),
      deps.now(),
      MAX_SOURCES_PER_RUN
    );
  }

  // One source at a time: the next fetch starts after the previous source has
  // been written, so only one page is in memory.
  const results: SourceResult[] = [];
  for (const source of selected) {
    try {
      results.push(await ingestSource(source, deps));
    } catch (error) {
      // Source-level failure (for example the database): report it, keep going.
      const message = error instanceof Error ? error.message : 'Ingest failed';
      console.error(`Ingest failed for source ${source.id}: ${message}`);
      results.push({ source_id: source.id, status: 'error', error: message });
    }
  }
  return json({ results });
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
