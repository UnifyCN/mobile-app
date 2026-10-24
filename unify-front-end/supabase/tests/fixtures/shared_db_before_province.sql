-- Local test baseline: the shared database as it was before the province work.
--
-- Used only by the PGlite tests next to this file. It is NOT a migration.
--
-- * Roles and default privileges copy what Supabase creates for the public
--   schema, so a new function is callable by anon and authenticated until a
--   migration revokes it.
-- * The two knowledge tables and crawl_sources keep only the columns that
--   match_chunks and the province work read. The knowledge tables were created
--   out of band, so no repo migration defines them.
-- * match_chunks below is the HOSTED definition read from pg_get_functiondef on
--   2026-10-24. The checked-in migrations hold an older variant, so do not
--   replace this text with them.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

create extension if not exists vector;

create table public.knowledge_documents (
  id bigserial primary key,
  title text,
  storage_path text,
  subject text,
  section text,
  source_url text,
  content_hash text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.knowledge_chunks (
  id bigserial primary key,
  document_id bigint not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Same definition as 20260320_rag_ingestion_pipeline.sql section 3.
create table public.crawl_sources (
  id bigserial primary key,
  url text not null unique,
  label text,
  subject text,
  enabled boolean not null default true,
  crawl_frequency_hours int not null default 24,
  last_crawled_at timestamptz,
  created_at timestamptz default now()
);
revoke all on public.crawl_sources from public, anon, authenticated;
grant all on public.crawl_sources to service_role;

CREATE OR REPLACE FUNCTION public.match_chunks(query_embedding vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 5)
 RETURNS TABLE(id bigint, document_id bigint, chunk_index integer, chunk_text text, similarity double precision, knowledge_documents jsonb)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select
    kc.id,
    kc.document_id,
    kc.chunk_index,
    kc.chunk_text,
    (
      (1 - (kc.embedding <=> query_embedding)) * 0.85
      + greatest(0, 1.0 - extract(epoch from (now() - coalesce(kc.updated_at, kc.created_at))) / (180.0 * 86400)) * 0.15
    )::float as similarity,
    jsonb_build_object(
      'id', kd.id,
      'title', kd.title,
      'storage_path', kd.storage_path,
      'subject', kd.subject,
      'section', kd.section,
      'source_url', kd.source_url,
      'updated_at', kd.updated_at
    ) as knowledge_documents
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kc.document_id = kd.id
  where kc.embedding is not null
    and (
      match_threshold <= 0
      or 1 - (kc.embedding <=> query_embedding) > match_threshold
    )
  order by
    (
      (1 - (kc.embedding <=> query_embedding)) * 0.85
      + greatest(0, 1.0 - extract(epoch from (now() - coalesce(kc.updated_at, kc.created_at))) / (180.0 * 86400)) * 0.15
    ) desc
  limit match_count;
end;
$function$;

revoke execute on function public.match_chunks(vector, double precision, integer) from public;
revoke execute on function public.match_chunks(vector, double precision, integer) from anon;
revoke execute on function public.match_chunks(vector, double precision, integer) from authenticated;
grant execute on function public.match_chunks(vector, double precision, integer) to service_role;
