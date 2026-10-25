-- Embedding model identity, a cutover control row and a whole-corpus rebuild,
-- for the move from OpenAI text-embedding-3-small to Qwen3 Embedding 8B
-- (qwen/qwen3-embedding-8b through OpenRouter, kept as the first 1536 of 4096
-- coordinates and scaled to length 1; contract qwen3-8b-prefix1536-l2-v1).
--
-- Why: the direct OpenAI balance is exhausted and every ingest-documents run
-- fails. Qwen vectors and OpenAI vectors have the same length but no common
-- meaning, so a search must never compare one with the other, whatever the
-- length says. Every stored vector therefore carries the model that made it,
-- and every read or write names the model it expects.
--
-- What this migration does (additive; nothing is dropped):
--   PART 1  embedding_model on knowledge_documents, knowledge_chunks and
--           knowledge_chunk_staging (existing rows are labelled
--           openai/text-embedding-3-small by the column default). The control
--           row knowledge_embedding_cutover (phase legacy|rebuilding|qwen|
--           rollback, serving model, writer pause, worker lease, the frozen
--           document snapshot) and knowledge_embedding_rebuild_rows (one row
--           per frozen chunk: its full original row and, once embedded, its
--           Qwen vector). A five-argument match_chunks(.., query_embedding_model)
--           that returns only rows of the requested model and only while that
--           model is the serving one. The three- and four-argument signatures
--           stay callable and always address the legacy model, never the
--           serving model, so an old caller gets old rows or none.
--   PART 2  Guarded writers. claim_crawl_source returns null (busy) while
--           writers are paused. stage_knowledge_chunks, promote_knowledge_
--           generation and refresh_knowledge_metadata gain an explicit-model
--           overload that refuses a paused writer and any model that is not
--           the serving model; promotion also refuses staged rows of another
--           model, even for an empty generation; a refresh returns false when
--           the document or any chunk has another model or no vector, so the
--           caller embeds again even when the content hash is equal. The old
--           signatures remain as wrappers that name the legacy model.
--   PART 3  knowledge_embedding_* functions: begin (freeze), acquire_worker,
--           release_worker, next_batch, stage_batch, activate (the atomic
--           cutover), abort, enable_writers, rollback, return_to_qwen, status.
--
-- Lock order of every guarded write: control row (shared for a normal write,
-- exclusive for freeze, cutover and rollback), then the source lease, then the
-- document. A normal write holds the shared lock until it commits, so a freeze
-- waits for writes in flight and a later write sees the freeze.
--
-- Scope guard: the rebuild functions never change chunk text, ids, indexes,
-- document ids, urls, province, metadata, hashes or any date. The cutover
-- updates only knowledge_chunks.embedding, knowledge_chunks.embedding_model and
-- knowledge_documents.embedding_model, in one transaction, and only after the
-- live documents and chunks equal the frozen snapshot in membership and in
-- every column. It does not touch cron, crawl_sources or source attempt stamps.
--
-- Revert: rollback (knowledge_embedding_rollback) serves the immutable legacy
-- snapshot and keeps the Qwen index; knowledge_embedding_return_to_qwen goes
-- back. The run's rebuild rows are retained until a separate, reviewed cleanup.
-- To remove this migration entirely (only before any production rebuild), drop
-- the five-argument match_chunks, the explicit-model overloads, the
-- knowledge_embedding_* functions and tables and the three embedding_model
-- columns, and re-apply 20261024061514_ingest_refresh_generations and
-- 20261024052950_match_chunks_chunk_source_url to restore the old bodies.
--
-- Security: both new tables have row level security with no policy and only
-- service_role has privileges. Every new function and overload has an explicit
-- revoke from public, anon and authenticated and a grant to service_role: the
-- public schema's default privileges would otherwise make them callable by
-- clients. They run as the caller (service_role), qualify table names, and set
-- search_path. The functions that handle vectors need the pgvector functions
-- and operators, whose schema differs between installs, so their search_path is
-- public, extensions, pg_temp; the others use an empty search_path.
--
-- APPLY ORDER (shared database): after 20261024061514_ingest_refresh_generations
-- and 20261024052950_match_chunks_chunk_source_url, BEFORE the deployed
-- ingest-documents / generate-daily-tips / rag-query versions that name a model.
-- The deployed old functions keep working: they call the legacy signatures.
-- Never run supabase db push against the drifted shared history; apply this file
-- by hand as described in unify-front-end/supabase/backfills/ and the runbook.


alter table public.knowledge_documents
  add column if not exists embedding_model text not null
  default 'openai/text-embedding-3-small';
alter table public.knowledge_chunks
  add column if not exists embedding_model text not null
  default 'openai/text-embedding-3-small';
alter table public.knowledge_chunk_staging
  add column if not exists embedding_model text not null
  default 'openai/text-embedding-3-small';

create table if not exists public.knowledge_embedding_cutover (
  id boolean primary key default true check (id),
  phase text not null default 'legacy'
    check (phase in ('legacy', 'rebuilding', 'qwen', 'rollback')),
  legacy_model text not null default 'openai/text-embedding-3-small',
  serving_model text not null default 'openai/text-embedding-3-small',
  target_model text,
  contract_version text,
  writers_paused boolean not null default false,
  run_id uuid,
  worker_token uuid,
  worker_expires_at timestamptz,
  snapshot_documents jsonb,
  updated_at timestamptz not null default now()
);
insert into public.knowledge_embedding_cutover (id) values (true)
  on conflict (id) do nothing;

create table if not exists public.knowledge_embedding_rebuild_rows (
  run_id uuid not null,
  chunk_id bigint not null,
  original_row jsonb not null,
  text_sha256 text not null,
  qwen_embedding vector(1536),
  staged_at timestamptz,
  primary key (run_id, chunk_id)
);

alter table public.knowledge_embedding_cutover enable row level security;
alter table public.knowledge_embedding_rebuild_rows enable row level security;
revoke all on public.knowledge_embedding_cutover from public, anon, authenticated;
revoke all on public.knowledge_embedding_rebuild_rows from public, anon, authenticated;
grant all on public.knowledge_embedding_cutover to service_role;
grant all on public.knowledge_embedding_rebuild_rows to service_role;

-- Retrieval. One SQL statement reads the control row and the candidate rows, so
-- both come from one snapshot. The compatible rows are built in a MATERIALIZED
-- CTE before any vector distance is computed: a plain WHERE could be evaluated
-- after the distance, and the optimizer may reorder it.
create or replace function public.match_chunks(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  filter_province text,
  query_embedding_model text
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
stable
set search_path = public, extensions, pg_temp
as $function$
declare
  v_province text;
begin
  if query_embedding_model is null or query_embedding_model = '' then
    raise exception 'Name the embedding model of the query';
  end if;
  if query_embedding is null
     or vector_dims(query_embedding) <> 1536
     or vector_norm(query_embedding) = 0 then
    raise exception 'The query vector must have 1536 non-zero coordinates';
  end if;

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
  with control as materialized (
    select c.phase as c_phase,
           c.serving_model as c_serving,
           c.run_id as c_run,
           c.snapshot_documents as c_documents
      from public.knowledge_embedding_cutover c
  ),
  live as materialized (
    select kc.id as c_id,
           kc.document_id as c_document,
           kc.chunk_index as c_index,
           kc.chunk_text as c_text,
           kc.embedding as c_embedding,
           kc.metadata as c_meta,
           coalesce(kc.updated_at, kc.created_at) as c_time,
           jsonb_build_object(
             'id', kd.id,
             'title', kd.title,
             'storage_path', kd.storage_path,
             'subject', kd.subject,
             'section', kd.section,
             'source_url', kd.source_url,
             'updated_at', kd.updated_at
           ) as c_doc
      from control ctl
      cross join public.knowledge_chunks kc
      join public.knowledge_documents kd on kc.document_id = kd.id
     where ctl.c_phase <> 'rollback'
       and ctl.c_serving = query_embedding_model
       and kc.embedding is not null
       and kc.embedding_model = query_embedding_model
       and kd.embedding_model = query_embedding_model
  ),
  saved as materialized (
    select (rr.original_row ->> 'id')::bigint as c_id,
           (rr.original_row ->> 'document_id')::bigint as c_document,
           (rr.original_row ->> 'chunk_index')::integer as c_index,
           rr.original_row ->> 'chunk_text' as c_text,
           (rr.original_row ->> 'embedding')::vector(1536) as c_embedding,
           rr.original_row -> 'metadata' as c_meta,
           coalesce(
             (rr.original_row ->> 'updated_at')::timestamptz,
             (rr.original_row ->> 'created_at')::timestamptz
           ) as c_time,
           jsonb_build_object(
             'id', (d.doc ->> 'id')::bigint,
             'title', d.doc ->> 'title',
             'storage_path', d.doc ->> 'storage_path',
             'subject', d.doc ->> 'subject',
             'section', d.doc ->> 'section',
             'source_url', d.doc ->> 'source_url',
             'updated_at', (d.doc ->> 'updated_at')::timestamptz
           ) as c_doc
      from control ctl
      join public.knowledge_embedding_rebuild_rows rr on rr.run_id = ctl.c_run
      cross join lateral jsonb_array_elements(ctl.c_documents) as d(doc)
     where ctl.c_phase = 'rollback'
       and ctl.c_serving = query_embedding_model
       and (d.doc ->> 'id')::bigint = (rr.original_row ->> 'document_id')::bigint
       and rr.original_row ->> 'embedding' is not null
       and rr.original_row ->> 'embedding_model' = query_embedding_model
       and d.doc ->> 'embedding_model' = query_embedding_model
  ),
  compatible as materialized (
    select * from live
    union all
    select * from saved
  )
  select
    cm.c_id,
    cm.c_document,
    cm.c_index,
    cm.c_text,
    (
      (1 - (cm.c_embedding <=> query_embedding)) * 0.85
      + greatest(0, 1.0 - extract(epoch from (now() - cm.c_time)) / (180.0 * 86400)) * 0.15
    )::float as similarity,
    cm.c_doc || jsonb_build_object(
      'published_at', cm.c_meta ->> 'published_at',
      'fetched_at', cm.c_meta ->> 'fetched_at',
      'chunk_source_url', cm.c_meta ->> 'source_url'
    ) as knowledge_documents
  from compatible cm
  where (
      match_threshold <= 0
      or 1 - (cm.c_embedding <=> query_embedding) > match_threshold
    )
    and (
      cm.c_meta ->> 'province' is null
      or cm.c_meta ->> 'province' = v_province
    )
  order by
    (
      (1 - (cm.c_embedding <=> query_embedding)) * 0.85
      + greatest(0, 1.0 - extract(epoch from (now() - cm.c_time)) / (180.0 * 86400)) * 0.15
    ) desc
  limit match_count;
end;
$function$;

-- The four-argument signature stays callable and addresses the legacy model
-- only. It never reads the serving model, so once Qwen is live it returns no
-- rows instead of mismatched vectors. The three-argument function delegates
-- to it already.
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
begin
  return query
  select m.id, m.document_id, m.chunk_index, m.chunk_text, m.similarity,
         m.knowledge_documents
    from public.match_chunks(
      query_embedding,
      match_threshold,
      match_count,
      filter_province,
      'openai/text-embedding-3-small'::text
    ) m;
end;
$function$;

revoke execute on function public.match_chunks(vector, double precision, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.match_chunks(vector, double precision, integer, text, text)
  to service_role;
revoke execute on function public.match_chunks(vector, double precision, integer, text)
  from public, anon, authenticated;
grant execute on function public.match_chunks(vector, double precision, integer, text)
  to service_role;

-- PART 2: guarded writers. Lock order for every guarded write:
--   1. the control row (shared lock for a normal write, exclusive for a freeze,
--      cutover or rollback),
--   2. the source lease,
--   3. the document.
-- A normal write holds the shared control lock until it commits, so a freeze
-- waits for writes in flight and a write that starts later sees the freeze.

-- A claim is refused (null: the caller treats the source as busy and does no
-- external work) while writers are paused.
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
  v_paused boolean;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  select writers_paused into v_paused
    from public.knowledge_embedding_cutover for share;
  if v_paused then
    return null;
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
  p_lease_seconds integer,
  p_embedding_model text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_paused boolean;
  v_serving text;
begin
  select writers_paused, serving_model into v_paused, v_serving
    from public.knowledge_embedding_cutover for share;
  if v_paused then
    raise exception 'Knowledge writes are paused';
  end if;
  if p_embedding_model is distinct from v_serving then
    raise exception 'Embedding model % is not the serving model', p_embedding_model;
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'Stage between 1 and 20 chunks per call';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  -- The model is the call's, never a row's: a row may only repeat it.
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
     where e ? 'embedding_model'
       and e ->> 'embedding_model' is distinct from p_embedding_model
  ) then
    raise exception 'A staged row names another embedding model';
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

  insert into public.knowledge_chunk_staging
    (token, crawl_source_id, chunk_index, chunk_text, embedding, metadata,
     embedding_model)
  select p_token, p_source_id, r.chunk_index, r.chunk_text, r.embedding,
         coalesce(r.metadata, '{}'::jsonb), p_embedding_model
    from jsonb_populate_recordset(null::public.knowledge_chunk_staging, p_rows) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.stage_knowledge_chunks(
  p_source_id bigint,
  p_token uuid,
  p_rows jsonb,
  p_lease_seconds integer
)
returns integer
language sql
set search_path = ''
as $$
  select public.stage_knowledge_chunks(
    p_source_id, p_token, p_rows, p_lease_seconds,
    'openai/text-embedding-3-small'::text
  );
$$;

create or replace function public.promote_knowledge_generation(
  p_source_id bigint,
  p_token uuid,
  p_title text,
  p_metadata jsonb,
  p_content_hash text,
  p_chunk_count integer,
  p_updated_at timestamptz,
  p_embedding_model text
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
  v_other_models integer;
  v_paused boolean;
  v_serving text;
begin
  select writers_paused, serving_model into v_paused, v_serving
    from public.knowledge_embedding_cutover for share;
  if v_paused then
    raise exception 'Knowledge writes are paused';
  end if;
  -- Checked first so an empty generation, which stages nothing, is guarded too.
  if p_embedding_model is distinct from v_serving then
    raise exception 'Embedding model % is not the serving model', p_embedding_model;
  end if;

  perform 1
     from public.crawl_source_leases
    where crawl_source_id = p_source_id
      and token = p_token
      and expires_at > clock_timestamp()
      for update;
  if not found then
    raise exception 'Crawl source lease lost';
  end if;

  select count(*), max(chunk_index),
         count(*) filter (where embedding_model <> p_embedding_model)
    into v_staged, v_last, v_other_models
    from public.knowledge_chunk_staging
   where token = p_token and crawl_source_id = p_source_id;
  -- chunk_index is unique per token and never negative, so this is 0..n-1.
  if p_chunk_count is null
     or v_staged <> p_chunk_count
     or coalesce(v_last, -1) <> p_chunk_count - 1 then
    raise exception 'Staged chunks are incomplete: % of %', v_staged, p_chunk_count;
  end if;
  if v_other_models > 0 then
    raise exception 'Staged chunks use another embedding model';
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
      (title, storage_path, source_url, updated_at, metadata, content_hash,
       embedding_model)
    values (p_title, '', v_url, p_updated_at, p_metadata, p_content_hash,
            p_embedding_model)
    returning id into v_document;
  else
    perform 1 from public.knowledge_documents where id = v_document for update;
    delete from public.knowledge_chunks where document_id = v_document;
    update public.knowledge_documents
       set title = p_title,
           updated_at = p_updated_at,
           metadata = p_metadata,
           content_hash = p_content_hash,
           embedding_model = p_embedding_model
     where id = v_document;
  end if;

  insert into public.knowledge_chunks
    (document_id, chunk_index, chunk_text, embedding, metadata, updated_at,
     embedding_model)
  select v_document, chunk_index, chunk_text, embedding, metadata, p_updated_at,
         p_embedding_model
    from public.knowledge_chunk_staging
   where token = p_token
   order by chunk_index;
  delete from public.knowledge_chunk_staging where token = p_token;
  return v_document;
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
language sql
set search_path = ''
as $$
  select public.promote_knowledge_generation(
    p_source_id, p_token, p_title, p_metadata, p_content_hash, p_chunk_count,
    p_updated_at, 'openai/text-embedding-3-small'::text
  );
$$;

-- Returns false, and changes nothing, when the document or any chunk has
-- another model, or any chunk has no vector: the caller then re-embeds.
create or replace function public.refresh_knowledge_metadata(
  p_source_id bigint,
  p_token uuid,
  p_content_hash text,
  p_document_patch jsonb,
  p_chunk_groups jsonb,
  p_embedding_model text
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
  v_model text;
  v_chunks integer;
  v_distinct integer;
  v_last integer;
  v_indexes integer;
  v_distinct_indexes integer;
  v_first_index integer;
  v_last_index integer;
  v_all boolean;
  v_paused boolean;
  v_serving text;
begin
  select writers_paused, serving_model into v_paused, v_serving
    from public.knowledge_embedding_cutover for share;
  if v_paused then
    raise exception 'Knowledge writes are paused';
  end if;
  if p_embedding_model is distinct from v_serving then
    raise exception 'Embedding model % is not the serving model', p_embedding_model;
  end if;

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
  select content_hash, embedding_model into v_hash, v_model
    from public.knowledge_documents where id = v_document for update;
  if v_hash is distinct from p_content_hash then
    return false;
  end if;
  if v_model is distinct from p_embedding_model then
    return false;
  end if;

  -- The stored chunks must be exactly one generation: indexes 0..n-1, once,
  -- all with a vector of the requested model.
  select count(*), count(distinct chunk_index), max(chunk_index)
    into v_chunks, v_distinct, v_last
    from public.knowledge_chunks where document_id = v_document;
  if v_chunks <> v_distinct or coalesce(v_last, -1) <> v_chunks - 1 then
    return false;
  end if;
  if exists (
    select 1 from public.knowledge_chunks
     where document_id = v_document
       and (embedding is null
            or embedding_model is distinct from p_embedding_model)
  ) then
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

create or replace function public.refresh_knowledge_metadata(
  p_source_id bigint,
  p_token uuid,
  p_content_hash text,
  p_document_patch jsonb,
  p_chunk_groups jsonb
)
returns boolean
language sql
set search_path = ''
as $$
  select public.refresh_knowledge_metadata(
    p_source_id, p_token, p_content_hash, p_document_patch, p_chunk_groups,
    'openai/text-embedding-3-small'::text
  );
$$;

revoke execute on function public.claim_crawl_source(bigint, integer)
  from public, anon, authenticated;
revoke execute on function public.stage_knowledge_chunks(bigint, uuid, jsonb, integer)
  from public, anon, authenticated;
revoke execute on function public.stage_knowledge_chunks(bigint, uuid, jsonb, integer, text)
  from public, anon, authenticated;
revoke execute on function public.promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.claim_crawl_source(bigint, integer) to service_role;
grant execute on function public.stage_knowledge_chunks(bigint, uuid, jsonb, integer) to service_role;
grant execute on function public.stage_knowledge_chunks(bigint, uuid, jsonb, integer, text) to service_role;
grant execute on function public.promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz) to service_role;
grant execute on function public.promote_knowledge_generation(bigint, uuid, text, jsonb, text, integer, timestamptz, text) to service_role;
grant execute on function public.refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.refresh_knowledge_metadata(bigint, uuid, text, jsonb, jsonb, text) to service_role;

-- PART 3: the resumable whole-corpus rebuild, the atomic cutover and rollback.
-- Service role only. Every function locks the control row first, FOR UPDATE.
-- They run as the caller, pin the time zone so row JSON compares the same in
-- every session, and use qualified table names.

-- Freezes the corpus: pauses writers, drops every source lease and staged
-- generation (so no worker from before the freeze can promote), and copies the
-- full documents and every chunk row, including rows with no document or no
-- vector, into an immutable snapshot for a new run.
create or replace function public.knowledge_embedding_begin(
  p_target_model text,
  p_contract text
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
set timezone = 'UTC'
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
  v_run uuid;
  v_documents jsonb;
begin
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase <> 'legacy' then
    raise exception 'A rebuild is already active or the target model is serving (phase %)', c.phase;
  end if;
  if p_target_model is null or p_target_model = '' or p_contract is null
     or p_contract = '' or p_target_model = c.legacy_model then
    raise exception 'Name a target model that differs from the legacy model, and a contract';
  end if;
  -- Blocks every write to the corpus until this transaction ends; reads go on.
  lock table public.knowledge_documents, public.knowledge_chunks
    in share row exclusive mode;

  delete from public.knowledge_chunk_staging;
  delete from public.crawl_source_leases;

  v_run := gen_random_uuid();
  insert into public.knowledge_embedding_rebuild_rows
    (run_id, chunk_id, original_row, text_sha256)
  select v_run, kc.id, to_jsonb(kc),
         encode(sha256(convert_to(kc.chunk_text, 'UTF8')), 'hex')
    from public.knowledge_chunks kc;
  select coalesce(jsonb_agg(to_jsonb(kd) order by kd.id), '[]'::jsonb)
    into v_documents
    from public.knowledge_documents kd;

  update public.knowledge_embedding_cutover
     set phase = 'rebuilding',
         writers_paused = true,
         target_model = p_target_model,
         contract_version = p_contract,
         run_id = v_run,
         worker_token = null,
         worker_expires_at = null,
         snapshot_documents = v_documents,
         updated_at = now();

  return jsonb_build_object(
    'run_id', v_run,
    'documents', (select count(*) from public.knowledge_documents),
    'chunks', (select count(*) from public.knowledge_chunks),
    'source_linked_documents', (
      select count(*) from public.knowledge_documents kd
       where exists (select 1 from public.crawl_sources s where s.url = kd.source_url)
    ),
    'source_linked_chunks', (
      select count(*) from public.knowledge_chunks kc
       where exists (
         select 1 from public.knowledge_documents kd
           join public.crawl_sources s on s.url = kd.source_url
          where kd.id = kc.document_id
       )
    ),
    'other_documents', (
      select count(*) from public.knowledge_documents kd
       where not exists (select 1 from public.crawl_sources s where s.url = kd.source_url)
    ),
    'other_chunks', (
      select count(*) from public.knowledge_chunks kc
       where not exists (
         select 1 from public.knowledge_documents kd
           join public.crawl_sources s on s.url = kd.source_url
          where kd.id = kc.document_id
       )
    ),
    'chunks_without_document', (
      select count(*) from public.knowledge_chunks kc
       where not exists (select 1 from public.knowledge_documents kd where kd.id = kc.document_id)
    ),
    'chunks_without_vector', (
      select count(*) from public.knowledge_chunks where embedding is null
    )
  );
end;
$$;

-- A worker token is granted only when no live worker holds the run.
create or replace function public.knowledge_embedding_acquire_worker(
  p_run uuid,
  p_lease_seconds integer
)
returns uuid
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
  v_token uuid;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase <> 'rebuilding' or c.run_id is distinct from p_run then
    raise exception 'Run % is not the active run', p_run;
  end if;
  if c.worker_token is not null and c.worker_expires_at > clock_timestamp() then
    return null;
  end if;
  v_token := gen_random_uuid();
  update public.knowledge_embedding_cutover
     set worker_token = v_token,
         worker_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
         updated_at = now();
  return v_token;
end;
$$;

-- A null token is the controlled release by an operator.
create or replace function public.knowledge_embedding_release_worker(
  p_run uuid,
  p_token uuid
)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  update public.knowledge_embedding_cutover
     set worker_token = null,
         worker_expires_at = null,
         updated_at = now()
   where run_id = p_run
     and phase = 'rebuilding'
     and (p_token is null or worker_token = p_token);
end;
$$;

-- The next chunks that have no Qwen vector, in chunk order, at most 20. Also
-- renews the worker lease, so a slow provider call does not lose it.
create or replace function public.knowledge_embedding_next_batch(
  p_run uuid,
  p_token uuid,
  p_limit integer,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_remaining integer;
  v_rows jsonb;
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Take between 1 and 20 chunks per batch';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  update public.knowledge_embedding_cutover
     set worker_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
   where phase = 'rebuilding'
     and run_id = p_run
     and worker_token = p_token
     and worker_expires_at > clock_timestamp();
  if not found then
    raise exception 'Embedding rebuild worker lease lost';
  end if;

  select count(*) into v_remaining
    from public.knowledge_embedding_rebuild_rows
   where run_id = p_run and qwen_embedding is null;
  select coalesce(jsonb_agg(jsonb_build_object('chunk_id', t.chunk_id, 'text', t.text) order by t.chunk_id), '[]'::jsonb)
    into v_rows
    from (
      select chunk_id, original_row ->> 'chunk_text' as text
        from public.knowledge_embedding_rebuild_rows
       where run_id = p_run and qwen_embedding is null
       order by chunk_id
       limit p_limit
    ) t;
  return jsonb_build_object('remaining', v_remaining, 'rows', v_rows);
end;
$$;

-- Stores up to 20 vectors, each proved to come from the frozen chunk text.
create or replace function public.knowledge_embedding_stage_batch(
  p_run uuid,
  p_token uuid,
  p_model text,
  p_contract text,
  p_rows jsonb,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
  v_count integer;
  v_distinct integer;
  v_incomplete integer;
  v_unknown integer;
  v_changed integer;
  v_zero integer;
  v_conflict integer;
  v_staged integer;
  v_remaining integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'Stage between 1 and 20 vectors per call';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  -- Renewing the lease also takes the row lock that a cutover waits for.
  update public.knowledge_embedding_cutover
     set worker_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
   where phase = 'rebuilding'
     and run_id = p_run
     and worker_token = p_token
     and worker_expires_at > clock_timestamp();
  if not found then
    raise exception 'Embedding rebuild worker lease lost';
  end if;
  select * into c from public.knowledge_embedding_cutover;
  if p_model is distinct from c.target_model then
    raise exception 'Model % is not the target model of this run', p_model;
  end if;
  if p_contract is distinct from c.contract_version then
    raise exception 'Contract % is not the contract of this run', p_contract;
  end if;

  -- One pass over the rows. A temporary table is avoided: a hosted role may
  -- not hold the TEMP privilege.
  with incoming as materialized (
    select (e ->> 'chunk_id')::bigint as chunk_id,
           e ->> 'text_sha256' as text_sha256,
           (e ->> 'embedding')::vector(1536) as embedding
      from jsonb_array_elements(p_rows) e
  )
  select count(*),
         count(distinct i.chunk_id),
         count(*) filter (
           where i.chunk_id is null or i.text_sha256 is null or i.embedding is null
         ),
         count(*) filter (where i.chunk_id is not null and rr.chunk_id is null),
         count(*) filter (where rr.chunk_id is not null and rr.text_sha256 <> i.text_sha256),
         count(*) filter (where i.embedding is not null and vector_norm(i.embedding) = 0),
         count(*) filter (
           where rr.qwen_embedding is not null and i.embedding is not null
             and rr.qwen_embedding <> i.embedding
         )
    into v_count, v_distinct, v_incomplete, v_unknown, v_changed, v_zero, v_conflict
    from incoming i
    left join public.knowledge_embedding_rebuild_rows rr
      on rr.run_id = p_run and rr.chunk_id = i.chunk_id;

  if v_incomplete > 0 then
    raise exception 'Each row needs a chunk id, a text fingerprint and a vector';
  end if;
  if v_distinct <> v_count then
    raise exception 'A chunk appears more than once in one call';
  end if;
  if v_unknown > 0 then
    raise exception 'A chunk is not part of this run';
  end if;
  if v_changed > 0 then
    raise exception 'The text of a chunk changed from the frozen text';
  end if;
  if v_zero > 0 then
    raise exception 'Every vector needs non-zero coordinates';
  end if;
  if v_conflict > 0 then
    raise exception 'A chunk already has a different vector';
  end if;

  with incoming as (
    select (e ->> 'chunk_id')::bigint as chunk_id,
           (e ->> 'embedding')::vector(1536) as embedding
      from jsonb_array_elements(p_rows) e
  )
  update public.knowledge_embedding_rebuild_rows rr
     set qwen_embedding = i.embedding,
         staged_at = now()
    from incoming i
   where rr.run_id = p_run
     and rr.chunk_id = i.chunk_id
     and rr.qwen_embedding is null;
  get diagnostics v_staged = row_count;

  select count(*) into v_remaining
    from public.knowledge_embedding_rebuild_rows
   where run_id = p_run and qwen_embedding is null;
  return jsonb_build_object('staged', v_staged, 'remaining', v_remaining);
end;
$$;

-- One transaction: checks the whole frozen set, then switches the vectors, the
-- model columns and the serving pointer together. Any difference from the
-- snapshot, in membership or in any column, fails it with no change.
create or replace function public.knowledge_embedding_activate(
  p_run uuid,
  p_token uuid
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
set timezone = 'UTC'
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
  v_missing integer;
  v_diff integer;
  v_chunks integer;
  v_documents integer;
begin
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase <> 'rebuilding' or c.run_id is distinct from p_run then
    raise exception 'Run % is not the active run', p_run;
  end if;
  if c.worker_token is distinct from p_token
     or c.worker_expires_at is null
     or c.worker_expires_at <= clock_timestamp() then
    raise exception 'Embedding rebuild worker lease lost';
  end if;
  lock table public.knowledge_documents, public.knowledge_chunks
    in share row exclusive mode;

  select count(*) into v_missing
    from public.knowledge_embedding_rebuild_rows
   where run_id = p_run and qwen_embedding is null;
  if v_missing > 0 then
    raise exception 'The rebuild is incomplete: % chunks have no vector', v_missing;
  end if;

  select count(*) into v_diff
    from public.knowledge_chunks kc
    full join (
      select * from public.knowledge_embedding_rebuild_rows where run_id = p_run
    ) rr on rr.chunk_id = kc.id
   where kc.id is null or rr.chunk_id is null
      or to_jsonb(kc) is distinct from rr.original_row;
  if v_diff > 0 then
    raise exception 'Knowledge chunks changed since the snapshot (% rows differ)', v_diff;
  end if;
  select count(*) into v_diff
    from public.knowledge_documents kd
    full join (
      select (d ->> 'id')::bigint as id, d as doc
        from jsonb_array_elements(c.snapshot_documents) d
    ) s on s.id = kd.id
   where kd.id is null or s.id is null
      or to_jsonb(kd) is distinct from s.doc;
  if v_diff > 0 then
    raise exception 'Knowledge documents changed since the snapshot (% rows differ)', v_diff;
  end if;

  update public.knowledge_chunks kc
     set embedding = rr.qwen_embedding,
         embedding_model = c.target_model
    from public.knowledge_embedding_rebuild_rows rr
   where rr.run_id = p_run and rr.chunk_id = kc.id;
  get diagnostics v_chunks = row_count;
  update public.knowledge_documents set embedding_model = c.target_model;
  get diagnostics v_documents = row_count;

  update public.knowledge_embedding_cutover
     set serving_model = c.target_model,
         phase = 'qwen',
         worker_token = null,
         worker_expires_at = null,
         updated_at = now();
  return jsonb_build_object('chunks', v_chunks, 'documents', v_documents);
end;
$$;

-- Back to legacy serving and legacy writers. The run's rows stay for inspection.
create or replace function public.knowledge_embedding_abort(p_run uuid)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
begin
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase <> 'rebuilding' or c.run_id is distinct from p_run then
    raise exception 'Run % is not the active run', p_run;
  end if;
  update public.knowledge_embedding_cutover
     set phase = 'legacy',
         writers_paused = false,
         worker_token = null,
         worker_expires_at = null,
         updated_at = now();
end;
$$;

-- Writers resume only while a consistent index serves: legacy, or Qwen after
-- the read checks. Rollback keeps them paused.
create or replace function public.knowledge_embedding_enable_writers()
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
begin
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase not in ('legacy', 'qwen') then
    raise exception 'Writers cannot resume in phase %', c.phase;
  end if;
  update public.knowledge_embedding_cutover
     set writers_paused = false, updated_at = now();
end;
$$;

-- Serves the immutable legacy snapshot. The live Qwen rows and the staged
-- vectors are untouched, and writers stay paused.
create or replace function public.knowledge_embedding_rollback()
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
begin
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase <> 'qwen' or c.run_id is null or c.snapshot_documents is null then
    raise exception 'Rollback needs the Qwen phase and a saved snapshot (phase %)', c.phase;
  end if;
  lock table public.knowledge_documents, public.knowledge_chunks
    in share row exclusive mode;
  delete from public.knowledge_chunk_staging;
  delete from public.crawl_source_leases;
  update public.knowledge_embedding_cutover
     set phase = 'rollback',
         serving_model = c.legacy_model,
         writers_paused = true,
         worker_token = null,
         worker_expires_at = null,
         updated_at = now();
  return jsonb_build_object(
    'snapshot_chunks', (
      select count(*) from public.knowledge_embedding_rebuild_rows where run_id = c.run_id
    )
  );
end;
$$;

-- Returns to the retained Qwen index after checking it is still all Qwen.
create or replace function public.knowledge_embedding_return_to_qwen()
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
begin
  select * into c from public.knowledge_embedding_cutover for update;
  if c.phase <> 'rollback' then
    raise exception 'Return to the target model needs the rollback phase (phase %)', c.phase;
  end if;
  lock table public.knowledge_documents, public.knowledge_chunks
    in share row exclusive mode;
  if exists (
    select 1 from public.knowledge_chunks
     where embedding is null or embedding_model is distinct from c.target_model
  ) or exists (
    select 1 from public.knowledge_documents
     where embedding_model is distinct from c.target_model
  ) then
    raise exception 'The live index is not entirely of the target model';
  end if;
  update public.knowledge_embedding_cutover
     set phase = 'qwen', serving_model = c.target_model, updated_at = now();
end;
$$;

create or replace function public.knowledge_embedding_status()
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  c public.knowledge_embedding_cutover%rowtype;
begin
  select * into c from public.knowledge_embedding_cutover;
  return jsonb_build_object(
    'phase', c.phase,
    'serving_model', c.serving_model,
    'target_model', c.target_model,
    'contract_version', c.contract_version,
    'writers_paused', c.writers_paused,
    'run_id', c.run_id,
    'worker_live', coalesce(c.worker_expires_at > clock_timestamp(), false),
    'run_rows', (
      select count(*) from public.knowledge_embedding_rebuild_rows where run_id = c.run_id
    ),
    'run_missing', (
      select count(*) from public.knowledge_embedding_rebuild_rows
       where run_id = c.run_id and qwen_embedding is null
    ),
    'chunk_models', coalesce((
      select jsonb_object_agg(m, n) from (
        select embedding_model as m, count(*) as n
          from public.knowledge_chunks group by 1
      ) t
    ), '{}'::jsonb),
    'document_models', coalesce((
      select jsonb_object_agg(m, n) from (
        select embedding_model as m, count(*) as n
          from public.knowledge_documents group by 1
      ) t
    ), '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.knowledge_embedding_begin(text, text) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_acquire_worker(uuid, integer) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_release_worker(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_next_batch(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_stage_batch(uuid, uuid, text, text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_activate(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_abort(uuid) from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_enable_writers() from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_rollback() from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_return_to_qwen() from public, anon, authenticated;
revoke execute on function public.knowledge_embedding_status() from public, anon, authenticated;
grant execute on function public.knowledge_embedding_begin(text, text) to service_role;
grant execute on function public.knowledge_embedding_acquire_worker(uuid, integer) to service_role;
grant execute on function public.knowledge_embedding_release_worker(uuid, uuid) to service_role;
grant execute on function public.knowledge_embedding_next_batch(uuid, uuid, integer, integer) to service_role;
grant execute on function public.knowledge_embedding_stage_batch(uuid, uuid, text, text, jsonb, integer) to service_role;
grant execute on function public.knowledge_embedding_activate(uuid, uuid) to service_role;
grant execute on function public.knowledge_embedding_abort(uuid) to service_role;
grant execute on function public.knowledge_embedding_enable_writers() to service_role;
grant execute on function public.knowledge_embedding_rollback() to service_role;
grant execute on function public.knowledge_embedding_return_to_qwen() to service_role;
grant execute on function public.knowledge_embedding_status() to service_role;
