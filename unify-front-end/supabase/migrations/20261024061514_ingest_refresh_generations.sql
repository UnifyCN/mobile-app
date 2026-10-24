-- One refresh at a time per crawl source, and one transaction to switch it.
--
-- ingest-documents can run for one source in two places at once: the hourly
-- scheduled call and a manual call, or a second worker after the first one
-- stalls. Before this migration each call wrote its own chunks next to the
-- current ones and then deleted older rows. Two calls could both succeed and
-- leave two versions, an older call could commit its hash last, and a failed
-- delete could leave a permanent mix of versions under the new hash.
--
-- Now:
--   1. claim_crawl_source gives the caller a lease with a new token. A live
--      lease held by another caller gives null, and the caller skips the
--      source. An expired lease is taken over, which also drops the old
--      owner's staged rows.
--   2. stage_knowledge_chunks stores one embedding batch (1 to 20 chunks) in
--      knowledge_chunk_staging and renews the lease. It works only with the
--      current, live token.
--   3. promote_knowledge_generation checks the token again under a row lock,
--      checks that every chunk index 0..n-1 is staged, and in ONE transaction
--      replaces the document's chunks, its title, metadata and content hash.
--      Any error rolls all of it back: the previous version stays whole.
--   4. refresh_knowledge_metadata updates dates on an unchanged document,
--      under the same token check. It returns false, and changes nothing,
--      when the stored chunks are not exactly one generation for that hash;
--      the caller then replaces them.
--   5. record_crawl_attempt never moves last_crawled_at backwards.
--   6. release_crawl_source drops the caller's lease and staged rows, and
--      nothing that belongs to a newer token.
-- The token is the fence: an owner whose lease expired and was taken over can
-- no longer stage, refresh or promote. Embeddings never travel in one large
-- request: each batch is staged by its own call.
--
-- Security: both tables have row level security with no policy, and only
-- service_role has privileges. The functions run as the caller (service_role,
-- which bypasses row level security), have an empty search_path and use only
-- schema-qualified tables. Only service_role may execute them.
--
-- APPLY ORDER (shared database), continuing the order in
-- crawl_sources_record_sources:
--   1-4. crawl_sources_province, match_chunks_province_filter,
--        crawl_sources_record_sources, match_chunks_chunk_source_url
--   5.   THIS migration
--   6.   deploy ingest-documents (the version that calls these functions)
--   7.   seed_province_crawl_sources, then seed_ircc_record_sources
--   8.   ingest_documents_single_scheduled_call
-- If the earlier steps are already live, apply this migration and then deploy
-- the function: the deployed function before this one never calls these
-- objects, and the new function fails every source until they exist.

create table if not exists public.crawl_source_leases (
  crawl_source_id bigint primary key
    references public.crawl_sources (id) on delete cascade,
  token uuid not null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.knowledge_chunk_staging (
  token uuid not null,
  crawl_source_id bigint not null
    references public.crawl_sources (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_text text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (token, chunk_index)
);

create index if not exists knowledge_chunk_staging_source_idx
  on public.knowledge_chunk_staging (crawl_source_id);

alter table public.crawl_source_leases enable row level security;
alter table public.knowledge_chunk_staging enable row level security;
revoke all on public.crawl_source_leases from public, anon, authenticated;
revoke all on public.knowledge_chunk_staging from public, anon, authenticated;
grant all on public.crawl_source_leases to service_role;
grant all on public.knowledge_chunk_staging to service_role;

create or replace function public.claim_crawl_source(
  p_source_id bigint,
  p_lease_seconds integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  insert into public.crawl_source_leases as l
    (crawl_source_id, token, claimed_at, expires_at)
  values (
    p_source_id,
    gen_random_uuid(),
    clock_timestamp(),
    clock_timestamp() + make_interval(secs => p_lease_seconds)
  )
  on conflict (crawl_source_id) do update
    set token = excluded.token,
        claimed_at = excluded.claimed_at,
        expires_at = excluded.expires_at
    where l.expires_at <= clock_timestamp()
  returning l.token into v_token;

  if v_token is null then
    return null;
  end if;
  -- An earlier owner's staged rows can never be promoted.
  delete from public.knowledge_chunk_staging
   where crawl_source_id = p_source_id and token <> v_token;
  return v_token;
end;
$$;

create or replace function public.stage_knowledge_chunks(
  p_source_id bigint,
  p_token uuid,
  p_rows jsonb,
  p_lease_seconds integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'Stage between 1 and 20 chunks per call';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  -- Renewing the live lease also locks it until this call commits.
  update public.crawl_source_leases
     set expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
   where crawl_source_id = p_source_id
     and token = p_token
     and expires_at > clock_timestamp();
  if not found then
    raise exception 'Crawl source lease lost';
  end if;

  -- jsonb_populate_recordset converts each value to the column type, so the
  -- embedding array becomes the table's vector type without naming it.
  insert into public.knowledge_chunk_staging
    (token, crawl_source_id, chunk_index, chunk_text, embedding, metadata)
  select p_token, p_source_id, r.chunk_index, r.chunk_text, r.embedding,
         coalesce(r.metadata, '{}'::jsonb)
    from jsonb_populate_recordset(null::public.knowledge_chunk_staging, p_rows) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.promote_knowledge_generation(
  p_source_id bigint,
  p_token uuid,
  p_title text,
  p_metadata jsonb,
  p_content_hash text,
  p_chunk_count integer,
  p_updated_at timestamptz
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_url text;
  v_documents integer;
  v_document bigint;
  v_staged integer;
  v_last integer;
begin
  perform 1
     from public.crawl_source_leases
    where crawl_source_id = p_source_id
      and token = p_token
      and expires_at > clock_timestamp()
      for update;
  if not found then
    raise exception 'Crawl source lease lost';
  end if;

  select count(*), max(chunk_index)
    into v_staged, v_last
    from public.knowledge_chunk_staging
   where token = p_token and crawl_source_id = p_source_id;
  -- chunk_index is unique per token and never negative, so this is 0..n-1.
  if p_chunk_count is null
     or v_staged <> p_chunk_count
     or coalesce(v_last, -1) <> p_chunk_count - 1 then
    raise exception 'Staged chunks are incomplete: % of %', v_staged, p_chunk_count;
  end if;

  select url into v_url from public.crawl_sources where id = p_source_id;
  select count(*), min(id)
    into v_documents, v_document
    from public.knowledge_documents
   where source_url = v_url;
  if v_documents > 1 then
    raise exception 'More than one document for %', v_url;
  end if;

  if v_document is null then
    insert into public.knowledge_documents
      (title, storage_path, source_url, updated_at, metadata, content_hash)
    values (p_title, '', v_url, p_updated_at, p_metadata, p_content_hash)
    returning id into v_document;
  else
    perform 1 from public.knowledge_documents where id = v_document for update;
    delete from public.knowledge_chunks where document_id = v_document;
    update public.knowledge_documents
       set title = p_title,
           updated_at = p_updated_at,
           metadata = p_metadata,
           content_hash = p_content_hash
     where id = v_document;
  end if;

  insert into public.knowledge_chunks
    (document_id, chunk_index, chunk_text, embedding, metadata, updated_at)
  select v_document, chunk_index, chunk_text, embedding, metadata, p_updated_at
    from public.knowledge_chunk_staging
   where token = p_token
   order by chunk_index;
  delete from public.knowledge_chunk_staging where token = p_token;
  return v_document;
end;
$$;

-- p_chunk_groups is a list of {"metadata": {...}, "indexes": [0, 1, ...]}.
-- One group with "indexes": null sets every chunk of the document.
create or replace function public.refresh_knowledge_metadata(
  p_source_id bigint,
  p_token uuid,
  p_content_hash text,
  p_document_patch jsonb,
  p_chunk_groups jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_url text;
  v_documents integer;
  v_document bigint;
  v_hash text;
  v_chunks integer;
  v_distinct integer;
  v_last integer;
  v_indexes integer;
  v_distinct_indexes integer;
  v_first_index integer;
  v_last_index integer;
  v_all boolean;
begin
  perform 1
     from public.crawl_source_leases
    where crawl_source_id = p_source_id
      and token = p_token
      and expires_at > clock_timestamp()
      for update;
  if not found then
    raise exception 'Crawl source lease lost';
  end if;
  if jsonb_typeof(p_chunk_groups) is distinct from 'array'
     or jsonb_array_length(p_chunk_groups) = 0 then
    raise exception 'Chunk metadata groups are required';
  end if;

  select url into v_url from public.crawl_sources where id = p_source_id;
  select count(*), min(id)
    into v_documents, v_document
    from public.knowledge_documents
   where source_url = v_url;
  if v_documents <> 1 then
    return false;
  end if;
  select content_hash into v_hash
    from public.knowledge_documents where id = v_document for update;
  if v_hash is distinct from p_content_hash then
    return false;
  end if;

  -- The stored chunks must be exactly one generation: indexes 0..n-1, once.
  select count(*), count(distinct chunk_index), max(chunk_index)
    into v_chunks, v_distinct, v_last
    from public.knowledge_chunks where document_id = v_document;
  if v_chunks <> v_distinct or coalesce(v_last, -1) <> v_chunks - 1 then
    return false;
  end if;

  v_all := jsonb_array_length(p_chunk_groups) = 1
           and jsonb_typeof(p_chunk_groups -> 0 -> 'indexes') = 'null';
  if not v_all then
    select count(*), count(distinct i), min(i), max(i)
      into v_indexes, v_distinct_indexes, v_first_index, v_last_index
      from (
        select (jsonb_array_elements_text(g -> 'indexes'))::integer as i
          from jsonb_array_elements(p_chunk_groups) g
      ) listed;
    -- The records must name every stored chunk once, and nothing else.
    if v_indexes <> v_chunks
       or v_distinct_indexes <> v_chunks
       or (v_chunks > 0 and (v_first_index <> 0 or v_last_index <> v_chunks - 1)) then
      return false;
    end if;
  end if;

  update public.knowledge_documents
     set metadata = coalesce(metadata, '{}'::jsonb) || p_document_patch
   where id = v_document;
  if v_all then
    update public.knowledge_chunks
       set metadata = p_chunk_groups -> 0 -> 'metadata'
     where document_id = v_document;
  else
    update public.knowledge_chunks kc
       set metadata = listed.metadata
      from (
        select g -> 'metadata' as metadata,
               (jsonb_array_elements_text(g -> 'indexes'))::integer as chunk_index
          from jsonb_array_elements(p_chunk_groups) g
      ) listed
     where kc.document_id = v_document
       and kc.chunk_index = listed.chunk_index;
  end if;
  return true;
end;
$$;

create or replace function public.record_crawl_attempt(
  p_source_id bigint,
  p_at timestamptz
)
returns void
language sql
set search_path = ''
as $$
  update public.crawl_sources
     set last_crawled_at = greatest(last_crawled_at, p_at)
   where id = p_source_id;
$$;

create or replace function public.release_crawl_source(
  p_source_id bigint,
  p_token uuid
)
returns void
language sql
set search_path = ''
as $$
  delete from public.knowledge_chunk_staging where token = p_token;
  delete from public.crawl_source_leases
   where crawl_source_id = p_source_id and token = p_token;
$$;

revoke execute on function public.claim_crawl_source(bigint, integer)
  from public, anon, authenticated;
revoke execute on function public.stage_knowledge_chunks(bigint, uuid, jsonb, integer)
  from public, anon, authenticated;
revoke execute on function public.promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.record_crawl_attempt(bigint, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.release_crawl_source(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_crawl_source(bigint, integer) to service_role;
grant execute on function public.stage_knowledge_chunks(bigint, uuid, jsonb, integer) to service_role;
grant execute on function public.promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz) to service_role;
grant execute on function public.refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.record_crawl_attempt(bigint, timestamptz) to service_role;
grant execute on function public.release_crawl_source(bigint, uuid) to service_role;
