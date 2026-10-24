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

/** Fields of one record that reach its chunk metadata. */
export interface RecordStamp {
  /** The record's own date (YYYY-MM-DD), or null when the source gives none. */
  publishedAt: string | null;
  sourceUrl?: string;
}

/**
 * Metadata of one record's chunk. The record keeps its own date; the fetch date
 * stands in only when the source gives none. A record with its own page keeps
 * that address, so a citation can point at the item.
 */
export function recordChunkMetadata(
  stamp: Pick<CrawlStamp, 'fetchedAt' | 'province'>,
  record: RecordStamp
): Metadata {
  return {
    source: 'crawler',
    fetched_at: stamp.fetchedAt,
    published_at: record.publishedAt ?? stamp.fetchedAt.slice(0, 10),
    ...(stamp.province === null ? {} : { province: stamp.province }),
    ...(record.sourceUrl === undefined ? {} : { source_url: record.sourceUrl }),
  };
}

/** Newest record date, for the document. Records keep their own dates. */
export function newestPublishedAt(
  fetchedAt: string,
  records: RecordStamp[]
): string {
  const dates = records.map(r => r.publishedAt).filter(d => d !== null);
  return dates.length === 0
    ? fetchedAt.slice(0, 10)
    : dates.reduce((a, b) => (a! > b! ? a : b))!;
}
