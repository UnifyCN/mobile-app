-- Province-aware retrieval for match_chunks.
--
-- New overload: match_chunks(query_embedding, match_threshold, match_count,
-- filter_province). All four arguments are required, so a call that omits the
-- fourth argument resolves to the existing three-argument function.
--   filter_province null (or not one of the 13 canonical names):
--     national chunks only (chunk metadata province absent or JSON null).
--   filter_province = a canonical name:
--     national chunks plus chunks whose metadata province equals it.
-- The filter is in the where clause, so it applies before the count limit.
-- A chunk with any other province value is never returned.
--
-- The three-argument function is kept (never dropped) and now delegates with an
-- explicit null, so old callers get national chunks only.
--
-- Ranking, threshold and count are the HOSTED definition (read with
-- pg_get_functiondef on 2026-10-24), not the older candidate-pool variant in
-- 20260320_rag_ingestion_pipeline.sql. The OUT columns are unchanged.
-- knowledge_documents gains two keys read from the chunk's own metadata:
-- published_at and fetched_at (a string, or JSON null when the chunk has none).
--
-- Apply this BEFORE seed_province_crawl_sources.

create or replace function public.match_chunks(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  filter_province text
)
returns table(
  id bigint,
  document_id bigint,
  chunk_index integer,
  chunk_text text,
  similarity double precision,
  knowledge_documents jsonb
)
language plpgsql
as $function$
declare
  v_province text;
begin
  -- Only an exact canonical name selects a province. Any other value, such as
  -- a lower-case or abbreviated name, behaves as null: national chunks only.
  v_province := case
    when filter_province = any (array[
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
    ]) then filter_province
  end;

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
      'updated_at', kd.updated_at,
      'published_at', kc.metadata->>'published_at',
      'fetched_at', kc.metadata->>'fetched_at'
    ) as knowledge_documents
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kc.document_id = kd.id
  where kc.embedding is not null
    and (
      match_threshold <= 0
      or 1 - (kc.embedding <=> query_embedding) > match_threshold
    )
    and (
      kc.metadata->>'province' is null
      or kc.metadata->>'province' = v_province
    )
  order by
    (
      (1 - (kc.embedding <=> query_embedding)) * 0.85
      + greatest(0, 1.0 - extract(epoch from (now() - coalesce(kc.updated_at, kc.created_at))) / (180.0 * 86400)) * 0.15
    ) desc
  limit match_count;
end;
$function$;

-- The three-argument function stays, for callers that do not send a province.
-- It answers national chunks only, as a null province does. Its defaults are the
-- existing ones (0.5 and 5), and the new overload has none, so a call that omits
-- the fourth argument can only ever resolve to this function.
create or replace function public.match_chunks(
  query_embedding vector,
  match_threshold double precision default 0.5,
  match_count integer default 5
)
returns table(
  id bigint,
  document_id bigint,
  chunk_index integer,
  chunk_text text,
  similarity double precision,
  knowledge_documents jsonb
)
language sql
as $function$
  select * from public.match_chunks(
    query_embedding, match_threshold, match_count, null::text
  );
$function$;

-- Service role only, as before. A new function is executable by public, anon and
-- authenticated by default in Supabase, so the revokes below are required.
revoke execute on function public.match_chunks(vector, double precision, integer) from public;
revoke execute on function public.match_chunks(vector, double precision, integer) from anon;
revoke execute on function public.match_chunks(vector, double precision, integer) from authenticated;
grant execute on function public.match_chunks(vector, double precision, integer) to service_role;

revoke execute on function public.match_chunks(vector, double precision, integer, text) from public;
revoke execute on function public.match_chunks(vector, double precision, integer, text) from anon;
revoke execute on function public.match_chunks(vector, double precision, integer, text) from authenticated;
grant execute on function public.match_chunks(vector, double precision, integer, text) to service_role;
