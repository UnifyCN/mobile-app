# Runbook: move the knowledge base to Qwen3 Embedding 8B

STATUS: not run. Update this line with the date and the operator when it runs.

Target: the shared production project `wrbauxutkysljmsqojts`. It has live mobile
and web users. The parent owns every step in this file. Nothing here has been
run on a hosted project.

Model: `qwen/qwen3-embedding-8b` through OpenRouter. Vectors are the first 1536 of
4096 native coordinates, scaled to length 1. Contract id
`qwen3-8b-prefix1536-l2-v1`. The existing OpenRouter balance pays for it. Do not
add credits.

## What changes, and what must not

- Changes: `knowledge_chunks.embedding`, `knowledge_chunks.embedding_model`,
  `knowledge_documents.embedding_model`.
- Never changes: chunk text, ids, indexes, document ids, URLs, province,
  metadata, content hashes, `created_at`, `updated_at`, `fetched_at`,
  `published_at`, source attempt stamps, cron.
- A query for one model never sees a row of the other model.

## Credentials

- The edge function reads `OPENROUTER_API_KEY` from its own secrets. The
  operator never needs that key. Do not print it, log it or pass it as an
  argument.
- The operator needs the service-role key only to call `ingest-documents`.
  Take it from the Vault caller path into an environment variable. Never put
  it in an argument list. `curl` reads a header from a file (mode 0600):

  ```bash
  umask 077
  HEADERS="$(mktemp)"
  printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$SERVICE_ROLE_KEY" > "$HEADERS"
  call() { # usage: call '<json body>'
    curl -sS -X POST "$FUNCTION_URL" -H @"$HEADERS" --data "$1"
  }
  # delete "$HEADERS" at the end of the session
  ```

  `FUNCTION_URL` is `https://wrbauxutkysljmsqojts.supabase.co/functions/v1/ingest-documents`.
- Every call below is `call '{"action":"embedding_rebuild","operation":"..."}'`.

## Admin interface (ingest-documents)

All operations need the service-role key. Anything else is `401`.
A refusal by the database is `409` with the message. A provider failure is
`502` with a sanitized message (never a provider body or a key).

| operation | extra fields | does |
| --- | --- | --- |
| `status` | | phase, serving model, writers paused, run counts, model distribution |
| `begin` | | freezes the corpus (see below); returns `run_id` and the inventory |
| `acquire_worker` | `run_id` | returns `worker_token`; `409` while another worker is live |
| `release_worker` | `run_id`, optional `worker_token` | frees the run; without a token it is the operator's forced release |
| `embed_batch` | `run_id`, `worker_token` | takes at most 20 not-yet-embedded chunks in id order, makes ONE embedding request, stages the vectors; returns `sent`, `staged`, `remaining` |
| `activate` | `run_id`, `worker_token` | the atomic cutover |
| `abort` | `run_id` | back to legacy serving and legacy writers |
| `enable_writers` | | writers resume (only in phase legacy or qwen) |
| `rollback` | | serves the saved legacy snapshot; writers stay paused |
| `return_to_qwen` | | serves the retained Qwen index again |

`embed_batch` never reads text from the request. It only sends text that is
already in the frozen snapshot. A request body cannot make the function embed
arbitrary text.

## Order

Do not skip or reorder steps.

### 0. Preflight (read-only)

1. Open `20261025191000_qwen_embedding_preflight.sql`. Run blocks 1 to 3.
2. Expected: 351 chunks, 33 documents, 13 source-linked documents and chunks,
   338 chunks in 20 other documents, 1536 coordinates everywhere. Block 2 must
   return no row. A different figure needs an explanation before step 1. Never
   reduce the set (no source filter, no province filter, no "has a vector"
   filter).
3. Record the figures in the issue.

### 1. Apply the migration (additive)

1. Dashboard SQL editor, project `wrbauxutkysljmsqojts`: paste
   `migrations/20261025190326_qwen_embedding_model_guards.sql` and run it.
   Do not use `supabase db push`.
2. Run block 4 of the preflight. Expect phase `legacy`, serving
   `openai/text-embedding-3-small`, writers not paused, every row labelled
   `openai/text-embedding-3-small`.
3. Check hosted dispatch and grants (the local tests use an emulation, not
   PostgREST):
   - With the service-role key, `POST /rest/v1/rpc/match_chunks` with the old
     named arguments (`query_embedding`, `match_threshold`, `match_count`,
     optionally `filter_province`) answers 200. With
     `query_embedding_model` added it answers 200.
   - With the anon key, each of these answers an authorization error:
     `match_chunks` (both forms), `stage_knowledge_chunks`,
     `knowledge_embedding_status`.
   - `select * from pg_policies where tablename like 'knowledge_embedding%'`
     returns no row, and `relrowsecurity` is true on both new tables.
4. The deployed functions keep working: they call the legacy signatures.

### 2. Freeze (pauses writers)

Do this BEFORE deploying the Qwen ingest function. The new function would
otherwise embed (paid) and then be refused.

1. SQL editor:
   `select public.knowledge_embedding_begin('qwen/qwen3-embedding-8b', 'qwen3-8b-prefix1536-l2-v1');`
   (The HTTP `begin` does the same once the new function is deployed.)
2. Record `run_id` and the inventory it returns. It must equal the preflight
   figures. If not, `select public.knowledge_embedding_abort('<run_id>');`
   and find out why.
3. Effects: writers are paused; every source lease and staged generation is
   gone (a stopped worker from before the freeze cannot promote); scheduled
   ingestion calls report busy and do no external work; live rows are
   untouched; retrieval for the legacy model keeps answering.

### 3. Deploy the Qwen ingestion and tips functions

`supabase functions deploy ingest-documents generate-daily-tips`. Both read
`OPENROUTER_API_KEY` (already a secret). Neither reads `OPENAI_API_KEY`.
Tips grounding uses Qwen retrieval, so it returns no knowledge-base context
until the cutover. That is the designed behaviour, not a fault.

### 4. Rebuild

```bash
RUN=<run_id>
TOKEN=$(call "{\"action\":\"embedding_rebuild\",\"operation\":\"acquire_worker\",\"run_id\":\"$RUN\"}" | jq -r .worker_token)
while :; do
  OUT=$(call "{\"action\":\"embedding_rebuild\",\"operation\":\"embed_batch\",\"run_id\":\"$RUN\",\"worker_token\":\"$TOKEN\"}")
  echo "$OUT" | jq -c '{sent,staged,remaining,error}'
  [ "$(echo "$OUT" | jq -r '.sent // 0')" = "0" ] && break
done
```

- Expect 18 requests for 351 chunks: 17 of 20 and one of 11, then one empty
  answer (`sent` 0).
- The FIRST batch is the contract check. A response whose model is not
  `qwen/qwen3-embedding-8b`, whose vectors are not 4096 coordinates, or whose
  indexes do not cover the input is refused by the adapter (`502`,
  "Invalid embedding response"). Nothing is staged. Keep legacy serving, call
  `abort`, and stop. Do not change the adapter to accept it.
- A retry can charge again. See "Billing limits".
- Check progress at any time with `status`: `run_missing` falls to 0.
- Live rows do not change during this step. The legacy index keeps serving.

### 5. Deploy the Qwen query (web-app)

Immediately before the cutover, deploy `rag-query` with the Qwen query adapter
(web-app issue #187). Its Qwen queries return no rows until the cutover.

### 6. Cutover

```bash
call "{\"action\":\"embedding_rebuild\",\"operation\":\"activate\",\"run_id\":\"$RUN\",\"worker_token\":\"$TOKEN\"}"
```

One transaction. It refuses (`409`, no change) when any chunk has no vector,
when the worker lease is lost, or when ANY document or chunk differs from the
frozen snapshot (an upload, a delete, a metadata edit). A refusal for a changed
corpus means a writer ran during the freeze. Find that writer. Do not merge
silently; take a new run only after `abort`.

### 7. Read checks (writers still paused)

1. `status`: phase `qwen`, serving model `qwen/qwen3-embedding-8b`.
2. Count from the same full chunk-id set, immediately before the report:
   every chunk and every document labelled `qwen/qwen3-embedding-8b`; 351
   chunks, 33 documents; no chunk without a vector; no row of the legacy model.
3. Ask the Companion the manual answer questions from issue #182 and record
   the answers. Check an Express Entry question shows its date and source, and
   an Ontario profile gets no BC PNP content.
4. A legacy-signature call (`match_chunks` without `query_embedding_model`)
   returns no rows now. That is correct.

### 8. Resume ingestion

`enable_writers`. The hourly schedule is unchanged. Restoring crawl sources
whose attempt was stamped while credits were exhausted is a separate, reviewed
parent step; this runbook does not do it.

## Interruption recovery

| situation | do |
| --- | --- |
| the loop stopped, the worker is gone | wait 300 s, or `release_worker` with only `run_id`, then `acquire_worker` and run the loop again; it sends only chunks that still have no vector |
| `409` "worker lease lost" | another worker took the run; use the new token or release it |
| `502` from the provider | run the same batch again; nothing was staged |
| `409` on `activate`: incomplete | run the loop until `sent` is 0 |
| `409` on `activate`: corpus changed | `abort`, find the writer, begin a new run |
| the first batch fails the contract | `abort`; legacy serving and legacy writers resume |

A stopped run leaves legacy serving and every committed Qwen batch intact.
`abort` keeps the staged vectors for inspection (`knowledge_embedding_rebuild_rows`).
A new `begin` creates a new run id and never overwrites an active run.

## Rollback

`rollback` (or `select public.knowledge_embedding_rollback();`):

- serves the immutable legacy snapshot (the old chunks, their ids and their
  original dates) to legacy-model queries; Qwen queries get no rows;
- leaves the live Qwen index and the staged vectors in place;
- pauses writers; ingestion stays paused. It does not claim current freshness.

To keep answering: redeploy the prior web `rag-query`, which embeds with the
legacy model through OpenRouter. That uses the OpenRouter balance, not the
exhausted OpenAI balance. Do not restore the direct OpenAI ingester.

To go back to Qwen after a rollback: `return_to_qwen` (it refuses unless the
live index is entirely Qwen), then `enable_writers`. It does not re-embed
anything.

## Billing limits

- One `embed_batch` makes one provider request, up to 20 texts. A failure of
  the whole run costs at most the batches already sent.
- The embedding adapter retries on HTTP 429 and 5xx up to two more times, so a
  single batch can be charged up to three times in the worst case (up to 54
  requests for a 351-chunk run). There is no exactly-once billing.
- A stale worker's batch can complete at the provider and then be refused by
  the database. That request is charged and its vectors are discarded.
- Do not run the old ingester, and do not run a comparison test: neither is
  authorized.

## What the local tests do not prove

PGlite runs one statement at a time. Before production, on a real PostgreSQL
test database with stub vectors, the parent must exercise:

- a normal write (shared control lock) and a freeze (exclusive) racing;
- the control-lock, lease, document lock order under two sessions;
- a cutover racing a write in flight;
- hosted PostgREST overload dispatch, service grants and row level security
  (step 1.3), and the complete model distribution (step 7).

The provider's real response identity and native size are proved only by the
first live batch (step 4).

## Retention

The old snapshot (`knowledge_embedding_rebuild_rows`,
`knowledge_embedding_cutover.snapshot_documents`) stays through acceptance. Its
removal is a separate, independently reviewed action. This runbook has no
statement for it.
