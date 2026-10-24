-- Official provincial nominee program landing pages, one per province.
--
-- Each row carries its province, so ingestion marks the document and chunks and
-- match_chunks serves them only to users in that province. Crawled weekly.
--
-- APPLY ORDER (shared database):
--   1. crawl_sources_province       (adds the column)
--   2. match_chunks_province_filter  (so no caller can receive these chunks
--                                     without a province filter)
--   3. deploy ingest-documents with province support
--   4. this seed
-- The previous ingest-documents code does not know the province column. If it
-- crawled these rows, it would store their chunks as national.
--
-- Pages verified with HTTP 200 on 2026-10-23 and 2026-10-24:
--   Ontario  OINP    https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp
--   BC       BC PNP  https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program
--   Alberta  AAIP    https://www.alberta.ca/alberta-advantage-immigration-program
insert into public.crawl_sources
  (url, label, subject, enabled, crawl_frequency_hours, province)
values
  ('https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp',
   'Ontario Immigrant Nominee Program (OINP)', 'pr', true, 168, 'Ontario'),
  ('https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program',
   'BC Provincial Nominee Program (BC PNP)', 'pr', true, 168, 'British Columbia'),
  ('https://www.alberta.ca/alberta-advantage-immigration-program',
   'Alberta Advantage Immigration Program (AAIP)', 'pr', true, 168, 'Alberta')
on conflict (url) do nothing;
