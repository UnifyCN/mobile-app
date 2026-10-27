# Runbook: resumable source generations (ingestion response version 2)

STATUS: not run. Update this line with the date and the operator when it runs.

Target: the shared production project `wrbauxutkysljmsqojts`. It has live mobile
and web users. The parent owns every hosted step in this file. Nothing here has
been run on a hosted project. This runbook does not resume, change or replace
the stopped manual source-recovery procedure, its ledger, its owner, its claim
or its disabled timers.

## What changed

A changed source no longer has to finish in one ingestion call. Its complete
chunk set is frozen in a private job (`knowledge_generation_jobs`, `_rows`,
`_reservations`; service role only). Each call embeds what fits in its budget,
saves every checked batch, and the last call publishes the whole generation in
one transaction. Until then readers see the previous document.

Per call (one budget for both sources, from handler entry):

| bound | value |
| --- | --- |
| work deadline (fetches and provider calls aborted, no new work) | 95 s |
| response backstop (no call of any kind starts) | 110 s |
| one database wait | 15 s, never past the backstop |
| provider requests per call, both sources, failures included | 25 |
| provider retries inside the adapter | 0 |
| fresh source start / continuation start | 20 s / 10 s of its share |
| per-job requests (SQL, across calls) | 2 * ceil(n / 20) + 5 |
| page or data file / one source's files | 2 MiB / 8 MiB, read in pieces |
| data addresses per source | 8 |
| records per generation | 5000 (larger fails; never cut) |
| chunk text / metadata / rows sent in one open | 8 KiB / 16 KiB / 8 MiB |
| provider answer | 4 MiB, read in pieces |

With two sources selected, the first may use at most half the remaining work
time and the second the rest; one provider request is kept for the second.
When both queues have work, a call serves one due fresh source and one open
job. A job snapshot older than its source's frequency is fetched again: equal
text keeps its checked vectors with the newer dates; changed text supersedes
the private work.

## Reading a version 2 response

```json
{
  "version": 2,
  "results": [
    { "source_id": 3, "status": "pending", "job_id": "…", "operation_id": "…",
      "fingerprint": "…", "total": 1950, "staged": 420, "remaining": 1530,
      "reserved": 22, "cap": 201, "stop_reason": "work_deadline",
      "unknown_outcome": false }
  ],
  "unstarted_source_ids": [],
  "provider_sends": 22
}
```

- `success`: a promotion committed (its crawl_logs row was written in the same
  transaction).
- `skipped`: unchanged verified content, or another call holds the source.
- `error`: a terminal failure (fetch, conversion, a resource limit, the request
  cap, a configuration change, a contract failure). Fixed messages only.
- `pending`: an open job; it writes no crawl_logs row. `stop_reason` is one of
  `work_deadline`, `source_budget`, `send_limit`, `provider_error`,
  `unknown_outcome`, `store_error`, `response_backstop`. Any count the call
  cannot know is `null`. An open whose answer was lost and that the status
  read did not find yet is pending with `job_id: null`, its `operation_id`
  and `unknown_outcome: true`: it may still commit, so read it back by that
  operation id.
- `unstarted_source_ids`: selected but not started; they were not claimed or
  stamped and stay due.
- HTTP 503 with `setup_complete: false`, `unstarted_source_ids: null` and no
  results: the 110-second backstop passed while the request body was still
  being read or the sources were being chosen. No source was started. A
  cleanup of an incompatible job may have been in flight; it touches only
  private rows.

## Unknown outcomes

A database call whose answer was lost may still have committed. Never treat
it as rolled back. The call reads the job back when time allows; otherwise use
block 2 of `20261026012600_ingest_generation_status.sql` with the `job_id`,
`operation_id` or reservation id. The rules the code follows:

| unknown | rule |
| --- | --- |
| open | no provider request until the job is read back; a retry with the same operation id returns the same job |
| reserve | nothing is sent for it; its debit stays; a later reservation abandons it |
| provider result | the debit stays; that reservation is never sent again |
| stage | read the rows; only the identical payload may be repeated, by the same live owner; a new owner reserves only rows still missing |
| promotion | read the job: `promoted` is success; a repeat returns the stored result without a lease |

## Order of release

1. Read-only preflight: control row `qwen` with contract
   `qwen3-8b-prefix1536-l2-v1`, writers enabled, no live lease, no queued
   ingest request.
2. Apply `20261026012500_ingest_generation_jobs.sql` (additive; shared-schema
   change, needs sign-off). Verify the three tables have RLS, no policy and
   service-role-only privileges, and every `ingest_generation_*` function is
   executable by `service_role` only.
3. Deploy the ingest-documents version that calls these functions. The earlier
   deployed version never calls them and keeps working until then.
4. After each scheduled call, check the platform log (HTTP 200 under 110 s;
   a 503 with `setup_complete: false` means the request setup stalled) and
   blocks 1 and 4 of the status file.

Revert: redeploy the earlier ingest-documents version. Open jobs stay inert;
the earlier code's claim deletes only legacy staging, never job rows. Remove
the schema only after that, with a reviewed drop of the functions and the
three tables; nothing else depends on them.

## Embedding model or contract changes

Strict guards refuse every job write while writers are paused or when the job's
model or contract is not the serving one. A compatible job stays open and inert
through a pause and continues after writers resume. A scheduled call retires a
job of another model or contract (or a changed, disabled or deleted source) with
`ingest_generation_retire`, which needs no lease and touches only that job's
private rows: never documents, chunks, sources, attempt stamps, logs or the
control row.

## What the local tests do not prove

PGlite runs one statement at a time; the lock waits, the late commit after a
client stops waiting and the function `lock_timeout` were checked on a local
PostgreSQL 17 + pgvector 0.8.0 server with synthetic rows. Neither proves
hosted PostgREST (request size limits, overload choice), hosted roles, the edge
worker's wall clock, CPU or memory, OpenRouter's answers, provider charges or
source freshness. Only hosted platform logs prove the 110 s answer. Billing is
bounded per call and per job, not exactly once; there is no daily cap.
