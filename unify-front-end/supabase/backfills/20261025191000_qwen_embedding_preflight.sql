-- READ-ONLY preflight and post-check for the Qwen embedding rebuild.
--
-- Why: the rebuild re-embeds every knowledge chunk. The operator must see the
-- exact corpus before any paid call, and again after the cutover, counting from
-- one definition of "the corpus".
-- How the values were derived: the expected figures (351 chunks, 33 documents,
-- 13 source-linked documents and chunks, 338 chunks in the other 20 documents)
-- are the counts recorded on 2026-10-25 in web-app issue #177. If a figure is
-- different, find out why BEFORE spending anything; do not reduce the set.
-- Scope guard: this file contains only SELECT statements. It changes nothing.
-- Revert: nothing to revert.
--
-- STATUS: not run. Update this line with the project and date when it runs.
--
-- Run each block separately in the Dashboard SQL editor of the shared project.

-- 1. The corpus. Expect: chunks 351, documents 33, linked 13/13, other 338/20.
select
  (select count(*) from public.knowledge_chunks) as chunks,
  (select count(*) from public.knowledge_documents) as documents,
  (select count(*) from public.knowledge_documents kd
    where exists (select 1 from public.crawl_sources s where s.url = kd.source_url)) as source_linked_documents,
  (select count(*) from public.knowledge_chunks kc
    where exists (select 1 from public.knowledge_documents kd
                    join public.crawl_sources s on s.url = kd.source_url
                   where kd.id = kc.document_id)) as source_linked_chunks,
  (select count(*) from public.knowledge_chunks where document_id is null) as chunks_without_document,
  (select count(*) from public.knowledge_chunks where embedding is null) as chunks_without_vector;

-- 2. Provenance. The migration labels every existing row with the legacy model
-- from the documented history, not from the vector length. Look for any
-- evidence of another model in the stored metadata BEFORE applying it; any row
-- here contradicts the label and needs an explanation. Expect no rows.
select 'document' as kind, id, metadata
  from public.knowledge_documents
 where metadata ? 'embedding_model' or metadata ? 'model'
union all
select 'chunk', id, metadata
  from public.knowledge_chunks
 where metadata ? 'embedding_model' or metadata ? 'model';

-- 3. Vector shape. Every stored vector must have 1536 coordinates.
select vector_dims(embedding) as dimensions, count(*)
  from public.knowledge_chunks
 where embedding is not null
 group by 1;

-- 4. After the migration only: control row and model distribution. Expect before
-- the rebuild: phase legacy, serving openai/text-embedding-3-small, writers not
-- paused. Expect after the cutover: phase qwen, serving qwen/qwen3-embedding-8b,
-- every chunk and document labelled qwen/qwen3-embedding-8b, no chunk without a
-- vector.
select public.knowledge_embedding_status();

-- 5. Rebuild coverage for one run, from the database (not from the loop's own
-- counters). Replace RUN_ID with the run id. Run it after the drain and before
-- the Qwen query is deployed. Expect: missing 0, wrong_dimensions 0,
-- not_frozen 0 (every live chunk is in the frozen set), run_rows equal to the
-- chunk count of step 0 (351).
select
  (select count(*) from public.knowledge_embedding_rebuild_rows
    where run_id = 'RUN_ID') as run_rows,
  (select count(*) from public.knowledge_embedding_rebuild_rows
    where run_id = 'RUN_ID' and qwen_embedding is null) as missing,
  (select count(*) from public.knowledge_embedding_rebuild_rows
    where run_id = 'RUN_ID' and qwen_embedding is not null
      and vector_dims(qwen_embedding) <> 1536) as wrong_dimensions,
  (select count(*) from public.knowledge_chunks kc
    where not exists (select 1 from public.knowledge_embedding_rebuild_rows r
                       where r.run_id = 'RUN_ID' and r.chunk_id = kc.id)) as not_frozen;
