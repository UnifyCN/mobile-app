# #364 Settlement plans: review, approve, reopen (mobile and web)

Spec: UnifyCN/mobile-app#359. Ticket: #364. Builds on #360-#363. Date: 2026-10-27.

A newcomer asks Companion to plan their first week. The answer may carry a typed plan
suggestion: a goal, the Checklist tasks it reuses (by the stable task key the answer was
shown) and up to five missing tasks. The client asks the action service for a
server-owned plan draft. The conversation shows a plan card ("Draft plan · not saved
yet", "2 tasks you already have · 1 new task"), and a persistent plan entry above the
conversation names the open draft or the saved plan in every conversation and after a
restart. Review opens direction B (mobile bottom sheet, web overlay drawer): the
profile values the draft depends on, the reused tasks with their current state, each
addition with an Add checkbox, possible same-title matches to resolve, and one approval
control that names the real change count ("Approve and add 1 task" or "Save plan with
existing tasks"). Approval adds only the included additions (each with its own task
receipt and #363 Undo), saves the plan as ordered references to the shared tasks and
records a plan receipt. Reopening reads current task progress; the receipt keeps the
titles recorded when it was saved. A partial result names what was saved and what
failed and offers Retry of only the failed additions. When something a failed addition
depends on changed before Retry, the Retry opens a revised review of exactly that
remaining addition inside the saved plan (approved and current context shown); only a
new approval adds it. Undo of a plan receipt asks before
it removes what that receipt added, and never reverses a later edit or another receipt.
Steps, reminders, saved details, general task edits and job UI stay out of scope.

The fictional Vancouver arrival (SIN, bank account, phone service) is validation data,
not an audience rule or settlement advice.

## What ships

| Part | Where | Notes |
|---|---|---|
| Migration | mobile `unify-front-end/supabase/migrations/20261027183338_companion_settlement_plan.sql` (authority, created with `supabase migration new`), web mirror byte-identical (sha256 `ead38d1f…`) | Additive and plan-only: columns on `companion_plans` (context, source, proposal_id, operation_id, updated_at, removed_at), table `companion_plan_proposals` (RLS on, no client policy, `revoke all` from anon/authenticated, explicit `service_role` grants), `companion_plan_*` functions. Replaces no shared #361/#363 function. Gate unchanged (ships off). |
| Rollback | `unify-front-end/supabase/rollbacks/20261027183338_companion_settlement_plan.down.sql`, mirrored (sha256 `29f9086f…`) | Run before the #363 and #361 rollback scripts. Archives plan drafts and plan columns to `companion_rollback_archive_364`; re-application restores them and moves every open draft to a new revision marked `restored` (no pre-rollback approval is used). Plan actions answer 503 `feature_unavailable` while rolled back; #361/#363 keep working; added tasks stay. No reminder is touched. |
| Endpoint | web `supabase/functions/companion-actions/plans.ts` (parsing), `planHandler.ts`; `handler.ts` one dispatch block | Actions `plan_prepare`, `plan_proposal`, `plan_revise`, `plan_cancel`, `plan_apply`, `plan_status`, `plan_retry`, `plan_undo`, `plans`, `conversation_plans`. Account from the JWT only. No model, rag-query or generation allowance. |
| Suggestion | web `supabase/functions/rag-query/lib/actions/proposals.ts`, `index.ts` | `[PLAN]`, `[PLAN_TASK]: <task key>`, `[PLAN_NEW]: <title>` lines become `actionProposal {type:'plan', version:1, goal, items}` and are stripped. A reused key must be one of the Checklist tasks this answer read for the account (eligible, not removed); labels come from that read; a new title equal to a listed content task's title carries it as `candidates` (a possible match, never a merge). Anything invalid drops the whole plan. A plan wins over a `[TASK]` line. |
| Clients | mobile `services/companionActions/planContract.ts`, `planClient.ts`, `planStore.ts`, `hooks/companion/usePlans.ts`, `useSendMessage.ts`; web mirrors in `lib/companionActions/*`, `hooks/usePlans.ts`, `hooks/useCompanion.ts`, `services/companion.ts`, `hooks/useAccountScope.ts` | Same store rules as #361/#363: one operation id per intent, unknown outcomes looked up first, pending/lookup failed allow only Check again, not applied retries the same id, Undo names one receipt. Plan caches are keyed by account and removed (with unresolved plan writes) on account change. |
| Mobile UI | `components/companion/plans/PlanEntry.tsx`, `PlanCards.tsx`, `PlanPanel.tsx`, `planText.ts`; `TaskActionsSheet.tsx` (`plan` target); `app/(tabs)/companion/index.tsx` | Entry under "Your tasks"; card under the answer; review and saved plan in the bottom sheet. Plan rows open the task in the same sheet. |
| Web UI | same files under `components/companion/plans/`; `TaskActionsDrawer.tsx` (`plan` target); `app/(main)/companion/page.tsx` | Same behaviour in the overlay drawer (full width when narrow). Transient Saving/Checking/Updating text uses the shared 300ms `loading-delayed`; results and errors are immediate. |
| Telemetry | `companion_action_result` | `operation_type: 'plan.save'`, actions `approve_plan`, `retry_plan`, `undo_plan`, `approve_plan_compensation`, `lookup`, outcomes incl. `partial`, and `change_count` (0-12). Never a goal, title, label or id. |
| i18n | `plans.*` in ar, en, es, fr-CA, hi, pa, vi on both platforms | Real translations. Mobile uses CLDR plural keys (`_one/_other`, ar six forms, es/fr-CA `_many`); web uses its v3 `key`/`key_plural` convention (Arabic uses its general form for both, as the existing web plurals do). |

### Contract (version 1, new actions only)

- `plan_prepare {goal, items[], source?}`: items are `{kind:'existing', task_ref, label?}` or `{kind:'new', title, priority?, candidates?}` (1-12 items, at most 5 new, no duplicate refs or titles). Canonical draft: existing items keep the ref (custom refs must be the caller's, any removed task is refused); new items get keys `n1…` and `include: true`. Writes only the draft row.
- Draft view: `items` (exact, approval sends them back), `change_count`, `unresolved` (included additions with a possible match not yet resolved), `context` (`profile`, `existing` availability, `matches` per addition: the caller's live same-title custom tasks and named content candidates still available), `previous_context`, `review_reason` (`edited`/`context_changed`/`restored`), `tasks` (current state and revision of every referenced task), `receipt`, `plan_id`.
- `plan_revise {plan_proposal_id, proposal_revision, items}`: reorder, drop, toggle `include`, `confirm_new` ("add as a new task"), or replace an addition by one of its matches ("use the task I have"). Titles come from the original draft; a task the preparation did not name is refused (`item_not_in_draft`). New revision, `review_reason: edited`. A stale revision changes nothing (409 `proposal_changed` with the current draft).
- `plan_apply {operation_id, authorization:{kind:'approved_proposal', proposal_id, proposal_revision}, items}`: bound to the draft id, revision and exact items. Relevant context is read again under the draft's row lock; when it changed nothing is written and the refreshed revision comes back (409 `needs_review`). A removed reused task or an unresolved match is refused (422). Approved already under another id: 409 `proposal_changed` with the saved draft and receipt.
- Execution: the plan row first (its failure writes nothing); then each included addition in its own subtransaction: `task.create_custom` through the shared executor, its own receipt (operation id derived from the approval id and the item key) and its plan reference commit together, or the item is recorded as failed. Reused tasks get a reference only; their progress rows are not written. The plan receipt (in `companion_action_receipts`, `task_ref` null, `inverse` null) lists `reused`/`created`/`failed` per item with the title at the time.
- `plan_status`: applied/partial with the reply, `pending` while the operation lock is held, `not_applied`.
- `plan_retry {operation_id, receipt_operation_id}`: only additions still failed, each with its original identity; an item whose matches or profile changed since it was last approved is `needs_review`, not written, and moves to one revised review (a draft of `kind: 'retry'` with `plan_id` and `retry_of` = the plan receipt; the `needs_review` result names it as `plan_proposal_id`). `previous_context` is the approved context, `context` the current one, `review_reason: context_changed`. An addition in an open review is not retryable (no blind repeat); nothing left is 422 `nothing_to_retry`. The plan revision moves only when a retry saved something.
- Revised retry review: `plan_revise` (include, `confirm_new`, use a matching task) and `plan_cancel` work on it as on a plan draft; Not now gives the addition back to Retry. `plan_apply` on it re-reads the context under the draft lock (changed again: 409 `needs_review`, new revision, nothing written), then writes each remaining addition with the identity it had in the plan approval (so one plan item never makes two tasks, whatever path reaches it) at its original plan position, or references the chosen existing task, or records it `excluded`. One `plan_retry` receipt (`retry_of`, `plan_proposal_id`, per-item results); the added task keeps its own task receipt (evidence names the reviewed approval). A plan Undo closes an open review.
- `plan_undo {operation_id, receipt_operation_id, authorization:{kind:'ui_control', removal_confirmed?}}`: removes the plan and the tasks this receipt added (soft removal, #361 trigger stops their pending reminders) when each is still at the revision it was added at; an added task already removed (e.g. by its own Undo) is left alone. Removing a task needs `removal_confirmed`. A newer edit of an added task, or a later change of the plan (a retry), is a conflict: nothing changes and a compensating draft (`kind: undo`) is returned that keeps the edited tasks; approving it (with removal confirmation when it removes) applies it. A receipt is reversed at most once (the shared `undo_of` unique index). The shared task Undo answers `not_undoable` for a plan receipt.
- `plans`: saved plans (not undone), newest first, each with current progress read from the task rows, labels, its plan receipt (`retryable`, `undoable`, `undone_by`, `removal_count`) and `review` (the latest revised retry review: open, approved with its receipt, or closed); open plan drafts. The entry says "needs your review" while a review is open. `conversation_plans {conversation_id}`: the plan drafts that conversation produced, any status.

## Shared-contract interface (recorded early for the #366 sibling)

The plan domain is kept out of every shared #361/#363 function so the step slice (#366)
can extend the shared registry without either migration overwriting the other's
dispatch snapshot.

- SQL: this migration only *adds*: columns on `companion_plans`, the table
  `companion_plan_proposals`, and functions named `companion_plan_*` /
  `companion_plans_read`. It does **not** `create or replace`
  `companion_validate_operations`, `companion_check_authorization`,
  `companion_apply_one`, `companion_apply_actions`, `companion_undo_action`,
  `companion_receipt_summary`, the #363 proposal functions or
  `companion_conversation_actions`. #366's notes (`366-steps.md`, "Shared-interface
  needs") propose re-composing those bodies with plan branches; with this design no plan
  branch is needed in them, so a later #366 replacement composes with this slice as long
  as it keeps the #363 behaviour it must keep anyway.
- It *calls* the shared `companion_apply_one` (`task.create_custom`) and `companion_record`
  for each added task. If #366 replaces `companion_apply_one` it must keep the
  `task.create_custom` branch and its result shape (`task_ref`, `title`,
  `after_revision`).
- Plan receipts live in `companion_action_receipts` (shared operation-id space) with
  `task_ref` null and `inverse` null, so task reads and the shared Undo ignore them.
- Plan drafts have their own table, so no shared check constraint
  (`companion_proposals.kind/status`) is widened.
- Edge function: new files `plans.ts`, `planHandler.ts`; `handler.ts` gains one import and
  one dispatch block before `parseAction` and a widened `ResultLine.action` type.
  `contract.ts` is unchanged. Expected textual overlap with #366: `handler.ts`,
  `rag-query/lib/actions/proposals.ts` (both change `extractActionProposal`), the
  companion page/sheet/drawer files, analytics and the locale files. These are additive
  merges, not conflicting rules.
- Rollback order: #364 down, then any later sibling's down in reverse timestamp order,
  then #363, then #361. The #361 down archives `companion_plans` with `to_jsonb`, so
  this slice's columns must be archived and dropped first (they are, by this down script).

No shared conflict blocked a mutation.

## How to run

Backend (web repo, own disposable stack `unify-actions-364`, ports 60811-60814; the
committed `supabase/tests/companion-actions/supabase/config.toml` keeps the #363
project id and ports, and was changed only temporarily for these runs):
`supabase/tests/companion-actions/run.sh` (all files) or `run.sh plan_test.ts`.
rag-query: `deno test --no-check --node-modules-dir=auto --allow-all supabase/functions/rag-query/index_companion_context_test.ts`.
Mobile: `npx jest __tests__/companionActions/planLocalStack.test.tsx` with
`ACTIONS_API_URL/ANON_KEY/SERVICE_ROLE_KEY` from `run.sh` (`ACTIONS_KEEP=1`) and
`ACTIONS_DB_CONTAINER`/`ACTIONS_REST_CONTAINER` naming the stack's containers.
Web: `npx vitest run components/companion/plans/PlanLocalStack.test.tsx` with the same env;
`npm run test:companion-plan-drawer` (headless Chromium).

## Evidence

Logs: `DOCS/companion-actions/evidence/364/`. Backend runs are real local GoTrue/JWT,
PostgREST, Postgres 17 and the edge runtime serving the real function source, with
synthetic accounts. Nothing hosted.

### Test-first slices (backend boundary, web repo)

| Slice | Red (unchanged code) | Green |
|---|---|---|
| s1 reference journey: reuse SIN + bank, add phone, plan refs, no copied progress | `s1-red-plan-journey.log` (400 `invalid_action`; empty placeholder migration) | `s1-green-plan-journey.log` |
| s2 draft edits: exclusion = new revision, old approval refused, no foreign items, cancel | `s2-red-draft-edits.log` (3 fail) | `s2-green-draft-edits.log` |
| s3 uncertain matches; relevant vs unrelated changes | `s3-red-matches-context.log` (3 fail; the unrelated-progress half passed against the s1 code) | `s3-green-matches-context.log` |
| s3b removed reused task is shown and must be dropped | `s3b-red-removed-reference.log` | `s3b-green-removed-reference.log` |
| s4 concurrent retries, competing ids (held row lock), lost reply, pending, not applied | `s4-red-recovery.log`: 3 fail. "Concurrent retries" and "operation id reused" passed on first run: inherited from the s1 lock/replay design, not counted as red. | `s4-green-recovery.log` |
| s5 partial independent outcome and Retry (injected per-title fault) | `s5-red-partial-retry.log`: partial fails (500). "Plan failure writes no addition" passed on first run (s1 was all-or-nothing). | `s5-green-partial-retry.log` |
| s6 plan Undo: confirmation, conflict + compensation, other receipt untouched, concurrent Undo | `s6-red-plan-undo.log` (5 fail) | `s6-green-plan-undo.log` |
| s7 isolation, forged/invalid, resume + historical receipts, removed task, allowance tripwire | `s7-red-access-resume.log`: 2 fail (missing `conversation_plans`). Forged/invalid, removed-task and allowance passed on first run (behaviour of s1-s6), not counted as red. | `s7-green-access-resume.log` |
| s8 rollback alone and full rollback + re-application | `s8-red-rollback.log`: first test fails by assertion (plan actions still answer after an empty down); the second failed with a PostgresError (dependent objects), a crash, not counted as assertion red. | `s8-green-rollback.log`. One expectation was corrected: after a *full* rollback the added task's own Undo is a reviewed conflict, by the accepted #361 rule that every pre-rollback revision is stale. |
| rag-query plan suggestion | `rq-red-plan-suggestion.log` (4 fail; a first attempt with a wrong test Authorization value got 401 and is not counted) | `rq-green-plan-suggestion.log` |

Deliberate faults (mutated copies of the migration, product file untouched):
`backend-mutations.log`, 5 of 5 red: skipping the context recheck, non-independent
additions, Undo ignoring newer edits, unenforced matches, approval not bound to the exact
items.

Full boundary suite on web `e619a99` (the later web commits add only the browser script
and its npm entry): `backend-all-final.log`, 13 files, 91 passed, 0 failed, exit 0. The
five #364 files hold 26 behaviour tests and 5 cleanup cases; the other 60 are the
accepted #361/#363 files (each with its cleanup case), unchanged and passing. Edge workflow with Deno 2.9.8 (the CI `v2.x`): `deno check` of 21 files
exit 0, `deno test supabase/functions/` 267 passed (`w2-edge-workflow-deno298.log`).

### Mobile client (mounted Companion screen against the real local stack)

`__tests__/companionActions/planLocalStack.test.tsx`: the real screen, send hook, plan
entry/cards/sheet send real requests with real JWTs; conversations and messages are
written and read through PostgREST with the user's JWT; only the model stream, Sanity
content and allowance hooks are stand-ins.

- Red first: `m1-red-mobile-plan.log`, 4 of 4 fail on missing UI (no crash).
- Green: `m1-green-mobile-plan.log`, 4 of 4: suggestion → draft card with counts →
  sheet review (existing vs new, state, profile) → exclude/include changes the button →
  double-tap approval adds exactly one task; composer text kept; entry names the plan;
  analytics carry no title/goal. Restart: entry says "Checking your saved plan…" while
  the read is held, then current progress (SIN completed elsewhere); Undo asks, Keep
  sends nothing, Undo removes only the added task. Lost reply after commit + failed
  lookup: unresolved, approval off, Check again shows the saved result; one apply.
  Account change: sheet closes, no previous goal, no entry for the new account.
- Faults (`m1-mutations.log`), 3 of 3 red: entry hidden while loading, unknown outcome
  not looked up, Undo without asking.
- `m4-local-stack-final.log`: plan suite and the #361 local-stack suite together on the
  combined candidate, own containers, 2 suites / 5 tests, exit 0 without forceExit.
- `npm run test:ci` on the combined candidate (accepted CI fix merged, no ACTIONS env so
  both local-stack suites report their skip case), no forceExit, exited naturally
  (`m3-test-ci.log`): main 134 suites passed + 1 skipped, 1413 passed + 7 skipped; DST 2
  suites, 13 passed; exit 0.
- `typecheck` exit 0, `check-i18n` parity OK, `lint` 0 errors (warnings at the existing
  level; the new test follows the existing `require()` in `jest.mock` pattern)
  (`m3-typecheck-i18n-lint.log`). `npx expo export --platform ios --platform android`
  exit 0 (`m5-expo-export.log`).
- `m2-focused.log` (earlier, before the CI-fix merge): 17 of 18 suites passed; the one
  failure was the #361 local-stack suite run without `ACTIONS_DB_CONTAINER`, see
  "Incident" below. It passes with this stack's containers (`m4-local-stack-final.log`).

### Web client

- `components/companion/plans/PlanLocalStack.test.tsx`: the real Companion page, send hook,
  entry, cards and drawer; `/api/companion/actions` bodies are forwarded, as the proxy
  does, to the real edge function with the account's real JWT; conversations/messages via
  PostgREST with the JWT; i18n with the app's `compatibilityJSON: "v3"`. 4 of 4
  (`w1-green-web-plan.log`): same scenarios as mobile plus keyboard focus kept on the Add
  checkbox through the revision, focus inside the drawer after approval, Escape returns
  focus to the card control. Written after the web port, so not red-first; sensitivity:
  `w1-mutations.log`, 4 of 4 faults red.
- Headless Chromium (`scripts/verify-companion-plan-drawer.mjs`, `w3-plan-drawer-browser.log`):
  51 of 51 for en and ar at 390px, 640px (1280px at 200% zoom) and 1280px: no overflow,
  full width when narrow, inline end when wide (right in English, left in Arabic RTL),
  every drawer control at least 44px tall, Tab stays in the drawer, one draft edit per
  Space with focus kept on the checkbox while pending and after it lands.
- After `npm ci` (lockfile dependencies): `npm test` 53 files, 629 passed + 4 skipped
  (the local-stack plan suite without env), exit 0; `tsc --noEmit` exit 0;
  `check-i18n` OK (2535 keys); `npm run build` exit 0; `eslint` 12 errors, all
  `no-explicit-any` in #361/#362 test files (same files as the integration tip), none in
  #364 files.

## Retry after a context change (SPEC review F3 correction, r1)

SPEC review r1 F3: a retry after a relevant profile change persisted `needs_review`, but
the saved plan showed nothing, kept the old failure and offered the same Retry. Fixed in
the migration (pending, undeployed, same CLI-created identity; mobile and web mirrors
byte-identical, rollback drops the one added function) and in both clients (contract,
receipt text, saved-plan review block reusing the draft review, entry summary, six new
`plans.*` keys in all seven locales). Root F1/F2 and Standards S1 are kept unchanged;
the web review block uses the shared `Reveal`. Evidence:
`evidence/364-retry-review-r1/README.md`.

## Changed existing tests

- Web `supabase/tests/companion-actions/support.ts`: `migrate('up')` also applies #364;
  `migrate('down')`/`migrate363('down')` run the #364 rollback first; `ready()` applies
  #364; schema-cache wait knows the #364 functions; plan request helpers added. No
  assertion changed; all #361/#363 boundary files still pass in the full run.
- Mobile: none (new test only). It uses `createTestQueryClient` from the accepted CI fix.
- Retry-review correction (r1): web `planSupport.ts` gains `failTitle` (a copy of the
  fault helper in `plan_recovery_test.ts`, which is unchanged) and `partialPlan`; new file
  `plan_retry_review_test.ts`. Mobile `planLocalStack.test.tsx` and web
  `PlanLocalStack.test.tsx` gain cases; no existing assertion changed. Web
  `PlanPanelMotion.test.tsx` fixtures gain the new typed fields (`planProposalId`,
  `retryOf`, `review`) only. The web case needs `ACTIONS_DB_CONTAINER` (no default).

## Incident (reported, not hidden)

While running focused mobile suites with my stack's `ACTIONS_API_URL` set, the existing
`companionActionsLocalStack.test.tsx` used its default container names
(`supabase_db_unify-actions-361`, `supabase_rest_unify-actions-361`) for its `psql` and
signal step. That run therefore executed
`update public.companion_feature_gate set enabled = true, min_contract_version = 1, max_contract_version = 1, allowed_platforms = '{ios,android,web}'`
in the old #361 disposable stack's database and sent `SIGUSR1` (schema reload) to its
PostgREST container. Its migration step did not run (the gate read came from my stack).
I did not touch that stack afterwards; its previous gate values are unknown. All later
runs set `ACTIONS_DB_CONTAINER`/`ACTIONS_REST_CONTAINER` to this ticket's containers.

## Proof limits

- Server authorization, revisions, idempotency, partial results, receipts, Undo and
  rollback are proven only on the local disposable stack. No hosted schema, data,
  migration or deploy.
- A reused content task (`sanity:<id>`) is checked by the action service for published
  identity (no `drafts.`/`versions.` prefix) and availability (not removed by this
  account); eligibility (persona, stage, province) is checked where the suggestion is
  made (rag-query reads the account's Checklist). A client could prepare a plan naming an
  ineligible published id; it would be the caller's own plan reference and writes no
  progress.
- Same-title matching is exact title comparison (case and spacing folded) against the
  caller's custom tasks plus content candidates named by rag-query from the titles it
  read; no fuzzy matching.
- No live model: whether a real model writes good `[PLAN]` lines is unproved; the
  suggestion path is proven with the stubbed rag-query harness and the client stand-in
  stream.
- Mobile is Jest/RNTL against the real stack; 44pt/48dp targets are declared styles. No
  simulator, device, VoiceOver or TalkBack run. Web is jsdom plus one headless Chromium
  fixture (not the Next app); no Safari/Firefox or real screen reader.
- Web Arabic plural forms follow the repo's v3 convention (general form for every count).
- Plan Undo after a retry that saved something is a reviewed compensation (it never
  reverses the retry's receipt automatically). A retry that only opened a review does
  not change the plan, so Undo stays direct and closes that review.
- Revised retry review: relevant context is the same as for approval (profile city,
  province, arrival date; same-title matches). A changed task state, other profile
  fields or a removed reused task do not reopen review of an addition.
