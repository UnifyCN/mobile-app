export interface CrawlSource {
  id: number;
  url: string;
  label: string | null;
  enabled: boolean;
  crawl_frequency_hours: number;
  last_crawled_at: string | null;
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
