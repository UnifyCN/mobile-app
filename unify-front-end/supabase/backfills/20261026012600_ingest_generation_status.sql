-- READ-ONLY status checks for resumable source generations (ingestion
-- response version 2), after migration 20261026012500_ingest_generation_jobs.
--
-- Why: a large changed source now publishes over several ingestion calls. A
-- call can answer `pending` for a source; its job then holds the frozen rows
-- and the checked vectors until one promotion publishes the whole generation.
-- The operator must be able to see pending work, reconcile an unknown outcome
-- and tell a published document from an attempt, without writing anything.
-- How the values were derived: every figure comes from the job tables and the
-- live tables; nothing is expected in advance.
-- Scope guard: this file contains only SELECT statements. It changes nothing,
-- calls no function that writes, and never touches the stopped manual
-- recovery ledger or its parser.
-- Revert: nothing to revert.
--
-- STATUS: not run. Update this line with the project and date when it runs.
--
-- Run each block separately in the Dashboard SQL editor of the shared project.

-- 1. Open jobs in continuation order, with eligibility. `compatible` false
-- (another model or contract), `config_matches` false or `source_enabled`
-- false means the next scheduled call retires the job; it never promotes.
select * from jsonb_to_recordset(public.ingest_generation_list_open()) as j(
  job_id uuid, crawl_source_id bigint, created_at timestamptz,
  last_service_at timestamptz, fetched_at timestamptz, fingerprint text,
  total integer, staged integer, reserved integer, cap integer,
  compatible boolean, config_matches boolean, source_enabled boolean,
  crawl_frequency_hours integer
);

-- 2. One job, or the job behind an operation id or a request id from a
-- pending result (replace the null you know). An unknown outcome is settled
-- here: `status` promoted means the generation was published (with its
-- promoted_document_id and promoted_at); open means it is still pending.
-- A promoted job's record is history: it does not say the generation is still
-- the current one (block 4 does).
select public.ingest_generation_status(
  p_job_id => null::uuid,
  p_operation_id => null::uuid,
  p_request_id => null::uuid
);

-- 3. Reservations of open jobs. `reserved` rows have been debited; a reserved
-- row that is not the newest of its job was abandoned by a later reservation
-- (its request may or may not have reached the provider; it is never resent).
select r.job_id, r.request_id, r.outcome, r.created_at, r.closed_at,
       cardinality(r.chunk_indexes) as rows,
       r.chunk_indexes[1] as first_index
  from public.knowledge_generation_reservations r
  join public.knowledge_generation_jobs j on j.id = r.job_id
 where j.status = 'open'
 order by r.job_id, r.created_at;

-- 4. Per source: the published document (its fetch date), the open job if
-- any, and the last terminal job. A pending job is not a published document:
-- freshness is the document's fetched_at, not the attempt stamp.
select s.id, s.source_kind, s.crawl_frequency_hours, s.last_crawled_at,
       d.id as document_id,
       d.metadata ->> 'fetched_at' as document_fetched_at,
       (select count(*) from public.knowledge_chunks kc where kc.document_id = d.id) as live_chunks,
       o.id as open_job, o.chunk_count as open_total,
       (select count(*) from public.knowledge_generation_rows r
         where r.job_id = o.id and r.embedding is not null) as open_staged,
       o.requests_reserved as open_reserved, o.request_cap as open_cap,
       t.status as last_terminal_status, t.terminal_reason as last_terminal_reason,
       t.closed_at as last_terminal_at
  from public.crawl_sources s
  left join public.knowledge_documents d on d.source_url = s.url
  left join public.knowledge_generation_jobs o
    on o.crawl_source_id = s.id and o.status = 'open'
  left join lateral (
    select status, terminal_reason, closed_at from public.knowledge_generation_jobs
     where crawl_source_id = s.id and status <> 'open'
     order by closed_at desc limit 1
  ) t on true
 where s.enabled
 order by s.id;

-- 5. Terminal results in the last 7 days. Each promotion, request-cap failure
-- and contract failure wrote exactly one crawl_logs row in the same
-- transaction, and so did a configuration change that a writer found during
-- its work ('Source configuration changed'). A job that
-- ingest_generation_retire closed as 'configuration_changed' or
-- 'model_changed' wrote no crawl_logs row, so a missing row there is not a
-- lost error. Superseded jobs ('superseded', 'newer_generation') write none.
select j.crawl_source_id, j.status, j.terminal_reason, j.closed_at,
       j.chunk_count, j.requests_reserved, j.request_cap,
       j.promoted_document_id, j.generation_fingerprint
  from public.knowledge_generation_jobs j
 where j.status <> 'open' and j.closed_at > now() - interval '7 days'
 order by j.closed_at desc;
