// Shared builders for ingestion tests. Not imported by production code.
import {
  EMBEDDING_CONTRACT,
  EMBEDDING_MODEL,
} from '../../_shared/embeddings.ts';
import { FakeStore } from './fakeStore.ts';
import { ingestSource } from './ingest.ts';
import type { CrawlSource } from './pickDueSources.ts';
import type { IngestDeps, SourceResult } from './types.ts';

export const NOW = new Date('2026-10-23T12:00:00.000Z');

export function makeSource(
  id: number,
  overrides: Partial<CrawlSource> = {}
): CrawlSource {
  return {
    id,
    url: `https://www.canada.ca/page-${id}`,
    label: `Page ${id}`,
    enabled: true,
    crawl_frequency_hours: 24,
    last_crawled_at: null,
    province: null,
    source_kind: 'html',
    data_urls: null,
    ...overrides,
  };
}

/** Prose of about `chars` characters, distinct per `seed`, with no HTML tags. */
export function prose(chars: number, seed = 'a'): string {
  const sentence = `Applicants in group ${seed} must submit every required document before the deadline. `;
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
}

export function page(body: string, dateModified?: string): string {
  const meta = dateModified
    ? `<meta name="dcterms.modified" title="W3CDTF" content="${dateModified}"/>`
    : '';
  return `<html><head>${meta}</head><body><main><p>${body}</p></main></body></html>`;
}

/** The receipt the real adapter gives a canonical answer of `checked` vectors. */
export function receipt(checked: number) {
  return {
    model: EMBEDDING_MODEL,
    contract: EMBEDDING_CONTRACT,
    identity: 'canonical' as const,
    checked,
    native_dimensions: 4096,
    stored_dimensions: 1536,
  };
}

export interface Harness {
  store: FakeStore;
  deps: IngestDeps;
  embedBatches: number[];
  fetched: string[];
  /** Clock that moves forward one minute on every read. */
  clock: () => Date;
}

export function makeHarness(
  sources: CrawlSource[],
  pages: Record<string, string | Error>,
  options: { failEmbedOnCall?: number } = {}
): Harness {
  const store = new FakeStore(sources);
  const embedBatches: number[] = [];
  const fetched: string[] = [];
  let tick = 0;
  const clock = () => new Date(NOW.getTime() + tick++ * 60_000);
  const deps: IngestDeps = {
    store,
    now: clock,
    fetchPage: async url => {
      fetched.push(url);
      store.events.push(`fetch:${url}`);
      await Promise.resolve();
      const result = pages[url];
      if (result === undefined) throw new Error(`HTTP 404: ${url}`);
      if (result instanceof Error) throw result;
      return result;
    },
    embedChecked: async texts => {
      embedBatches.push(texts.length);
      store.events.push(`embed:${texts.length}`);
      await Promise.resolve();
      if (options.failEmbedOnCall === embedBatches.length) {
        throw new Error('embedding service unavailable');
      }
      return { vectors: texts.map(() => [0.1, 0.2]), receipt: receipt(texts.length) };
    },
  };
  return { store, deps, embedBatches, fetched, clock };
}

/**
 * Calls ingestSource again while its generation is pending at the
 * invocation's send limit: one call sends at most 25 provider requests, so a
 * 1950-record source takes four calls. Any other outcome is returned as is.
 */
export async function ingestUntilSettled(
  source: CrawlSource,
  deps: IngestDeps,
  maxCalls = 10
): Promise<SourceResult> {
  let result = await ingestSource(source, deps);
  for (let call = 1; call < maxCalls; call++) {
    if (result.status !== 'pending' || result.stop_reason !== 'send_limit') {
      return result;
    }
    result = await ingestSource(source, deps);
  }
  return result;
}
