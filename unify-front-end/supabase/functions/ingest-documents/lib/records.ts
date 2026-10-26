import { convertExpressEntryRounds } from './ircc/expressEntry.ts';
import { convertNewsroom } from './ircc/newsroom.ts';
import {
  convertProcessingTimes,
  type ProcessingTimeFiles,
} from './ircc/processingTimes.ts';
import type { SourceRecord } from './ircc/types.ts';
import {
  MAX_SOURCE_DATA_URLS,
  MAX_SOURCE_FILE_BYTES,
  MAX_SOURCE_TOTAL_BYTES,
  ResourceLimitError,
} from './limits.ts';
import type { CrawlSource } from './pickDueSources.ts';
import type { FetchOptions } from './types.ts';

export type { SourceRecord };

// The five official files behind IRCC's "Check processing times" page, by the
// last segment of their address.
const PROCESSING_FILES: Record<string, keyof ProcessingTimeFiles> = {
  'data-ptime-en.json': 'countryTimes',
  'data-ptime-non-country-en.json': 'nonCountryTimes',
  'data-country-name-en.json': 'countryNames',
  'flpt-en.json': 'flpt',
  'flpt-by-week-en.json': 'flptByWeek',
};

type FetchPage = (url: string, options?: FetchOptions) => Promise<string>;

/** Fetches within the source's byte allowance and stops when the signal aborts. */
interface Reader {
  signal?: AbortSignal;
  used: number;
}

async function fetchJson(
  url: string,
  fetchPage: FetchPage,
  reader: Reader
): Promise<unknown> {
  if (new URL(url).protocol !== 'https:') {
    throw new Error(`Data address is not https: ${url}`);
  }
  reader.signal?.throwIfAborted();
  const allowance = Math.min(
    MAX_SOURCE_FILE_BYTES,
    MAX_SOURCE_TOTAL_BYTES - reader.used
  );
  const body = await fetchPage(url, {
    signal: reader.signal,
    maxBytes: allowance,
  });
  const bytes = new TextEncoder().encode(body).byteLength;
  if (bytes > allowance) {
    throw new ResourceLimitError(
      bytes > MAX_SOURCE_FILE_BYTES ? 'file size' : 'source size'
    );
  }
  reader.used += bytes;
  reader.signal?.throwIfAborted();
  try {
    // IRCC serves some files with a byte order mark.
    return JSON.parse(body.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

/**
 * Reads a record source: fetches its official JSON files and converts them to
 * one record per fact. Throws when a file cannot be read or has an unexpected
 * shape, so a failed crawl never replaces good content with less.
 */
export async function loadSourceRecords(
  source: CrawlSource,
  fetchPage: FetchPage,
  now: Date,
  options: { signal?: AbortSignal } = {}
): Promise<SourceRecord[]> {
  const urls = source.data_urls ?? [];
  if (source.source_kind !== 'html' && urls.length === 0) {
    throw new Error(`Source ${source.id} has no data_urls`);
  }
  // Refused before any fetch.
  if (urls.length > MAX_SOURCE_DATA_URLS) {
    throw new ResourceLimitError('data address count');
  }
  const reader: Reader = { signal: options.signal, used: 0 };
  switch (source.source_kind) {
    case 'ircc_express_entry_rounds':
      return convertExpressEntryRounds(
        await fetchJson(urls[0], fetchPage, reader)
      );
    case 'ircc_newsroom':
      return convertNewsroom(await fetchJson(urls[0], fetchPage, reader), now);
    case 'ircc_processing_times': {
      // Find all five files before fetching any, so a bad configuration fails
      // without a request.
      const found = Object.entries(PROCESSING_FILES).map(([name, key]) => {
        const url = urls.find(u => new URL(u).pathname.endsWith(`/${name}`));
        if (url === undefined) {
          throw new Error(`Source ${source.id} data_urls has no ${name}`);
        }
        return { key, url };
      });
      const files: Partial<ProcessingTimeFiles> = {};
      for (const { key, url } of found) {
        files[key] = await fetchJson(url, fetchPage, reader);
      }
      const records = convertProcessingTimes(files as ProcessingTimeFiles).records;
      options.signal?.throwIfAborted();
      return records;
    }
    default:
      throw new Error(`Unknown source kind: ${String(source.source_kind)}`);
  }
}
