import type { Metadata } from './types.ts';

export interface CrawlStamp {
  /** Full ISO timestamp of the fetch. */
  fetchedAt: string;
  /** Page Date modified (YYYY-MM-DD) or null. */
  dateModified: string | null;
  /** Source province, or null for a national source. */
  province: string | null;
}

/** Date used for "as of": the page's Date modified, else the fetch date. */
export function publishedAt({ fetchedAt, dateModified }: CrawlStamp): string {
  return dateModified ?? fetchedAt.slice(0, 10);
}

export function chunkMetadata(stamp: CrawlStamp): Metadata {
  return {
    source: 'crawler',
    fetched_at: stamp.fetchedAt,
    published_at: publishedAt(stamp),
    // A national chunk has no province key. Retrieval reads absent as national.
    ...(stamp.province === null ? {} : { province: stamp.province }),
  };
}

export function documentMetadata(
  stamp: CrawlStamp,
  counts: { wordCount: number; chunkCount: number }
): Metadata {
  return {
    word_count: counts.wordCount,
    chunk_count: counts.chunkCount,
    ...chunkMetadata(stamp),
  };
}
