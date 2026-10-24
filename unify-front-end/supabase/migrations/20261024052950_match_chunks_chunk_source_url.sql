-- match_chunks returns the address of the chunk's own item.
--
-- A record source such as the IRCC newsroom stores one chunk per item and keeps
-- the item's page in the chunk metadata (source_url). The document address
-- (knowledge_documents.source_url) stays the page the document was crawled from,
-- so existing callers see no change. A caller that wants to cite the item reads
-- the new key knowledge_documents.chunk_source_url: the item's address, or JSON
-- null when the chunk has none.
--
-- This replaces the four-argument function from match_chunks_province_filter
-- with the same body, ranking, filter and grants, plus that one key. The
-- three-argument function delegates to it and needs no change.
--
-- APPLY ORDER (shared database): after match_chunks_province_filter and
-- crawl_sources_record_sources, and before the newsroom seed
-- (seed_ircc_record_sources) so no chunk with an item address exists first.

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
      'fetched_at', kc.metadata->>'fetched_at',
      'chunk_source_url', kc.metadata->>'source_url'
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

-- create or replace keeps the function's existing grants. These repeat them so
-- a run on a database without them is safe too.
revoke execute on function public.match_chunks(vector, double precision, integer, text) from public;
revoke execute on function public.match_chunks(vector, double precision, integer, text) from anon;
revoke execute on function public.match_chunks(vector, double precision, integer, text) from authenticated;
grant execute on function public.match_chunks(vector, double precision, integer, text) to service_role;
