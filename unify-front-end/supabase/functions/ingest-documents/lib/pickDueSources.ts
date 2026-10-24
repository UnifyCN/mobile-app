/**
 * How a source is read. 'html' crawls the page at `url`. The other kinds read
 * the official JSON in `data_urls` and keep `url` as the citation.
 */
export type SourceKind =
  | 'html'
  | 'ircc_express_entry_rounds'
  | 'ircc_processing_times'
  | 'ircc_newsroom';

export interface CrawlSource {
  id: number;
  url: string;
  label: string | null;
  enabled: boolean;
  crawl_frequency_hours: number;
  last_crawled_at: string | null;
  /** Canonical English province or territory name. Null means national. */
  province: string | null;
  source_kind: SourceKind;
  /** Official JSON addresses for a non-html source. */
  data_urls: string[] | null;
}

export function pickDueSources(
  sources: CrawlSource[],
  now: Date,
  limit = 2
): CrawlSource[] {
  return sources
    .filter(
      s =>
        s.enabled &&
        (s.last_crawled_at === null ||
          now.getTime() - new Date(s.last_crawled_at).getTime() >
            s.crawl_frequency_hours * 3_600_000)
    )
    .sort((a, b) => {
      if (a.last_crawled_at === b.last_crawled_at) return a.id - b.id;
      if (a.last_crawled_at === null) return -1;
      if (b.last_crawled_at === null) return 1;
      return a.last_crawled_at < b.last_crawled_at ? -1 : 1;
    })
    .slice(0, limit);
}
