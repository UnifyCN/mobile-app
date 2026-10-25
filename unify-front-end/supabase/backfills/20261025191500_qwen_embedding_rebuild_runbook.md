# Runbook: move the knowledge base to Qwen3 Embedding 8B

STATUS: not run. Update this line with the date and the operator when it runs.

Target: the shared production project `wrbauxutkysljmsqojts`. It has live mobile
and web users. The parent owns every step in this file. Nothing here has been
run on a hosted project.

Model: `qwen/qwen3-embedding-8b` through OpenRouter. Vectors are the first 1536 of
4096 native coordinates, scaled to length 1. Contract id
`qwen3-8b-prefix1536-l2-v1`. OpenRouter bills it per input token. Retries can
bill again; see "Billing limits".

## What changes, and what must not

- Changes: `knowledge_chunks.embedding`, `knowledge_chunks.embedding_model`,
  `knowledge_documents.embedding_model`.
- Never changes: chunk text, ids, indexes, document ids, URLs, province,
  metadata, content hashes, `created_at`, `updated_at`, `fetched_at`,
  `published_at`, source attempt stamps, cron.
- A query for one model never sees a row of the other model.

## Credentials and the operator script

- The edge function reads `OPENROUTER_API_KEY` from its own secrets. The
  operator never needs that key. Do not print it, log it or pass it as an
  argument.
- The operator needs the service-role key only to call `ingest-documents`.
  Take it from the Vault caller path into an environment variable. Never put
  it in an argument list. `curl` reads the header lines from a file (mode 0600)
  that the shell builtin `printf` writes, so the key is in no process list:

  ```bash
  umask 077
  export HEADERS_FILE="$(mktemp)"
  printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$SERVICE_ROLE_KEY" > "$HEADERS_FILE"
  export FUNCTION_URL=https://wrbauxutkysljmsqojts.supabase.co/functions/v1/ingest-documents
  OP=unify-front-end/supabase/backfills/20261025191600_qwen_embedding_rebuild.sh
  # delete "$HEADERS_FILE" at the end of the session
  ```

- Every admin call below goes through the script `$OP`. It sends the body on
  stdin, never prints the header file, and stops (nonzero exit) on a transport
  error, any non-2xx status, a body that is not a JSON object, an `error` field,
  an invalid UUID, a counter that does not add up, or a status that does not
  show the expected phase and zero missing vectors. **Read the exit code.**
  Only exit 0 means the step passed; anything else means stop and read
  "Interruption recovery".
- Dry run first. It runs the real script against a fake `curl` (no network, no
  key, no database): `bash unify-front-end/supabase/backfills/20261025191700_qwen_embedding_rebuild_dry_run.sh`.
  Expect exactly `dry run: 59 passed, 0 failed` and exit 0. Any other result,
  including a line that says `INVALID`, means do not start.
- Commands: `status`, `begin`, `acquire <run>`, `drain <run> <token>`,
  `activate <run> <token>`, `abort <run>`, `release_worker <run> [token]`,
  `enable_writers`, `rollback`, `return_to_qwen`.

## Admin interface (ingest-documents)

All operations need the service-role key. Anything else is `401`.
A refusal by the database is `409` with the message. A provider failure is
`502` with a sanitized message (never a provider body or a key).

| operation | extra fields | does |
| --- | --- | --- |
| `status` | | phase, serving model, writers paused, run counts, model distribution |
| `begin` | | freezes the corpus (see below); returns `run_id` and the inventory |
| `acquire_worker` | `run_id` | returns `worker_token`; `409` while another worker is live |
| `release_worker` | `run_id`, optional `worker_token` | frees the run. An ABSENT token is the operator's forced release. A token that is present but not a valid UUID is refused with `400` and changes nothing. The CLI script also refuses a supplied empty or malformed token, and more than two arguments, before it sends any request |
| `embed_batch` | `run_id`, `worker_token` | takes at most 20 not-yet-embedded chunks in id order, makes ONE embedding request, stages the vectors; returns `sent`, `staged`, `remaining` |
| `activate` | `run_id`, `worker_token` | the atomic cutover |
| `abort` | `run_id` | back to legacy serving; **writers stay paused** (see "Abort") |
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
TOKEN="$(bash "$OP" acquire "$RUN")"
bash "$OP" drain "$RUN" "$TOKEN"
```

- `drain` stops on the first problem. It ends with exit 0 only after a `sent 0`
  answer with `remaining 0` AND a `status` showing this run in phase `rebuilding`
  with `run_missing` 0. Its `complete` line is not enough on its own: run the
  database coverage check next.
- Coverage check from the database: block 5 of
  `20261025191000_qwen_embedding_preflight.sql` with the run id. Expect
  `missing` 0, `wrong_dimensions` 0, `not_frozen` 0 and `run_rows` equal to the
  chunk count of step 0 (351). Do not go on to step 5 until all four hold.
- Expect 18 requests for 351 chunks: 17 of 20 and one of 11, then one empty
  answer (`sent` 0).
- The FIRST batch is the contract check. A response whose model is not
  `qwen/qwen3-embedding-8b`, whose vectors are not 4096 coordinates, or whose
  indexes do not cover the input is refused by the adapter (HTTP 502,
  "Invalid embedding response"). Nothing is staged and the script exits 1.
  Run `bash "$OP" abort "$RUN"` and stop. Do not change the adapter to accept it.
- A retry can charge again. See "Billing limits".
- Live rows do not change during this step. The legacy index keeps serving.

### 5. Deploy the Qwen query (web-app)

Immediately before the cutover, deploy `rag-query` with the Qwen query adapter
(web-app issue #187). Its Qwen queries return no rows until the cutover.

### 6. Cutover

```bash
bash "$OP" activate "$RUN" "$TOKEN"
```

One transaction. Exit 0 prints the cutover counts (351 chunks, 33 documents).
It refuses (HTTP 409, exit 1, no change) when any chunk has no vector,
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

`bash "$OP" enable_writers`. The hourly schedule is unchanged. Restoring crawl sources
whose attempt was stamped during earlier failed runs is a separate, reviewed
parent step; this runbook does not do it.

## Interruption recovery

The script exits 130 on Ctrl-C or a signal, and 1 on any other problem. After
either, run `bash "$OP" status` before anything else.

| situation | do |
| --- | --- |
| the loop stopped, the worker is gone | wait 300 s, or `release_worker <run>` with only the run id, then `acquire` and `drain` again; it sends only chunks that still have no vector |
| `HTTP 409` "worker lease lost" | another worker took the run; use the new token or release it |
| `release_worker` with a mistyped or empty token (`""`) | refused (exit 1, no request sent by the script; `400` if sent directly). The live worker keeps the lease. Use the exact token, or leave the argument out for the forced release |
| `HTTP 502` from the provider | run `drain` again; nothing was staged by the failed call |
| transport error or timeout | the call may have staged its batch. `status` shows `run_missing`; then run `drain` again |
| `HTTP 409` on `activate`: incomplete | run `drain` until it exits 0 |
| `HTTP 409` on `activate`: corpus changed | `abort`, find the writer, begin a new run |
| the first batch fails the contract | `abort` (see below) |

A stopped run leaves legacy serving and every committed Qwen batch intact.
`abort` keeps the staged vectors for inspection (`knowledge_embedding_rebuild_rows`).
A new `begin` creates a new run id and never overwrites an active run.

## Abort

`bash "$OP" abort "$RUN"` returns the control row to phase `legacy`, serving the
legacy model, and keeps **writers paused**. The deployed ingester is the Qwen
one. Legacy serving refuses its writes, so it must not fetch or buy vectors.

- A claim now names its embedding model. While legacy serves, the Qwen ingester
  gets no claim: it fetches nothing, calls no provider and does not stamp
  `last_crawled_at`, so the source stays due. Its result is `skipped` with
  "Another call is refreshing this source". This holds whether writers are
  paused or not.
- Pick one recovery path on purpose:
  1. **Retry the Qwen move (normal).** Fix the cause, `begin` a new run, rebuild,
     activate, then `enable_writers`. No ingestion runs until the cutover.
  2. **Stay on legacy.** Writers stay paused and nothing is ingested. Resuming
     legacy ingestion needs the direct OpenAI ingester back, which this runbook
     does not authorize. Do not call `enable_writers` for this.
- `enable_writers` after an abort is allowed in phase `legacy`, but with the
  Qwen ingester deployed it only makes every claim report busy. It is not a
  recovery step.
- Check after an abort: `status` shows phase `legacy`, `writers_paused` true.

## Rollback

`bash "$OP" rollback` (or `select public.knowledge_embedding_rollback();`):

- serves the immutable legacy snapshot (the old chunks, their ids and their
  original dates) to legacy-model queries; Qwen queries get no rows;
- leaves the live Qwen index and the staged vectors in place;
- pauses writers; ingestion stays paused. It does not claim current freshness.

To keep answering: redeploy the prior web `rag-query`, which embeds with the
legacy model through OpenRouter. Do not restore the direct OpenAI ingester.

### Return from rollback to Qwen

Order matters. Do not skip a step. Writers stay paused until step 4.

1. **Deploy the Qwen `rag-query`** (web-app issue #187). Until step 2 it reads
   no rows, because rollback still serves the legacy index. Keep that window
   short.
2. `bash "$OP" return_to_qwen`. It refuses unless the live index is entirely
   Qwen. It does not re-embed anything and does not resume writers.
3. **Read checks, writers still paused.** `status`: phase `qwen`, serving model
   `qwen/qwen3-embedding-8b`, `writers_paused` true. Every chunk and document
   labelled `qwen/qwen3-embedding-8b`, none without a vector. Ask the Companion
   the manual answer questions of issue #182: answers carry their sources, an
   Express Entry question shows its date and source, and an Ontario profile
   gets no BC PNP content. A legacy-signature `match_chunks` call returns no rows.
4. Only when step 3 passes: `bash "$OP" enable_writers`.

If step 3 fails, do not enable writers. Run `rollback` again and restore the
legacy `rag-query`.

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
