-- Resumable source generations: a changed source's complete chunk set is kept
-- between calls, embedded over several calls, and published in one
-- transaction.
--
-- Why: one ingestion call has about 95 seconds of work time, and a large
-- record source (IRCC processing times: 1950 records, 98 batches of 20 in the
-- measured feed) needs several minutes of embedding. Until now a refresh kept
-- its staged rows under its lease token, and the next claim deleted them, so
-- such a source could never finish. Now the frozen input lives in a private
-- job that survives lease replacement, and each provider call is reserved and
-- counted in the database before it is sent.
--
-- What this migration adds (additive; nothing is dropped or changed):
--   knowledge_generation_jobs          one row per frozen generation: the
--       ordered chunk count, the server-computed generation fingerprint, the
--       model and contract, the canonical source configuration and its hash,
--       the stable operation ids that opened or reused it, the request cap and
--       its debit, and, once promoted, the immutable promoted document id,
--       time and terminal result.
--   knowledge_generation_rows          the frozen chunk text, its server
--       sha256, metadata, and (once staged) the checked vector.
--   knowledge_generation_reservations  one row per provider attempt: the
--       caller's request id, the issuing lease token, the exact ordered chunk
--       indexes and text hashes, and the outcome.
--   ingest_generation_* functions      open, begin_service, reserve, stage,
--       promote, reject, supersede (live-write path: current lease, serving
--       model and contract, writers enabled); retire (service-only private
--       cleanup, no lease); list_open and status (read-only).
--
-- Rules the functions enforce:
--   * Lock order: control row, source configuration row, source lease, job,
--     document. The source row stays share-locked until the transaction ends,
--     so a configuration change waits for a promotion in flight and a later
--     write sees the change.
--   * A job binds the configuration its input was fetched with (url, ordered
--     data_urls, source_kind, province, enabled, label, crawl frequency).
--     Opening compares the caller's configuration with the locked current
--     row; reserve, stage and promote compare the stored one again. A changed
--     or disabled source closes the job and never receives its text.
--   * Every reservation is debited once, before any vector can be staged, up
--     to 2 * ceil(n / 20) + 5 per job. A stage must name its reservation, the
--     same live issuer token, the exact reserved rows and hashes, and a checked
--     receipt. A replacement owner can never submit an earlier owner's rows.
--   * Promotion recomputes coverage, hashes and the fingerprint, replaces the
--     whole live document in one transaction, records the promoted document id
--     and writes the one terminal crawl_logs row. A promoted job's result can
--     be read again without a lease; it never claims to be the current
--     generation.
--   * Limits (also checked by the caller before the call): at most 5000
--     chunks, 8 KiB of UTF-8 per chunk text, 16 KiB of serialized metadata per
--     chunk or document, 8 KiB per title, 8 MiB of serialized rows per open.
--     A larger input fails; it is never truncated.
--   * Each function sets lock_timeout. A statement already running is not
--     cancelled by a function-level setting, and a call whose client stopped
--     waiting can still commit: every commit passes the same checks.
--
-- Security: the three tables have row level security with no policy and only
-- service_role privileges. Every function revokes PUBLIC, anon and
-- authenticated and grants service_role, runs as the caller and pins
-- search_path.
--
-- APPLY ORDER (shared database): after qwen_embedding_model_guards, before the
-- ingest-documents version that calls these functions. The deployed earlier
-- version never calls them and keeps working. Revert: redeploy the earlier
-- function version (open jobs stay inert), then drop the functions and the
-- three tables; no existing object depends on them.

create table if not exists public.knowledge_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_ids uuid[] not null,
  crawl_source_id bigint not null
    references public.crawl_sources (id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'promoted', 'superseded', 'failed')),
  terminal_reason text check (terminal_reason in (
    'promoted', 'superseded', 'newer_generation', 'model_changed',
    'configuration_changed', 'request_cap', 'contract_rejected'
  )),
  embedding_model text not null,
  contract_version text not null,
  source_config jsonb not null,
  source_config_hash text not null,
  content_hash text not null,
  generation_fingerprint text not null,
  chunk_count integer not null check (chunk_count between 0 and 5000),
  title text not null,
  document_metadata jsonb not null,
  fetched_at timestamptz not null,
  request_cap integer not null,
  requests_reserved integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  last_service_at timestamptz,
  closed_at timestamptz,
  promoted_document_id bigint,
  promoted_at timestamptz,
  check ((status = 'open') = (closed_at is null)),
  check ((status = 'promoted') = (promoted_at is not null)),
  check (requests_reserved between 0 and request_cap)
);

create unique index if not exists knowledge_generation_jobs_one_open
  on public.knowledge_generation_jobs (crawl_source_id)
  where status = 'open';
create index if not exists knowledge_generation_jobs_operations
  on public.knowledge_generation_jobs using gin (operation_ids);

create table if not exists public.knowledge_generation_rows (
  job_id uuid not null
    references public.knowledge_generation_jobs (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_text text not null,
  text_sha256 text not null,
  metadata jsonb not null,
  embedding vector(1536),
  receipt_identity text check (receipt_identity in ('canonical', 'catalog_hf')),
  staged_by uuid,
  staged_at timestamptz,
  primary key (job_id, chunk_index),
  check ((embedding is null) = (receipt_identity is null)),
  check ((embedding is null) = (staged_by is null))
);

create table if not exists public.knowledge_generation_reservations (
  request_id uuid primary key,
  job_id uuid not null
    references public.knowledge_generation_jobs (id) on delete cascade,
  issuer_token uuid not null,
  chunk_indexes integer[] not null,
  text_hashes text[] not null,
  outcome text not null default 'reserved'
    check (outcome in ('reserved', 'staged', 'abandoned')),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  check (cardinality(chunk_indexes) between 1 and 20),
  check (cardinality(text_hashes) = cardinality(chunk_indexes))
);

create index if not exists knowledge_generation_reservations_job
  on public.knowledge_generation_reservations (job_id);

alter table public.knowledge_generation_jobs enable row level security;
alter table public.knowledge_generation_rows enable row level security;
alter table public.knowledge_generation_reservations enable row level security;
revoke all on public.knowledge_generation_jobs from public, anon, authenticated;
revoke all on public.knowledge_generation_rows from public, anon, authenticated;
revoke all on public.knowledge_generation_reservations from public, anon, authenticated;
grant all on public.knowledge_generation_jobs to service_role;
grant all on public.knowledge_generation_rows to service_role;
grant all on public.knowledge_generation_reservations to service_role;

-- The canonical configuration of a source: every field that decides what is
-- fetched, how it is converted, and what metadata and citation it gets.
create or replace function public.ingest_generation_source_config(
  p_source_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'url', s.url,
    'data_urls', coalesce(to_jsonb(s.data_urls), '[]'::jsonb),
    'source_kind', s.source_kind,
    'province', s.province,
    'enabled', s.enabled,
    'label', s.label,
    'crawl_frequency_hours', s.crawl_frequency_hours
  )
    from public.crawl_sources s
   where s.id = p_source_id;
$$;

-- What a caller may know about a job. Counts of a closed, unpromoted job are
-- null: its rows are gone, and a count would be invented.
create or replace function public.ingest_generation_summary(p_job_id uuid)
returns jsonb
language sql
stable
set search_path = ''
set timezone = 'UTC'
as $$
  select jsonb_build_object(
    'job_id', j.id,
    'operation_id', j.operation_ids[cardinality(j.operation_ids)],
    'crawl_source_id', j.crawl_source_id,
    'status', j.status,
    'terminal_reason', j.terminal_reason,
    'fingerprint', j.generation_fingerprint,
    'content_hash', j.content_hash,
    'total', j.chunk_count,
    'staged', case
      when j.status = 'promoted' then j.chunk_count
      when j.status = 'open' then (
        select count(*)::integer from public.knowledge_generation_rows r
         where r.job_id = j.id and r.embedding is not null)
    end,
    'remaining', case
      when j.status = 'promoted' then 0
      when j.status = 'open' then (
        select count(*)::integer from public.knowledge_generation_rows r
         where r.job_id = j.id and r.embedding is null)
    end,
    'reserved', j.requests_reserved,
    'cap', j.request_cap,
    'created_at', j.created_at,
    'last_service_at', j.last_service_at,
    'fetched_at', j.fetched_at,
    'closed_at', j.closed_at,
    'promoted_document_id', j.promoted_document_id,
    'promoted_at', j.promoted_at
  )
    from public.knowledge_generation_jobs j
   where j.id = p_job_id;
$$;

-- The common start of every live write: the control row (shared), the source
-- row (shared, held to the end of the transaction), then the caller's live
-- lease, renewed. Raises, changing nothing, when writers are paused, the model
-- or contract is not the serving one, or the token is not the live owner.
create or replace function public.ingest_generation_lock_writer(
  p_source_id bigint,
  p_token uuid,
  p_embedding_model text,
  p_contract text,
  p_lease_seconds integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_paused boolean;
  v_serving text;
  v_contract text;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'Lease seconds must be positive';
  end if;
  select writers_paused, serving_model, contract_version
    into v_paused, v_serving, v_contract
    from public.knowledge_embedding_cutover for share;
  if v_paused then
    raise exception 'Knowledge writes are paused';
  end if;
  if p_embedding_model is distinct from v_serving then
    raise exception 'Embedding model is not the serving model';
  end if;
  if p_contract is distinct from v_contract then
    raise exception 'Embedding contract is not the serving contract';
  end if;
  perform 1 from public.crawl_sources where id = p_source_id for share;
  update public.crawl_source_leases
     set expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
   where crawl_source_id = p_source_id
     and token = p_token
     and expires_at > clock_timestamp();
  if not found then
    raise exception 'Crawl source lease lost';
  end if;
end;
$$;

-- Opens (or reuses) the source's one open job for a complete fetched input.
-- An equal input (model, contract, configuration, content hash, count and
-- fingerprint) keeps every checked vector and takes the newer dates; any other
-- input supersedes the open job and drops its private rows.
create or replace function public.ingest_generation_open(
  p_operation_id uuid,
  p_source_id bigint,
  p_token uuid,
  p_source_config jsonb,
  p_embedding_model text,
  p_contract text,
  p_content_hash text,
  p_title text,
  p_document_metadata jsonb,
  p_fetched_at timestamptz,
  p_rows jsonb,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_existing uuid;
  v_current jsonb;
  v_count integer;
  v_distinct integer;
  v_first integer;
  v_last integer;
  v_fingerprint text;
  v_config_hash text;
  v_open public.knowledge_generation_jobs%rowtype;
  v_job uuid;
begin
  if p_operation_id is null then
    raise exception 'An operation id is required';
  end if;
  -- A repeated operation reads its durable job back, whatever happened since.
  select id into v_existing from public.knowledge_generation_jobs
   where operation_ids @> array[p_operation_id];
  if v_existing is not null then
    return public.ingest_generation_summary(v_existing)
      || jsonb_build_object('replayed', true, 'resumed', false);
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_typeof(p_document_metadata) is distinct from 'object'
     or p_title is null or p_content_hash is null or p_fetched_at is null then
    raise exception 'Rows, title, document metadata, hash and fetch time are required';
  end if;
  if octet_length(p_rows::text) > 8388608
     or jsonb_array_length(p_rows) > 5000
     or octet_length(p_title) > 8192
     or octet_length(p_document_metadata::text) > 16384 then
    raise exception 'Generation input exceeds a limit';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
     where jsonb_typeof(e -> 'chunk_text') is distinct from 'string'
        or coalesce(e ->> 'chunk_index', '') !~ '^[0-9]{1,9}$'
        or jsonb_typeof(coalesce(e -> 'metadata', '{}'::jsonb)) <> 'object'
  ) then
    raise exception 'Each row needs an index, a text and object metadata';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
     where octet_length(e ->> 'chunk_text') > 8192
        or octet_length(coalesce(e -> 'metadata', '{}'::jsonb)::text) > 16384
  ) then
    raise exception 'Generation input exceeds a limit';
  end if;
  select count(*), count(distinct (e ->> 'chunk_index')::integer),
         min((e ->> 'chunk_index')::integer), max((e ->> 'chunk_index')::integer)
    into v_count, v_distinct, v_first, v_last
    from jsonb_array_elements(p_rows) e;
  if v_distinct <> v_count
     or (v_count > 0 and (v_first <> 0 or v_last <> v_count - 1)) then
    raise exception 'Rows must have indexes 0 to n-1 once each';
  end if;

  perform public.ingest_generation_lock_writer(
    p_source_id, p_token, p_embedding_model, p_contract, p_lease_seconds
  );
  v_current := public.ingest_generation_source_config(p_source_id);
  if v_current is null or v_current is distinct from p_source_config then
    raise exception 'Source configuration changed';
  end if;
  if not (v_current ->> 'enabled')::boolean then
    raise exception 'Source is disabled';
  end if;
  if v_count = 0 and v_current ->> 'source_kind' is distinct from 'ircc_newsroom' then
    raise exception 'Only the newsroom can have an empty generation';
  end if;
  -- Checked again under the lease: a retry may have waited for the first try.
  select id into v_existing from public.knowledge_generation_jobs
   where operation_ids @> array[p_operation_id];
  if v_existing is not null then
    return public.ingest_generation_summary(v_existing)
      || jsonb_build_object('replayed', true, 'resumed', false);
  end if;

  -- The empty generation's fingerprint is sha256 of the empty text.
  select encode(sha256(convert_to(coalesce(
           string_agg(encode(sha256(convert_to(e ->> 'chunk_text', 'UTF8')), 'hex'),
                      ',' order by (e ->> 'chunk_index')::integer),
           ''), 'UTF8')), 'hex')
    into v_fingerprint
    from jsonb_array_elements(p_rows) e;
  v_config_hash := encode(sha256(convert_to(v_current::text, 'UTF8')), 'hex');

  select * into v_open from public.knowledge_generation_jobs
   where crawl_source_id = p_source_id and status = 'open'
   for update;
  if found then
    if v_open.embedding_model = p_embedding_model
       and v_open.contract_version = p_contract
       and v_open.source_config_hash = v_config_hash
       and v_open.content_hash = p_content_hash
       and v_open.chunk_count = v_count
       and v_open.generation_fingerprint = v_fingerprint then
      update public.knowledge_generation_jobs
         set operation_ids = operation_ids || p_operation_id,
             title = p_title,
             document_metadata = p_document_metadata,
             fetched_at = p_fetched_at,
             last_service_at = clock_timestamp()
       where id = v_open.id;
      update public.knowledge_generation_rows r
         set metadata = coalesce(e -> 'metadata', '{}'::jsonb)
        from jsonb_array_elements(p_rows) e
       where r.job_id = v_open.id
         and r.chunk_index = (e ->> 'chunk_index')::integer;
      return public.ingest_generation_summary(v_open.id)
        || jsonb_build_object('replayed', false, 'resumed', true);
    end if;
    update public.knowledge_generation_jobs
       set status = 'superseded', terminal_reason = 'superseded',
           closed_at = clock_timestamp()
     where id = v_open.id;
    delete from public.knowledge_generation_reservations where job_id = v_open.id;
    delete from public.knowledge_generation_rows where job_id = v_open.id;
  end if;

  insert into public.knowledge_generation_jobs
    (operation_ids, crawl_source_id, embedding_model, contract_version,
     source_config, source_config_hash, content_hash, generation_fingerprint,
     chunk_count, title, document_metadata, fetched_at, request_cap,
     last_service_at)
  values
    (array[p_operation_id], p_source_id, p_embedding_model, p_contract,
     v_current, v_config_hash, p_content_hash, v_fingerprint,
     v_count, p_title, p_document_metadata, p_fetched_at,
     2 * ceil(v_count / 20.0)::integer + 5, clock_timestamp())
  returning id into v_job;
  insert into public.knowledge_generation_rows
    (job_id, chunk_index, chunk_text, text_sha256, metadata)
  select v_job, (e ->> 'chunk_index')::integer, e ->> 'chunk_text',
         encode(sha256(convert_to(e ->> 'chunk_text', 'UTF8')), 'hex'),
         coalesce(e -> 'metadata', '{}'::jsonb)
    from jsonb_array_elements(p_rows) e;
  return public.ingest_generation_summary(v_job)
    || jsonb_build_object('replayed', false, 'resumed', false);
end;
$$;

-- Read-only reconciliation after an unknown outcome: a job by id or by any
-- operation id that opened it, and a reservation by its request id.
create or replace function public.ingest_generation_status(
  p_job_id uuid,
  p_operation_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_reservation public.knowledge_generation_reservations%rowtype;
  v_job uuid := p_job_id;
  v_summary jsonb;
begin
  if p_request_id is not null then
    select * into v_reservation from public.knowledge_generation_reservations
     where request_id = p_request_id;
  end if;
  if v_job is null and p_operation_id is not null then
    select id into v_job from public.knowledge_generation_jobs
     where operation_ids @> array[p_operation_id];
  end if;
  v_job := coalesce(v_job, v_reservation.job_id);
  v_summary := public.ingest_generation_summary(v_job);
  return coalesce(v_summary, '{}'::jsonb) || jsonb_build_object(
    'found', v_summary is not null,
    'reservation', case when v_reservation.request_id is null then null
      else jsonb_build_object(
        'request_id', v_reservation.request_id,
        'job_id', v_reservation.job_id,
        'outcome', v_reservation.outcome,
        'chunk_indexes', to_jsonb(v_reservation.chunk_indexes)
      ) end
  );
end;
$$;

-- Closes an open job and drops its private rows and reservations. A terminal
-- error (p_error not null) writes its one crawl_logs row in this transaction.
create or replace function public.ingest_generation_close(
  p_job_id uuid,
  p_status text,
  p_reason text,
  p_error text,
  p_duration_ms integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_job public.knowledge_generation_jobs%rowtype;
begin
  if p_status not in ('superseded', 'failed') then
    raise exception 'Close a job as superseded or failed';
  end if;
  update public.knowledge_generation_jobs
     set status = p_status, terminal_reason = p_reason,
         closed_at = clock_timestamp()
   where id = p_job_id and status = 'open'
  returning * into v_job;
  if not found then
    return;
  end if;
  delete from public.knowledge_generation_reservations where job_id = p_job_id;
  delete from public.knowledge_generation_rows where job_id = p_job_id;
  if p_error is not null then
    insert into public.crawl_logs
      (crawl_source_id, url, status, content_changed, chunks_created,
       error_message, duration_ms)
    values
      (v_job.crawl_source_id, v_job.source_config ->> 'url', 'error', false, 0,
       left(p_error, 500), p_duration_ms);
  end if;
end;
$$;

-- Locks the job for a live write after the writer locks, and closes it when
-- its source configuration changed or was disabled. Returns false when the
-- job is not open (any more). Raises for another model or contract: retiring
-- such a job is the separate ingest_generation_retire.
create or replace function public.ingest_generation_lock_job(
  p_job_id uuid,
  p_embedding_model text,
  p_contract text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_job public.knowledge_generation_jobs%rowtype;
  v_current jsonb;
begin
  select * into v_job from public.knowledge_generation_jobs
   where id = p_job_id for update;
  if v_job.status is distinct from 'open' then
    return false;
  end if;
  if v_job.embedding_model is distinct from p_embedding_model
     or v_job.contract_version is distinct from p_contract then
    raise exception 'The generation job has another model or contract';
  end if;
  v_current := public.ingest_generation_source_config(v_job.crawl_source_id);
  if v_current is distinct from v_job.source_config
     or not coalesce((v_current ->> 'enabled')::boolean, false) then
    perform public.ingest_generation_close(
      p_job_id, 'failed', 'configuration_changed',
      'Source configuration changed', null
    );
    return false;
  end if;
  return true;
end;
$$;

-- The job's source id, for the writer locks taken before the job lock. The
-- column never changes, so reading it before the locks is safe.
create or replace function public.ingest_generation_job_source(p_job_id uuid)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_source bigint;
begin
  select crawl_source_id into v_source from public.knowledge_generation_jobs
   where id = p_job_id;
  if v_source is null then
    raise exception 'Generation job not found';
  end if;
  return v_source;
end;
$$;

-- Records one provider attempt before it is sent: the lowest missing rows (at
-- most 20), their stored hashes and the issuing token, debited once against
-- the job's cap. A repeated request id returns the same reservation and its
-- rows (only to the same live owner, while it is unsent) with no new debit.
-- A new reservation abandons the job's earlier unstaged one: its debit stays.
create or replace function public.ingest_generation_reserve(
  p_request_id uuid,
  p_job_id uuid,
  p_token uuid,
  p_embedding_model text,
  p_contract text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_open boolean;
  v_job public.knowledge_generation_jobs%rowtype;
  v_reservation public.knowledge_generation_reservations%rowtype;
  v_indexes integer[];
  v_hashes text[];
begin
  if p_request_id is null then
    raise exception 'A request id is required';
  end if;
  perform public.ingest_generation_lock_writer(
    public.ingest_generation_job_source(p_job_id), p_token,
    p_embedding_model, p_contract, p_lease_seconds
  );
  select * into v_reservation from public.knowledge_generation_reservations
   where request_id = p_request_id;
  if found and v_reservation.job_id <> p_job_id then
    raise exception 'The reservation belongs to another job';
  end if;
  v_open := public.ingest_generation_lock_job(p_job_id, p_embedding_model, p_contract);
  select * into v_job from public.knowledge_generation_jobs where id = p_job_id;

  if v_reservation.request_id is not null then
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'request_id', p_request_id,
      'reservation_outcome', v_reservation.outcome,
      'replayed', true,
      'rows', case
        when v_open and v_reservation.outcome = 'reserved'
             and v_reservation.issuer_token = p_token then (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'chunk_index', r.chunk_index,
                   'chunk_text', r.chunk_text,
                   'text_sha256', r.text_sha256) order by r.chunk_index), '[]'::jsonb)
            from public.knowledge_generation_rows r
           where r.job_id = p_job_id
             and r.chunk_index = any(v_reservation.chunk_indexes))
        else '[]'::jsonb end
    );
  end if;
  if not v_open then
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'request_id', null, 'reservation_outcome', null, 'replayed', false,
      'rows', '[]'::jsonb);
  end if;

  select array_agg(m.chunk_index order by m.chunk_index),
         array_agg(m.text_sha256 order by m.chunk_index)
    into v_indexes, v_hashes
    from (
      select chunk_index, text_sha256 from public.knowledge_generation_rows
       where job_id = p_job_id and embedding is null
       order by chunk_index limit 20
    ) m;
  if v_indexes is null then
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'request_id', null, 'reservation_outcome', null, 'replayed', false,
      'rows', '[]'::jsonb);
  end if;
  if v_job.requests_reserved >= v_job.request_cap then
    perform public.ingest_generation_close(
      p_job_id, 'failed', 'request_cap', 'Embedding request cap reached', null
    );
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'request_id', null, 'reservation_outcome', null, 'replayed', false,
      'rows', '[]'::jsonb);
  end if;

  update public.knowledge_generation_reservations
     set outcome = 'abandoned', closed_at = clock_timestamp()
   where job_id = p_job_id and outcome = 'reserved';
  insert into public.knowledge_generation_reservations
    (request_id, job_id, issuer_token, chunk_indexes, text_hashes)
  values (p_request_id, p_job_id, p_token, v_indexes, v_hashes);
  update public.knowledge_generation_jobs
     set requests_reserved = requests_reserved + 1
   where id = p_job_id;
  return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
    'request_id', p_request_id,
    'reservation_outcome', 'reserved',
    'replayed', false,
    'rows', (
      select jsonb_agg(jsonb_build_object(
               'chunk_index', r.chunk_index,
               'chunk_text', r.chunk_text,
               'text_sha256', r.text_sha256) order by r.chunk_index)
        from public.knowledge_generation_rows r
       where r.job_id = p_job_id and r.chunk_index = any(v_indexes))
  );
end;
$$;

-- Stores the vectors of one confirmed reservation: exactly its rows and
-- hashes, by the token that reserved them while that lease is live, with the
-- adapter's receipt for this batch. A repeat of an applied stage with equal
-- vectors is a no-op; a different vector for a stored row fails.
create or replace function public.ingest_generation_stage(
  p_request_id uuid,
  p_job_id uuid,
  p_token uuid,
  p_embedding_model text,
  p_contract text,
  p_receipt jsonb,
  p_rows jsonb,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_reservation public.knowledge_generation_reservations%rowtype;
  v_job public.knowledge_generation_jobs%rowtype;
  v_count integer;
  v_distinct integer;
  v_incomplete integer;
  v_mismatch integer;
  v_zero integer;
  v_conflict integer;
  v_staged integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'Stage between 1 and 20 vectors per call';
  end if;
  perform public.ingest_generation_lock_writer(
    public.ingest_generation_job_source(p_job_id), p_token,
    p_embedding_model, p_contract, p_lease_seconds
  );
  select * into v_reservation from public.knowledge_generation_reservations
   where request_id = p_request_id;
  if not found or v_reservation.job_id <> p_job_id then
    raise exception 'The reservation is not part of this job';
  end if;
  if v_reservation.issuer_token <> p_token then
    raise exception 'The reservation belongs to another owner';
  end if;
  if not public.ingest_generation_lock_job(p_job_id, p_embedding_model, p_contract) then
    return public.ingest_generation_summary(p_job_id)
      || jsonb_build_object('staged_now', 0, 'replayed', false);
  end if;
  if v_reservation.outcome = 'abandoned' then
    raise exception 'The reservation was abandoned';
  end if;
  select * into v_job from public.knowledge_generation_jobs where id = p_job_id;
  if jsonb_typeof(p_receipt) is distinct from 'object'
     or p_receipt ->> 'model' is distinct from v_job.embedding_model
     or p_receipt ->> 'contract' is distinct from v_job.contract_version
     or coalesce(p_receipt ->> 'identity', '') not in ('canonical', 'catalog_hf')
     or p_receipt ->> 'checked' is distinct from jsonb_array_length(p_rows)::text
     or p_receipt ->> 'native_dimensions' is distinct from '4096'
     or p_receipt ->> 'stored_dimensions' is distinct from '1536' then
    raise exception 'The receipt does not match the reserved batch';
  end if;

  with incoming as materialized (
    select (e ->> 'chunk_index')::integer as chunk_index,
           e ->> 'text_sha256' as text_sha256,
           (e ->> 'embedding')::vector(1536) as embedding
      from jsonb_array_elements(p_rows) e
  ),
  reserved as (
    select unnest(v_reservation.chunk_indexes) as chunk_index,
           unnest(v_reservation.text_hashes) as text_sha256
  )
  select count(*),
         count(distinct i.chunk_index),
         count(*) filter (
           where i.chunk_index is null or i.text_sha256 is null or i.embedding is null
         ),
         count(*) filter (
           where rv.chunk_index is null
              or rv.text_sha256 is distinct from i.text_sha256
              or r.text_sha256 is distinct from i.text_sha256
         ),
         count(*) filter (where i.embedding is not null and vector_norm(i.embedding) = 0),
         count(*) filter (
           where r.embedding is not null and i.embedding is not null
             and r.embedding <> i.embedding
         )
    into v_count, v_distinct, v_incomplete, v_mismatch, v_zero, v_conflict
    from incoming i
    left join reserved rv on rv.chunk_index = i.chunk_index
    left join public.knowledge_generation_rows r
      on r.job_id = p_job_id and r.chunk_index = i.chunk_index;
  if v_incomplete > 0 then
    raise exception 'Each row needs an index, a text fingerprint and a vector';
  end if;
  if v_count <> cardinality(v_reservation.chunk_indexes)
     or v_distinct <> v_count or v_mismatch > 0 then
    raise exception 'Stage exactly the reserved rows and hashes';
  end if;
  if v_zero > 0 then
    raise exception 'Every vector needs non-zero coordinates';
  end if;
  if v_conflict > 0 then
    raise exception 'A chunk already has a different vector';
  end if;
  if v_reservation.outcome = 'staged' then
    return public.ingest_generation_summary(p_job_id)
      || jsonb_build_object('staged_now', 0, 'replayed', true);
  end if;

  update public.knowledge_generation_rows r
     set embedding = (e ->> 'embedding')::vector(1536),
         receipt_identity = p_receipt ->> 'identity',
         staged_by = p_request_id,
         staged_at = clock_timestamp()
    from jsonb_array_elements(p_rows) e
   where r.job_id = p_job_id
     and r.chunk_index = (e ->> 'chunk_index')::integer
     and r.embedding is null;
  get diagnostics v_staged = row_count;
  update public.knowledge_generation_reservations
     set outcome = 'staged', closed_at = clock_timestamp()
   where request_id = p_request_id;
  return public.ingest_generation_summary(p_job_id)
    || jsonb_build_object('staged_now', v_staged, 'replayed', false);
end;
$$;

-- Publishes a complete generation in one transaction. A promoted job returns
-- its stored result (document id, fingerprint, time) with no lease, no source
-- lookup and no write; that result is history, not a claim that the
-- generation is still the current one. An open job needs every live-write
-- guard, an unchanged source, full contiguous coverage with checked vectors,
-- matching text hashes and fingerprint, and no newer live generation.
create or replace function public.ingest_generation_promote(
  p_job_id uuid,
  p_token uuid,
  p_embedding_model text,
  p_contract text,
  p_duration_ms integer,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
set lock_timeout = '5s'
as $$
declare
  v_job public.knowledge_generation_jobs%rowtype;
  v_count integer;
  v_distinct integer;
  v_last integer;
  v_missing integer;
  v_bad_hash integer;
  v_fingerprint text;
  v_url text;
  v_documents integer;
  v_document bigint;
  v_updated timestamptz;
begin
  select * into v_job from public.knowledge_generation_jobs where id = p_job_id;
  if not found then
    raise exception 'Generation job not found';
  end if;
  if v_job.status = 'promoted' then
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'historical', true, 'document_id', v_job.promoted_document_id);
  end if;
  if v_job.status <> 'open' then
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'historical', false, 'document_id', null);
  end if;
  perform public.ingest_generation_lock_writer(
    v_job.crawl_source_id, p_token, p_embedding_model, p_contract,
    p_lease_seconds
  );
  if not public.ingest_generation_lock_job(p_job_id, p_embedding_model, p_contract) then
    return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
      'historical', false, 'document_id', null);
  end if;
  select * into v_job from public.knowledge_generation_jobs where id = p_job_id;

  select count(*), count(distinct chunk_index), max(chunk_index),
         count(*) filter (where embedding is null or receipt_identity is null),
         count(*) filter (
           where text_sha256 <> encode(sha256(convert_to(chunk_text, 'UTF8')), 'hex')
         ),
         encode(sha256(convert_to(coalesce(
           string_agg(text_sha256, ',' order by chunk_index), ''), 'UTF8')), 'hex')
    into v_count, v_distinct, v_last, v_missing, v_bad_hash, v_fingerprint
    from public.knowledge_generation_rows
   where job_id = p_job_id;
  if v_count <> v_job.chunk_count or v_distinct <> v_count
     or coalesce(v_last, -1) <> v_count - 1 or v_missing > 0 then
    raise exception 'Staged chunks are incomplete: % of %', v_count - v_missing, v_job.chunk_count;
  end if;
  if v_bad_hash > 0 or v_fingerprint <> v_job.generation_fingerprint then
    raise exception 'The staged text does not match the generation';
  end if;
  if v_count = 0 and v_job.source_config ->> 'source_kind' is distinct from 'ircc_newsroom' then
    raise exception 'Only the newsroom can have an empty generation';
  end if;

  -- The stored citation url, equal to the current one after lock_job.
  v_url := v_job.source_config ->> 'url';
  select count(*), min(id) into v_documents, v_document
    from public.knowledge_documents where source_url = v_url;
  if v_documents > 1 then
    raise exception 'More than one document for the source';
  end if;
  if v_document is null then
    insert into public.knowledge_documents
      (title, storage_path, source_url, updated_at, metadata, content_hash,
       embedding_model)
    values (v_job.title, '', v_url, v_job.fetched_at, v_job.document_metadata,
            v_job.content_hash, v_job.embedding_model)
    returning id into v_document;
  else
    select updated_at into v_updated from public.knowledge_documents
     where id = v_document for update;
    if v_updated > v_job.fetched_at then
      perform public.ingest_generation_close(
        p_job_id, 'superseded', 'newer_generation', null, null
      );
      return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
        'historical', false, 'document_id', null);
    end if;
    delete from public.knowledge_chunks where document_id = v_document;
    update public.knowledge_documents
       set title = v_job.title,
           updated_at = v_job.fetched_at,
           metadata = v_job.document_metadata,
           content_hash = v_job.content_hash,
           embedding_model = v_job.embedding_model
     where id = v_document;
  end if;
  insert into public.knowledge_chunks
    (document_id, chunk_index, chunk_text, embedding, metadata, updated_at,
     embedding_model)
  select v_document, chunk_index, chunk_text, embedding, metadata,
         v_job.fetched_at, v_job.embedding_model
    from public.knowledge_generation_rows
   where job_id = p_job_id
   order by chunk_index;

  update public.knowledge_generation_jobs
     set status = 'promoted', terminal_reason = 'promoted',
         closed_at = clock_timestamp(), promoted_at = clock_timestamp(),
         promoted_document_id = v_document
   where id = p_job_id;
  delete from public.knowledge_generation_reservations where job_id = p_job_id;
  delete from public.knowledge_generation_rows where job_id = p_job_id;
  insert into public.crawl_logs
    (crawl_source_id, url, status, content_changed, chunks_created, duration_ms)
  values (v_job.crawl_source_id, v_url, 'success', true, v_count, p_duration_ms);
  return public.ingest_generation_summary(p_job_id) || jsonb_build_object(
    'historical', false, 'document_id', v_document);
end;
$$;

-- Marks the start of a continuation's service, so a job that keeps failing
-- moves behind the other open jobs. Closes a job whose source changed.
create or replace function public.ingest_generation_begin_service(
  p_job_id uuid,
  p_token uuid,
  p_embedding_model text,
  p_contract text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
begin
  perform public.ingest_generation_lock_writer(
    public.ingest_generation_job_source(p_job_id), p_token,
    p_embedding_model, p_contract, p_lease_seconds
  );
  if not public.ingest_generation_lock_job(p_job_id, p_embedding_model, p_contract) then
    return public.ingest_generation_summary(p_job_id)
      || jsonb_build_object('serviced', false);
  end if;
  update public.knowledge_generation_jobs
     set last_service_at = clock_timestamp()
   where id = p_job_id;
  return public.ingest_generation_summary(p_job_id)
    || jsonb_build_object('serviced', true);
end;
$$;

-- A provider answer for this owner's reservation failed the adapter's
-- contract check: the job fails, and its one terminal log row is written.
create or replace function public.ingest_generation_reject(
  p_job_id uuid,
  p_token uuid,
  p_request_id uuid,
  p_embedding_model text,
  p_contract text,
  p_error text,
  p_duration_ms integer
)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_reservation public.knowledge_generation_reservations%rowtype;
begin
  perform public.ingest_generation_lock_writer(
    public.ingest_generation_job_source(p_job_id), p_token,
    p_embedding_model, p_contract, 300
  );
  select * into v_reservation from public.knowledge_generation_reservations
   where request_id = p_request_id;
  if not found or v_reservation.job_id <> p_job_id
     or v_reservation.issuer_token <> p_token then
    raise exception 'The reservation is not this owner''s';
  end if;
  if public.ingest_generation_lock_job(p_job_id, p_embedding_model, p_contract) then
    perform public.ingest_generation_close(
      p_job_id, 'failed', 'contract_rejected',
      coalesce(p_error, 'Embedding response failed the contract check'),
      p_duration_ms
    );
  end if;
  return public.ingest_generation_summary(p_job_id);
end;
$$;

-- A fresh fetch found the live document unchanged: the source's open job holds
-- other content and must never promote over it.
create or replace function public.ingest_generation_supersede(
  p_source_id bigint,
  p_token uuid,
  p_embedding_model text,
  p_contract text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_job uuid;
begin
  perform public.ingest_generation_lock_writer(
    p_source_id, p_token, p_embedding_model, p_contract, p_lease_seconds
  );
  select id into v_job from public.knowledge_generation_jobs
   where crawl_source_id = p_source_id and status = 'open'
   for update;
  if v_job is null then
    return jsonb_build_object('superseded', false);
  end if;
  perform public.ingest_generation_close(v_job, 'superseded', 'superseded', null, null);
  return public.ingest_generation_summary(v_job)
    || jsonb_build_object('superseded', true);
end;
$$;

-- Service-only cleanup, separate from the live-write path and needing no
-- lease: closes an open job that can never promote (another serving model or
-- contract, or a changed, disabled or deleted source) and drops only its
-- private rows and reservations. It never touches documents, chunks, sources,
-- attempt stamps, logs or the control row. A compatible job, even while
-- writers are paused, is left open.
create or replace function public.ingest_generation_retire(p_job_id uuid)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_source bigint;
  v_serving text;
  v_contract text;
  v_job public.knowledge_generation_jobs%rowtype;
  v_current jsonb;
  v_reason text;
begin
  v_source := public.ingest_generation_job_source(p_job_id);
  select serving_model, contract_version into v_serving, v_contract
    from public.knowledge_embedding_cutover for share;
  perform 1 from public.crawl_sources where id = v_source for share;
  select * into v_job from public.knowledge_generation_jobs
   where id = p_job_id for update;
  if v_job.status <> 'open' then
    return public.ingest_generation_summary(p_job_id)
      || jsonb_build_object('retired', false);
  end if;
  v_current := public.ingest_generation_source_config(v_source);
  if v_job.embedding_model is distinct from v_serving
     or v_job.contract_version is distinct from v_contract then
    v_reason := 'model_changed';
  elsif v_current is distinct from v_job.source_config
        or not coalesce((v_current ->> 'enabled')::boolean, false) then
    v_reason := 'configuration_changed';
  else
    return public.ingest_generation_summary(p_job_id)
      || jsonb_build_object('retired', false);
  end if;
  perform public.ingest_generation_close(p_job_id, 'failed', v_reason, null, null);
  return public.ingest_generation_summary(p_job_id)
    || jsonb_build_object('retired', true);
end;
$$;

-- Read-only scheduling view of the open jobs, in continuation order.
create or replace function public.ingest_generation_list_open()
returns jsonb
language sql
stable
set search_path = ''
set timezone = 'UTC'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'job_id', j.id,
           'crawl_source_id', j.crawl_source_id,
           'created_at', j.created_at,
           'last_service_at', j.last_service_at,
           'fetched_at', j.fetched_at,
           'fingerprint', j.generation_fingerprint,
           'total', j.chunk_count,
           'staged', (select count(*)::integer from public.knowledge_generation_rows r
                       where r.job_id = j.id and r.embedding is not null),
           'reserved', j.requests_reserved,
           'cap', j.request_cap,
           'compatible', j.embedding_model = c.serving_model
                         and j.contract_version is not distinct from c.contract_version,
           'config_matches', public.ingest_generation_source_config(j.crawl_source_id)
                             is not distinct from j.source_config,
           'source_enabled', coalesce(s.enabled, false),
           'crawl_frequency_hours', s.crawl_frequency_hours
         ) order by j.last_service_at nulls first, j.created_at, j.id), '[]'::jsonb)
    from public.knowledge_generation_jobs j
    left join public.crawl_sources s on s.id = j.crawl_source_id
   cross join public.knowledge_embedding_cutover c
   where j.status = 'open';
$$;

revoke execute on function public.ingest_generation_source_config(bigint) from public, anon, authenticated;
revoke execute on function public.ingest_generation_summary(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_generation_lock_writer(bigint, uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_open(uuid, bigint, uuid, jsonb, text, text, text, text, jsonb, timestamptz, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_status(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ingest_generation_close(uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_lock_job(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ingest_generation_job_source(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_generation_reserve(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_stage(uuid, uuid, uuid, text, text, jsonb, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_promote(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_begin_service(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_reject(uuid, uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_supersede(bigint, uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ingest_generation_retire(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_generation_list_open() from public, anon, authenticated;
grant execute on function public.ingest_generation_source_config(bigint) to service_role;
grant execute on function public.ingest_generation_summary(uuid) to service_role;
grant execute on function public.ingest_generation_lock_writer(bigint, uuid, text, text, integer) to service_role;
grant execute on function public.ingest_generation_open(uuid, bigint, uuid, jsonb, text, text, text, text, jsonb, timestamptz, jsonb, integer) to service_role;
grant execute on function public.ingest_generation_status(uuid, uuid, uuid) to service_role;
grant execute on function public.ingest_generation_close(uuid, text, text, text, integer) to service_role;
grant execute on function public.ingest_generation_lock_job(uuid, text, text) to service_role;
grant execute on function public.ingest_generation_job_source(uuid) to service_role;
grant execute on function public.ingest_generation_reserve(uuid, uuid, uuid, text, text, integer) to service_role;
grant execute on function public.ingest_generation_stage(uuid, uuid, uuid, text, text, jsonb, jsonb, integer) to service_role;
grant execute on function public.ingest_generation_promote(uuid, uuid, text, text, integer, integer) to service_role;
grant execute on function public.ingest_generation_begin_service(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.ingest_generation_reject(uuid, uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.ingest_generation_supersede(bigint, uuid, text, text, integer) to service_role;
grant execute on function public.ingest_generation_retire(uuid) to service_role;
grant execute on function public.ingest_generation_list_open() to service_role;
