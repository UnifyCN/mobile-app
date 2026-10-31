# #360 Decision record: shared task contract, schema, and old-client compatibility

Spec: UnifyCN/mobile-app#359. Ticket: #360. Date: 2026-10-25. Branch: `t3/companion-actions-360-corrections` (review round 1 corrections on top of the first probe).
Terms follow `GLOSSARY.md` of the spec (Checklist task, Task state, Waiting, Completed, Task step, Task reminder).

## Verdict

The chosen design works on a disposable local Supabase stack that copies the hosted schema. Every claim below carries a proof class:

- **local-stack**: real Postgres 17, GoTrue, PostgREST, Kong and edge runtime started by the Supabase CLI. Real JWTs from synthetic accounts. Real RLS.
- **released-source**: released client code, unmodified (verified commit, no tracked file changed), with its own locked dependencies, against the local stack. Mobile: the v1.6.0 release commit and the shipped OTA commit, run by their own Jest. Web: the web integration commit, run by its own Vitest. Section 4.
- **dev-shell simulator**: the same released mobile JavaScript loaded by Metro into a Debug development build (Expo SDK 55, RN 0.83) on a dedicated iOS 26.5 simulator, driven through its real UI with Maestro. This is **not** an App Store binary and not a physical device.
- **hosted-read**: read-only queries against the hosted project (`evidence/hosted-read-2026-10-25.md`).
- **not proven**: stated in "Unmet evidence".

Ticket status: **ready for review.** Every acceptance criterion has local-stack proof, and the older-client criterion now also has released-source and dev-shell simulator proof. What stays open is listed in "Unmet evidence": hosted behavior (deployment qualification, not required by this ticket's disposable-environment wording) and store-binary / physical-device qualification. No model mock, SDK mock or in-memory database stands in for any claim here.

Run it: `unify-front-end/supabase/probes/companion-actions-360/run.sh` (see its README). Results: `evidence/probe-run-2026-10-25.md`.

## 1. Current ownership (inspected)

| Concern | Today |
|---|---|
| Companion replies | Edge function `rag-query`. Source and deploy authority: the **web repo** (`supabase/functions/rag-query`, `supabase/config.toml`, `verify_jwt = true`). |
| Mobile -> service | `utils/gemini.ts` calls `POST {SUPABASE_URL}/functions/v1/rag-query` with `fetch` and the user JWT (SSE stream). |
| Web -> service | Browser -> same-origin Next route `app/api/companion/route.ts` -> `supabase.functions.invoke('rag-query')`, forwarding the cookie JWT. It avoids a browser CORS preflight. |
| Generation usage gate | Inside `rag-query`: `check_and_increment_chatbot_usage`, answers 429 `daily_limit_reached` before generation, refunds on failure. |
| Checklist reads and writes | **Direct table access with the user JWT and RLS**, no server. Mobile: `unify-front-end/services/checklist/*`. Web: `services/checklist.ts`. Both send the same PostgREST calls. |
| Content-backed task | Sanity document id in `user_tasks.sanity_checklist_id`, one row per `(user_id, sanity_checklist_id)`. Completion = upsert `completed=true`. Uncheck = update `completed=false`. Dismissal = upsert `dismissed_at`. |
| Custom task | `custom_checklist_tasks` row (`id bigint`). Completion = update. Delete = real `DELETE`. |
| Stable task key | `sanity:<id>` / `custom:<id>` in `checklist_task_order.ordered_keys` (mobile `utils/checklistOrder.ts`, web `taskOrderKey`). |

Hosted shape, policies, counts: `evidence/hosted-read-2026-10-25.md`. Facts that change design choices:

1. `user_tasks` has **no DELETE policy** on hosted. A content-backed task cannot be deleted by a client. Removal already means `dismissed_at`.
2. 132 of 357 `user_tasks` rows are old `task_id`-only rows with a null sanity id. They are not Checklist tasks. The contract ignores them.
3. `custom_checklist_tasks` deletion is a hard delete today, and `delete_user()` cascades through it.
4. The web repo's `20260518100400_checklist.sql` disagrees with hosted (`uuid` ids vs `bigint`/`integer`). The mobile repo's migrations describe hosted. Web local schema must not be used to test this feature.

## 2. Decision: authoritative action service

**A new edge function `companion-actions`, separate from `rag-query`, deployed from the web repo next to `rag-query`.** One public HTTP boundary for both clients.

| Option | Verdict |
|---|---|
| New edge function `companion-actions` (chosen) | Both clients can call it (mobile direct, web through a same-origin proxy like `/api/companion`). It can stay available at the AI limit. Same deploy path as `rag-query`. |
| Extend `rag-query` | Rejected. It couples action authorization to the generation quota. User story 64 needs approvals, Undo and lookup at the AI limit. |
| Next.js route only | Rejected. Mobile cannot use it. |
| Client-side RPC or table writes | Rejected. RLS cannot check approval evidence, operation identity, revision bundles or version gates. |

Boundary details:

- `verify_jwt = true` at the gateway. The function also resolves the user from the JWT (`auth.getUser`). The project anon key passes the gateway but is rejected by the function (401, tested).
- The account comes from the JWT only. No client-supplied owner is read.
- The function calls SQL through the **service role**. The SQL functions are executable by `service_role` only (`anon`, `authenticated` and `public` are revoked, tested). Clients cannot call them over PostgREST.
- The usage gate ends where model generation ends. `prepare`, `apply`, `status`, `read` never call `check_and_increment_chatbot_usage`. `rag-query` calls the shared action module for its own tool loop. The tool loop may only build `prepare` requests and `direct_command` evidence. It must never be given the means to build `ui_control` or `approved_proposal` evidence.
- New web proxy route: `app/api/companion/actions/route.ts` (forwards cookie JWT, same pattern as `app/api/companion/route.ts`). Mobile calls the function directly.

### Request contract (version 1)

`POST /functions/v1/companion-actions`, JSON. Same headers as any Supabase function call (`Authorization: Bearer <user JWT>`, `apikey`).

```
{ contract_version: 1, client: { platform: 'ios'|'android'|'web', app_version }, action: 'read'|'prepare'|'apply'|'status', ... }
read   -> { tasks: [{ task_ref, source, state, waiting_reason, revision, removed, reminders[], title? }] }
prepare{ operations[] }           -> { proposal_id, proposal_revision, operations_hash }      (writes only a draft proposal)
apply  { operation_id, authorization, operations[] } -> { status:'applied', replayed:boolean, operation_id, results[] }
status { operation_id }           -> { status: 'applied'|'pending'|'not_applied', results? }
```

Operations in v1 (probe scope): `task.create_custom`, `task.set_state`, `task.remove`, `task.restore`, `reminder.schedule`. Steps, plan references, saved details and profile fields follow the same pattern in later tickets. Every non-create operation carries `task_ref` and `expected_revision` (`0` means "no row yet").

Request validation happens before any write, so a refused request leaves no row, no receipt and no proposal change (tested per case): `type`, `state` and `task_ref` must be JSON strings; `state` is one of the four states (missing or `null` is refused, it never clears a completed task); `expected_revision`, `message_id` and `proposal_revision` must be non-negative JSON integers within their column range; `proposal_id` must be a UUID; `create_custom` needs a non-blank `title` and a known `priority`; `reminder.schedule` needs a string `remind_at` that parses and a string `time_zone`. Malformed input is a `422` (`403` for authorization evidence), never a `500`.

**Canonical task reference.** One task has exactly one spelling: `custom:<id>` with no sign, padding or leading zero (`custom:[1-9][0-9]{0,17}`), or `sanity:<published Sanity id>` (`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`, never `drafts.` or `versions.`, which would alias the published document). Other spellings are refused with `422 invalid_task_ref` before persistence, and the same grammar is a `CHECK` constraint on every table that stores a `task_ref` (reminders, steps, plan references). Every key stored on hosted already matches it (hosted-read, correction round). Before this rule `custom:044` was accepted as `custom:44`, and a reminder scheduled under the alias survived completion of the task (review round 1, reproduced red).

Errors: `401 unauthorized`, `400 invalid_json|invalid_request`, `403 forbidden|feature_disabled|platform_not_enabled`, `404 not_found`, `409 revision_conflict|operation_id_reused`, `422 invalid_request (reason)`, `426 unsupported_contract_version` (with `supported:{min,max}`), `503 feature_unavailable`. Conflict detail includes `expected` and `actual` revision. The result of each operation carries `before_revision` and `after_revision`.

Version policy: one integer `contract_version`. Fields may be added within a version (clients ignore unknown fields). A breaking change gets a new number, and the gate keeps both numbers in range during the rollout overlap. The server answers 426 with the supported range.

## 3. Decision: additive schema and the four states

Source: `unify-front-end/supabase/probes/companion-actions-360/candidate/up.sql` (and `down.sql`). The dependent task-state ticket promotes it to `unify-front-end/supabase/migrations/` (the mobile repo is the migration authority for these tables; the web repo mirrors the file with the same timestamp, as it did for `20261012192046`). It is applied to hosted only through the normal release path, with the gate off.

**Principle: legacy columns stay authoritative for "completed" and "removed". Rich state refines "not completed".** A legacy write therefore cannot contradict rich state.

```
effective state = completed ? 'completed' : coalesce(progress_state, 'not_started')      progress_state in ('in_progress','waiting')
removed         = dismissed_at is not null            (content-backed)
                  removed_at   is not null            (custom)
```

Added columns on `user_tasks` and `custom_checklist_tasks`: `progress_state`, `waiting_reason` (<= 500 chars, only with `waiting`), `revision bigint not null default 1`, `state_updated_at`. Custom tasks also get `removed_at`. All nullable or defaulted. No backfill: existing rows read as `completed` or `not_started` (tested on seeded pre-migration rows).

New tables (all RLS on, owners may only `SELECT` reminders, steps, plans; no client write privilege): `companion_feature_gate`, `companion_action_receipts`, `companion_proposals`, `companion_task_reminders` (task_ref, `remind_at timestamptz`, IANA `time_zone`, status, cancel reason), `companion_task_steps` (one level, keyed by `task_ref`), `companion_plans` and `companion_plan_tasks` (plan -> `task_ref`). `task_ref` is `sanity:<id>` or `custom:<id>`, the key `checklist_task_order` already uses, so plans, steps, reminders and ordering share one identity. There is no foreign key from `task_ref` to the two task tables (two sources). The action service and the triggers below keep references consistent.

### Legacy write mapping (tested)

| Old client write | Result on the shared record |
|---|---|
| Complete (upsert `completed=true`, or custom update) | `completed`. `progress_state` and `waiting_reason` are cleared by trigger. Pending reminders become `cancelled` (`task_completed`) in the same transaction. |
| Uncheck (`completed=false`) on an unfinished task | No state change (revision still increments). A waiting task stays waiting. |
| Uncheck on a completed task | `not_started`. Old clients have no concept of in-progress. |
| Dismiss / restore (upsert `dismissed_at`) | Removal flag only. Waiting detail is kept. Pending reminders are cancelled on dismissal and are **not** restored on restore. |
| Custom hard `DELETE` | The row is deleted (current behavior). A trigger cancels its reminders and deletes its plan references. Steps are kept as unreachable history until account deletion. A delete made while rolled back is reconciled when `up.sql` runs again (section 6). |
| Any write | `revision` increments, so a stale approval or `expected_revision` is detected. |

New-client removal of a **custom** task sets `removed_at` (reversible). The SELECT policy `Users can read own custom checklist tasks` changes to `auth.uid() = user_id and removed_at is null`, so old clients no longer see it. This is the **only** behavior change visible to old clients. Content-backed removal reuses `dismissed_at`.

Rejected: a `BEFORE DELETE` trigger that turns an old client's hard delete into a soft delete. `delete_user()` runs `DELETE FROM auth.users` as definer while the request role is still `authenticated`, so the cascade hits that trigger. Built and run in `rejected_designs_test.ts`: the account is deleted but its private custom task survives with a dangling owner (`users_left=0 orphan_tasks=1`, no error). That is a data-retention defect, so the candidate has no delete trigger.

Rejected: one new unified `checklist_tasks` table. It needs a data migration and a dual-write period, and the spec forbids a copied task database.

## 4. Mixed-version policy

- **Old mobile builds and the web app keep using direct table writes.** Nothing forces an upgrade. The triggers keep invariants for those writes. Probe proof: the exact PostgREST calls of the legacy services give identical results on the hosted-shape baseline, after `up`, after `down`, and after `up` again (`migration_test.ts`), and the real mobile service functions run against the migrated stack (`__tests__/checklist/companionActionsLegacyCompat.probe.test.ts`).

### Older clients actually exercised

The clients in the field are bound to concrete artifacts. Each ran unmodified (HEAD verified, no tracked file changed before or after) against the hosted-shape baseline, after `up`, after `down`, and after `up` again:

| Client | Artifact | How it ran | Result |
|---|---|---|---|
| iOS/Android v1.6.0 as installed (embedded bundle) | tag `v1.6.0` (tag object `75b8fcdc`, commit `dc2ea1a7`), lockfile supabase-js 2.104.0 (`package.json` range `^2.50.4`) | `historical/historical_test.ts`: its own `lib/supabase` and `services/checklist/*` in its own Jest | All four phases identical to baseline; old writes over rich state as in the table below |
| v1.6.0 after the shipped OTA | commit `33135ac2` (OTA source of the release record), same lockfile versions | same | Same |
| Both, through the real app UI | same two commits, Metro from the immutable checkout, into the existing Debug dev build (`Unify.app` 1.6.0, Expo 55, RN 0.83) on a new dedicated simulator | Maestro: sign in, Checklist tab, "Mark as complete", "Undo completion" | Below |
| Web | web integration commit `8c9ecbf8` (= `origin/main` on 2026-10-25), supabase-js 2.105.4, `@supabase/ssr` 0.10.3 | `historical/web_consumer_test.ts`: its own `services/checklist.ts` and browser client in its own Vitest under jsdom; only the Sanity content client is replaced | All four phases identical; web writes over rich state as below |

Observed through the released v1.6.0 UI (dev-shell simulator, DB read after each tap):

| Phase | Action in the released UI | Database afterwards |
|---|---|---|
| baseline | Mark as complete | row `completed=true` |
| baseline | Undo completion | UI shows the task open; row stays `completed=true` (v1.6.0 sends `DELETE`, hosted has no delete policy). Existing defect, unchanged by the migration |
| after `up`, task set Waiting through the contract | Checklist loads; task shows as not complete; Mark as complete | `completed=true`, waiting detail cleared, revision 2 -> 3 |
| after `up`, In progress + reminder through the contract | Mark as complete | reminder `cancelled (task_completed)` in the same write, revision 4 -> 5 |
| after `up` | Undo completion | no change (same `DELETE` no-op), revision stays 5 |
| after `down` | Checklist loads; Mark as complete on a second task | new row `completed=true` |
| after `up` again | Checklist loads (3/7 after one more completion) | revisions moved on (5 -> 6; the row written while rolled back starts at 2); the cancelled reminder is back as `cancelled` |

Observed through the released OTA UI (same shell): Waiting -> Mark as complete -> `completed`, detail cleared (7 -> 8); Undo completion -> `UPDATE completed=false` -> `not_started` (8 -> 9); after `down`, Undo on another task -> `completed=false`; after `up` again the contract reads both as `not_started` with advanced revisions and the UI loads.

Limits of this proof: the dev shell is a Debug simulator build whose native code matches the 1.6.0 runtime (same `package.json` native dependencies for both commits), not the App Store binary and not a physical device. Analytics went to a local sink, push is skipped on a simulator, and tables outside the checklist (lessons, giveaway) do not exist on the probe stack, so those screens show their error state. The web proof runs the web consumer code, not the deployed web build; the commit deployed to production was not verified (the web host is not reachable from this account).
- **Old clients with `select('*')`** on custom tasks receive extra columns. They ignore them (tested through the real `getCustomChecklistTasks`).
- **New clients** use the contract for everything that touches rich state or needs a receipt or Undo. Plain complete and dismiss controls may keep direct writes; the triggers keep them safe. Moving them to the contract is a dependent-ticket choice, not a compatibility need.
- **Direct-write retirement** is not planned. A later release may tighten RLS after the minimum supported build uses the contract.

## 5. Transactions, receipts, retry, authorization

One SQL function (`companion_apply_actions`, service role only) is the unit of atomicity. PostgREST runs it as a single transaction.

1. `set_config('lock_timeout','3s')`, then `pg_advisory_xact_lock` on `(user, operation_id)`. A concurrent duplicate waits, then reads the committed receipt. If the first writer is stuck for more than 3 s, the duplicate gets `503 operation_in_flight` (`Retry-After: 1`) instead of waiting out the 2 min statement timeout; its outcome stays unknown, so the client uses `status`.
2. Receipt lookup. Same id and same payload hash -> return the recorded result (`replayed:true`). Same id with a different payload -> `409 operation_id_reused`.
3. Validate operations, check authorization evidence, then apply each operation in order. Row locks (`SELECT ... FOR UPDATE`) and a revision comparison guard each task. Any failure raises and rolls back **every** operation of the request, including the receipt.
4. Insert the receipt `(user_id, operation_id)` (primary key) with `request_hash`, `contract_version`, `authorization_evidence`, per-operation outcome with before and after revisions.

Properties, all tested through HTTP:

- 10 simultaneous identical HTTP requests -> one created task, one receipt, one `replayed:false`. A fast race like this can pass by luck (the edge runtime serializes some calls), so the lock itself is bound by two deterministic interleavings: a duplicate sent while the first attempt is executed but uncommitted must wait and then replay, and a duplicate sent while a second connection holds the operation lock must return `pending` / `503 operation_in_flight`.
- 8 competing writers on one revision -> exactly one applied, seven `409`.
- Related operations commit together or not at all (also a reminder with a bad time zone rolls back the task change in the same request).
- Response lost after commit -> `status` returns `applied` with the original results; a retry returns `replayed:true` and writes nothing.
- `status` returns `pending` while a writer holds the operation lock (tested by holding the same advisory lock from a second connection), `not_applied` only when no receipt exists and no writer is in flight. `pending` forbids a new write decision; a new `apply` with the same id is still safe because it waits on the lock.
- A conflict, validation or authorization failure leaves no receipt, so a corrected request may reuse the id. A different payload under an id that has a receipt is refused.

Client rule for an unknown outcome: call `status`. `applied` -> show the recorded result. `pending` -> poll again, never write. `not_applied` -> retry `apply` with the same id (server re-checks authorization and revisions). Lookup failure -> stay unresolved and visible.

**Operation-identity retention:** keep receipts for the life of the account (`ON DELETE CASCADE` from `auth.users`, tested through `delete_user()`). They back Undo, history and duplicate protection, and a receipt row holds identifiers, states and revisions only, not task titles or notes. Add no TTL in v1. Revisit with measured table growth before any TTL; if one is added, it must be longer than the longest client retry window plus the Undo window.

### Authorization evidence (stored on the receipt)

| Kind | Evidence | Server check |
|---|---|---|
| `ui_control` | `{kind}` plus `removal_confirmed:true` for removals | The authenticated request itself. The flag is a client assertion; safe because the user may change their own data. |
| `direct_command` | `{kind, message_id}` | The id must be a `role='user'` message in a conversation owned by the caller. Assistant messages, other users' messages and unknown ids are refused. Removals are refused for this kind. |
| `approved_proposal` | `{kind, proposal_id, proposal_revision}` | The proposal must belong to the caller, have that revision, status `draft`, and `operations_hash` equal to the hash of the submitted operations (which include every `expected_revision`). Check and consume are one `UPDATE ... SET status='applied' WHERE ... status='draft' RETURNING`: it takes the row lock, so a second request with another operation id waits, re-reads the row and is refused (`403`). If the rest of the transaction fails, the consume rolls back with it and the proposal stays usable. Before this, two requests with different operation ids could both use one proposal and create two tasks (review round 1, reproduced red with a held row lock). |

Because the hash covers the operations and their expected revisions, an edit to a **relevant** task makes the approval fail with a conflict, while an edit to an **unrelated** task does not (both tested). A model-supplied `approved:true` flag is ignored (tested). The probe does not decide whether a message text really contains a clear command; that belongs to the tool loop ticket.

## 6. Rollback and feature gating

- **Gate:** one row in `companion_feature_gate`, read on every request: `enabled` (ships `false`), `min_contract_version`, `max_contract_version`, `allowed_platforms[]`. Disabled -> `403 feature_disabled`; version outside range -> `426` with the range; platform not listed -> `403`. A flag flip takes effect on the next request with no deploy. Legacy writes do not depend on the gate (tested).
- **Rollback order:** (1) set `enabled=false`; (2) clients hide the feature on `403/426`; (3) only after traffic stops, run `down.sql`. `down.sql` stops every pending reminder (below), archives rich state, steps, plans, reminders, receipts and proposals into `companion_rollback_archive`, deletes soft-removed custom tasks (the user removed them; the old policy would show them again), restores the old SELECT policy, then drops the added objects. Legacy completed flags and timestamps survive. After `down`, the legacy client scenario matches the baseline exactly, and `up` can run again. All tested.
- **Re-application restores operation identity.** Running `up.sql` again restores, from the archive, the receipts, proposals (consumed ones stay consumed), reminders, steps, plans, removed custom tasks (still removed, still hidden from old clients) and rich task state, then marks the archive rows restored. A client that retries an operation committed before the rollback gets `status: applied` and a replay, never a second write. Before this, create -> down -> up -> enable -> retry created a duplicate task (review round 1, reproduced red). Legacy columns stay authoritative: a task an old client completed while rolled back stays completed and loses its Waiting detail. Accounts deleted while rolled back are purged from the archive, not restored.
- **A full schema rollback stops every pending reminder (rollback reminder policy, chosen by the parent after Spec review round 3).** `down.sql` first sets every `pending` reminder to `cancelled` with reason `schema_rollback` and the time of the rollback, then archives. This includes reminders of tasks that stay open and untouched. Reason: the legacy schema keeps only current values and no event history, so after a completion followed by a reopening, or a dismissal followed by a restoration, made by an old client while rolled back, the task looks exactly like an untouched open task. No current-value reconciliation can tell the two apart, and restoring the schedule would silently restart one that the spec says must stay stopped (spec line 129, testing decision 6). We chose this narrow conservative rule over an event journal for legacy writes, which nobody asked for. Consequences, all tested in `rollback_test.ts` through the public read and the stored rows:
  - Reapplication restarts no schedule. Every reminder row is kept. A reminder already `cancelled` keeps its own reason and time (`task_completed`, ...); a `sent` reminder stays `sent`. A second and a third down/up change nothing that was already stopped.
  - Archives written by the earlier candidate (`22f8c381` and before) can still hold `pending` rows. `up.sql` restores those as `cancelled (schema_rollback)` at the archive's `archived_at`, the time of that rollback.
  - Retrying a pre-rollback `reminder.schedule` operation replays its historical receipt (same `reminder_id`) and schedules nothing.
  - A new reminder needs a new user-authorized schedule (a new operation, for example an approved proposal). Nothing schedules one automatically.
  - A gate-only disable and enable, without `down.sql`, stops nothing: reminders stay `pending`.
  - Plan references to custom tasks deleted while rolled back are dropped on reapplication, as the delete trigger would have done.
  - User-visible consequence, owned by the reminder ticket (#368): after a full rollback and reapplication, every reminder that was pending shows as stopped. The reminder history must show it as stopped by a service interruption (`schema_rollback`), not as stopped by the user's own action, and offer to review and set a new time. It must not create a new reminder by itself.
  - Before this rule, the Spec round 3 reproduction (`reviewer_reopen_test.ts`) returned `pending` for all three reopened or restored cases. Run unchanged against the fixed candidate it still fails by assertion, by design: the three stopped cases now carry `schema_rollback` instead of `task_completed` / `task_removed`, and the untouched open control is `cancelled (schema_rollback)` where that reproduction expected `pending`. The chosen policy supersedes those two expectations.
- **Revisions after re-application.** Nothing counted writes while rolled back, so every task row moves one past its last known revision (rows without rich state go from 1 to 2). Every `expected_revision` and approval captured before the rollback then conflicts, including after a legacy edit that touched no completion column (tested; the first correction attempt only advanced rows whose completion changed, and a title edit slipped through).
- **Archive retention.** Keep `companion_rollback_archive` until `up` has been re-applied, and in any case longer than the client retry window plus the Undo window. Dropping it earlier loses operation identity for operations committed before the rollback. The gate stays off after `up` until an operator enables it, so this is checked before re-enabling.
- `down.sql` loses the Waiting/In-progress distinction and reversible removal while rolled back. Re-application brings both back unless a legacy write superseded them.
- Not decided here: per-app-version staging (the request already carries `client.app_version`; the gate can gain a per-platform minimum version additively).

## 7. Prefactoring

The probe and evidence found these couplings. None needs a blocking prerequisite ticket:

1. **Account deletion cascade** (above): handled by not adding a delete trigger. No code change needed.
2. **Web checklist migration drift** (`20260518100400_checklist.sql`): web local schema is wrong for these tables. Resolution: dependent tickets test on the hosted-shape baseline in the probe (`supabase/migrations/20260101000000_hosted_baseline.sql`), not on web migrations. A separate cleanup of the stale web migration is optional and not a prerequisite.
3. **Silent no-op delete on `user_tasks`**: informational. Do not design a hard delete for content-backed tasks.
4. **`rag-query` size and quota coupling**: action service stays out of that file.
5. **Old `task_id` rows** and nullable `user_tasks.user_id`: triggers and the read function skip rows with a null sanity id.

### Other observations (not caused by this work)

- Web `addCustomTask` sends `description: null` when the field is empty. Hosted `custom_checklist_tasks.description` is `NOT NULL DEFAULT ''` (hosted-read), and the hosted-shape stack answers that insert with `23502 not-null violation` before and after the migration. Whether the web form can submit an empty description in production was not checked. Report only; the migration neither fixes nor worsens it.
- The probe mutations show which mechanism each test binds (`mutation_check.py`: the full run of 16 mutations is all red at assertion level; the plan-reference mutation of round 3 and the 4 rollback reminder policy mutations of round 4, two of them on `down.sql`, were run on their own with the other rollback mutations, 7 of 7 red; a timeout, stack failure or crash counts as unresolved and fails the run; see `evidence/probe-run-2026-10-25.md`). The first round's "11 of 11 red" included one red by crash and one by a lucky race; both now bind deterministically.

## 8. Acceptance criteria map

| Criterion | Proof | Class |
|---|---|---|
| Inspect ownership, sources, access, completion/dismissal; record service and contract | Sections 1-2, hosted evidence | hosted-read + code reading |
| Round trip for content-backed and custom tasks with synthetic accounts; no cross-account access | `actions_test.ts` (round trips, isolation of reads, writes, operation ids, direct table access, direct RPC, new-table writes) | local-stack |
| Additive migration, four states, steps, plan refs, reversible removal, reminders; legacy mapping | Sections 3-4, `migration_test.ts`, `regressions_test.ts` (validation, canonical references), legacy Jest probe, `historical/*` (released mobile JavaScript and web consumer), dev-shell simulator run | local-stack + released-source + dev-shell simulator |
| Concurrent retries, lost response, revision conflict through the public boundary; authorization evidence; identity retention | Section 5, `actions_test.ts`, `regressions_test.ts` (one approval consumed once) | local-stack |
| Rollback and gating with a runnable probe; no production change | Section 6, `migration_test.ts`, `rollback_test.ts`, `run.sh` | local-stack |
| Prefactoring only if demonstrated | Section 7 | local-stack + hosted-read |
| No unresolved question that invalidates the dependent slice | Section 9 | see the assessment at its end |

## 9. Unmet evidence

1. **Hosted behavior is not demonstrated.** Policies, grants, triggers, constraints and identity grammar were read from hosted and copied into the baseline, but no request ran against the hosted project. Not shown: the hosted edge gateway accepting the new function, hosted PostgREST schema-cache reload after the migration, hosted isolation with synthetic accounts. These need a hosted write (migration, deploy or test accounts). Ticket #360 asks for a disposable test environment, so this is **deployment qualification for the first dependent slice**, not a #360 gate: that slice applies the migration with the gate off, deploys the function, and runs this probe's HTTP checks against it with synthetic accounts before the gate is turned on.
2. **Store binary and physical device are not demonstrated.** Released mobile JavaScript (v1.6.0 commit and shipped OTA commit) ran unmodified, both in its own Jest and through its real UI in a Debug development build on a simulator (section 4). Not run: the App Store binary (Release build, embedded Hermes bundle, production native config) and any physical device. The native code of the dev shell matches the 1.6.0 runtime (same native dependencies), and the compatibility surface is the data path (PostgREST calls and their responses), which ran for real. Release qualification of the first dependent slice must still run the installed store build of the current release against the migrated, gate-off hosted backend.
3. **Deployed web build not identified.** The web consumer ran at the web integration commit (`origin/main` on 2026-10-25). Which commit production serves was not verified (the web host account is not reachable from this environment). Web deploys are continuous, so the dependent slice confirms the production commit before the migration lands.
4. **Local edge runtime is not the hosted runtime.** Same open-source runtime family, different version and network path.
5. **Out of scope here, still open in the spec:** reminder delivery, daylight-saving rules, push deep links (spec items 5 and 6), AI allowance, and message-text interpretation for direct commands. The schema leaves room for them; nothing here proves them.
6. Local Postgres is 17.6; hosted is 17.4. Same major version. The migration uses only constant-default `ADD COLUMN` (metadata only) and takes brief table locks; hosted tables are about 170 kB, so lock time is negligible. The re-application recovery block rewrites `revision` on every task row (357 + 25 rows on hosted today), also negligible.

Assessment for the parent. No service or schema question is open: the service and contract are fixed (sections 2 and 5) and the schema and its rollback are proven, including re-application (sections 3 and 6). For old clients, the released JavaScript of both field versions and the web consumer ran unmodified against the schema, and none of their behavior changed (section 4). The parent accepted that released-source and dev-shell proof for the #360 old-client criterion (2026-10-25). The store binary, physical devices, the deployed web commit and the hosted runtime are release qualifications, and #360 needs no production dark deploy. Items 1-4 are release qualification steps the dependent slice must carry as its own acceptance checks either way.
