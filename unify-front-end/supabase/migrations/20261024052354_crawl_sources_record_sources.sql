-- Record sources on crawl_sources.
--
-- A source of kind 'html' is crawled as before: the page at `url` is fetched,
-- cleaned and chunked. The other kinds read official JSON files listed in
-- `data_urls` and write one chunk per record, each with its own dates. `url`
-- stays the page a user can open, so it remains the citation.
--   ircc_express_entry_rounds  ten most recent Express Entry draws
--   ircc_processing_times      every IRCC processing time
--   ircc_newsroom              IRCC news items of the last 30 days
--
-- The ingest-documents function selects both columns, so apply this migration
-- BEFORE deploying the function. Adding the columns changes no behaviour: all
-- existing sources get source_kind 'html'.
--
-- APPLY ORDER (shared database):
--   1. crawl_sources_province       (earlier ticket)
--   2. match_chunks_province_filter (earlier ticket)
--   3. this migration
--   4. match_chunks_chunk_source_url
--   5. ingest_refresh_generations (the lease, staging and promotion functions)
--   6. deploy ingest-documents with record source support
--   7. seed_province_crawl_sources, then seed_ircc_record_sources
--   8. the hourly driver migration (ingest_documents_single_scheduled_call)
-- A seed activates unattended crawls, so it comes after the function that can
-- read it. The driver migration can be applied after the function is live.
alter table public.crawl_sources
  add column if not exists source_kind text not null default 'html',
  add column if not exists data_urls text[];

alter table public.crawl_sources
  drop constraint if exists crawl_sources_source_kind_check,
  add constraint crawl_sources_source_kind_check check (
    source_kind in (
      'html',
      'ircc_express_entry_rounds',
      'ircc_processing_times',
      'ircc_newsroom'
    )
  );

-- A record source without an address to read would only ever fail.
alter table public.crawl_sources
  drop constraint if exists crawl_sources_record_source_needs_data_urls,
  add constraint crawl_sources_record_source_needs_data_urls check (
    source_kind = 'html' or coalesce(cardinality(data_urls), 0) > 0
  );
