# Retry after a context change asks for a new reviewed approval (SPEC review r1 F3)

Finding: after a partial plan approval, a Retry that ran after a relevant profile change
persisted `needs_review/context_changed`, but the saved plan rendered only created retry
results, kept the old failure and offered the same Retry. No new approval path existed.
Requirement: SPEC:131 (changed relevant context needs a revised proposal and a new
approval) and ticket #364 (specific partial outcomes, per-operation receipts, continued
shared work).

## What changed

- SQL (mobile authority `20261027183338_companion_settlement_plan.sql`, edited in place:
  pending, undeployed, same CLI-created identity; web mirror byte-identical, sha256
  `fe227d82…`; rollback mirror `2416ca44…`). `companion_plan_proposals` gains
  `kind 'retry'`, `plan_id`, `retry_of` and a partial index. `companion_plan_retry` puts
  every addition whose relevant context changed since it was last approved into one
  revised review (approved context as `previous_context`, current as `context`) and
  names it in the `needs_review` result. `companion_plan_retryable` no longer offers an
  addition that is in an open review or was settled by one. `companion_plan_apply`
  dispatches a retry review to the new `companion_plan_apply_review` (context re-read
  under the draft lock; original item identity; original plan position; existing-task
  choice; `excluded`). `companion_plan_view` returns `review`. `plan_revise` accepts a
  retry review. A plan Undo closes an open review. A retry that wrote nothing no longer
  moves the plan revision. New function: security definer, `search_path` pinned,
  revoked from public/anon/authenticated and not granted to service_role (internal);
  rollback drops it. Edge function source unchanged.
- Clients (mobile and web): contract fields (`review`, `kind 'retry'`, `retryOf`,
  `planProposalId`, outcome `excluded`); receipt text for reviewed/left-out/needs-review
  results; the saved plan shows the review in place by reusing the draft review
  (embedded), web inside the shared `Reveal` (keyboard activation instant); the entry
  says "needs your review". Six new `plans.*` keys with real translations in ar, en, es,
  fr-CA, hi, pa, vi on both platforms (same values on both).
- Preserved: root F1 (web plan-row navigation), F2 (plan query refresh after task
  saves) and Standards S1 (`Reveal` for Undo/conflict) are untouched; their tests pass.

## Test-first record

| Slice | Red | Green |
|---|---|---|
| B1 backend binding reproduction (fault trigger, profile change, Retry, durable review, approval adds one task with the original identity, reused tasks and original receipt unchanged) | `b1-red.log`: fails at "the needs-review result names no revised proposal" (real persisted result, assertion, not infrastructure) | `b1-green.log` |
| B2-B6 (concurrent retries, replay, second change, stale revision, six concurrent same-id approvals, competing id, lost reply lookup; unrelated change; same-title match swap; Not now, leave out, Undo closes review; account isolation) | Written after B1's implementation, so not red-first. Against the original migration (`backend-against-original-migration.log`) 6 of 6 fail; B1/B2 at assertions, B3 only on the absent `review` field, B4-B6 on a missing field (TypeError), so those three are not counted as binding red. | `backend-green.log` (first run `b2-b6-first-run.log` had one wrong test expectation, `error` vs `reason`, fixed before green; not a product detection) |
| B7 rollback of #364 and re-application with an open review | Written after implementation; not red-first; no mutation | `backend-retry-review-final.log` (8 of 8) |
| Mobile mounted binding case | `m-red.log`: fails at the missing "Not added, because something changed" text after a real retry | `m-green.log` |
| Mobile lost reply on review approval | Written after implementation; mutations below | `m-full-local-stack.log` |
| Web mounted binding case | Written after the web port (not red-first). Run against the original web client files from HEAD with the corrected backend: `w-red-original-client.log` fails at the same missing text | `w-green-first.log`, `w-mounted-final.log` |

Deliberate faults:
- Backend (`backend-mutations.log`, mutated migration copies, product file untouched),
  6 of 6 red at assertions: retryable ignores the open review; review approval skips the
  context re-read; review approval uses a new identity; retry ignores a match change;
  Undo leaves the review open; a left-out addition stays retryable. (The `exit=` lines
  in that log are empty because of the pipeline; the FAILED lines are the result.)
- Mobile client (`m-mutations.log`): review not rendered, entry ignores review, plain
  Retry still offered: red at assertions. Showing the plans-read review instead of the
  newest revision survived (also after adding the second-change step): the plans read is
  invalidated after every review result, so it already carries the refreshed revision.
  Recorded as an equivalent path, not a detection.

## Gates (final candidate content)

- Backend, all 14 files on the owned stack (`backend-all.log`): 99 passed, 0 failed,
  exit 0 (the earlier 91 plus 8 new).
- Mobile: plan and #361 local-stack suites with explicit containers
  (`m-local-stack-final.log`) 2 suites, 8 tests, exit 0. `npm run test:ci` without
  ACTIONS env, exited naturally (`m-test-ci-summary.log`): main 134 passed + 1 skipped
  suites, 1413 passed + 10 skipped (two new skipped local-stack cases); DST 13 passed;
  exit 0. Typecheck exit 0. Changed-file eslint 0 errors, 7 warnings (existing
  `require()`/import-order patterns of the test file). i18n parity OK (1863 keys).
  `expo export --platform ios --platform android` exit 0 (`m-expo-export-summary.log`).
- Web: `vitest run` 54 files, 633 passed + 7 skipped, exit 0. Mounted local-stack file
  plus motion file with env: 11 passed. `tsc --noEmit` exit 0; changed-file eslint
  exit 0; i18n parity OK (2541 keys). `npm run build` in this checkout: exit 0
  (`w-build-summary.log`, Next 16.2.6). This is one build of this candidate; it does
  not resolve or explain the separately owned font-loader failure root observed.
- Advisors (`advisors-summary.json`, local): no finding names an object added or changed
  here; the three plan findings (`companion_plan_unresolved`, `_plain`,
  `_item_operation`: immutable helpers without a pinned search_path) predate this
  correction. `function-privileges.txt` records security definer, search_path and
  role privileges of the changed functions.

## Limits

Local disposable stack only (`unify-actions-364-retry-review-r1`, real GoTrue/JWT,
PostgREST, Postgres 17, edge runtime). No hosted schema, data, permission or deploy
proof. Mobile is Jest/RNTL and web is jsdom; no device, simulator, browser zoom,
screen reader or observed motion timing. The headless plan-drawer browser script was
not rerun. Translations were written for this change, not reviewed by native speakers.
No live model or generation call. Supabase CLI 2.118.0 and Deno 2.7.14; the current
changelog, CLI getting-started page and reset/stop/advisors/migration help were checked
before SQL writes (no relevant breaking change: the Postgres 17.11 notice concerns
ltree, pgcrypto and btree_gist, none used here).
