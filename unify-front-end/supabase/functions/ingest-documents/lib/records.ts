import { convertExpressEntryRounds } from './ircc/expressEntry.ts';
import { convertNewsroom } from './ircc/newsroom.ts';
import {
  convertProcessingTimes,
  type ProcessingTimeFiles,
} from './ircc/processingTimes.ts';
import type { SourceRecord } from './ircc/types.ts';
import type { CrawlSource } from './pickDueSources.ts';

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

async function fetchJson(
  url: string,
  fetchPage: (url: string) => Promise<string>
): Promise<unknown> {
  if (new URL(url).protocol !== 'https:') {
    throw new Error(`Data address is not https: ${url}`);
  }
  const body = await fetchPage(url);
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
  fetchPage: (url: string) => Promise<string>,
  now: Date
): Promise<SourceRecord[]> {
  const urls = source.data_urls ?? [];
  if (source.source_kind !== 'html' && urls.length === 0) {
    throw new Error(`Source ${source.id} has no data_urls`);
  }
  switch (source.source_kind) {
    case 'ircc_express_entry_rounds':
      return convertExpressEntryRounds(await fetchJson(urls[0], fetchPage));
    case 'ircc_newsroom':
      return convertNewsroom(await fetchJson(urls[0], fetchPage), now);
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
        files[key] = await fetchJson(url, fetchPage);
      }
      return convertProcessingTimes(files as ProcessingTimeFiles).records;
    }
    default:
      throw new Error(`Unknown source kind: ${String(source.source_kind)}`);
  }
}
