-- Province on crawl sources.
--
-- A source with a province marks its pages as belonging to that province.
-- Ingestion copies the value into document and chunk metadata, and
-- match_chunks (next migration) uses it to keep one province's chunks away from
-- users in another. Null means national, so all existing sources stay national.
alter table public.crawl_sources
  add column if not exists province text;

-- The 13 full English names, as in CANADIAN_PROVINCES in
-- unify-front-end/constants/LocationData.ts. Null passes a check constraint.
alter table public.crawl_sources
  drop constraint if exists crawl_sources_province_check,
  add constraint crawl_sources_province_check check (
    province in (
      'Alberta',
      'British Columbia',
      'Manitoba',
      'New Brunswick',
      'Newfoundland and Labrador',
      'Northwest Territories',
      'Nova Scotia',
      'Nunavut',
      'Ontario',
      'Prince Edward Island',
      'Quebec',
      'Saskatchewan',
      'Yukon'
    )
  );
