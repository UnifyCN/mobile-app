-- IRCC record sources: Express Entry rounds, processing times, newsroom.
--
-- Moves two existing sources to 24 hours on their official JSON files, and adds
-- one newsroom source. `url` stays the human page and is the citation; the
-- JSON files are in `data_urls`.
--
-- APPLY ORDER (shared database): after crawl_sources_record_sources and after
-- ingest-documents with record source support is deployed. The previous function
-- ignores source_kind and data_urls, so it would crawl these rows as plain pages
-- every 24 hours. This is the step that starts the unattended 24-hour crawls.
--
-- Evidence (HTTP 200, application/json, fetched 2026-10-24):
--   ee_rounds_123_en.json          referenced by .../express-entry/rounds-invitations.html
--                                   (data-wb-jsonmanager name roundsofinvitation)
--   data-ptime-en.json             referenced by .../application/check-processing-times.html
--   data-ptime-non-country-en.json  (data-wb-jsonmanager names ptime_country, ptime,
--   data-country-name-en.json       ptime_flpt, ptime_trflpt, and the country list
--   flpt-en.json                    fragments)
--   flpt-by-week-en.json
--   news API                       the all-types feed that IRCC's own RSS page links:
--                                   .../news/rss.html (without format=atom it returns
--                                   JSON; pick=100 is the page size IRCC uses for its
--                                   per-type feeds). The API does not expose IRCC
--                                   Notices; they are not in this source.

do $$
declare
  affected integer;
begin
  update public.crawl_sources
     set crawl_frequency_hours = 24,
         source_kind = 'ircc_express_entry_rounds',
         data_urls = array[
           'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json'
         ]
   where url = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Express Entry rounds crawl source not found';
  end if;

  update public.crawl_sources
     set crawl_frequency_hours = 24,
         source_kind = 'ircc_processing_times',
         data_urls = array[
           'https://www.canada.ca/content/dam/ircc/documents/json/data-ptime-en.json',
           'https://www.canada.ca/content/dam/ircc/documents/json/data-ptime-non-country-en.json',
           'https://www.canada.ca/content/dam/ircc/documents/json/data-country-name-en.json',
           'https://www.canada.ca/content/dam/ircc/documents/json/flpt-en.json',
           'https://www.canada.ca/content/dam/ircc/documents/json/flpt-by-week-en.json'
         ]
   where url = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Processing times crawl source not found';
  end if;
end;
$$;

insert into public.crawl_sources
  (url, label, subject, enabled, crawl_frequency_hours, source_kind, data_urls)
values
  ('https://www.canada.ca/en/immigration-refugees-citizenship/news.html',
   'IRCC Newsroom', 'general', true, 24, 'ircc_newsroom',
   array[
     'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=100'
   ])
on conflict (url) do update
  set source_kind = excluded.source_kind,
      data_urls = excluded.data_urls,
      crawl_frequency_hours = excluded.crawl_frequency_hours;
