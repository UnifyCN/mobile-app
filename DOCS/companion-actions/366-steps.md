# #366 Track one level of task steps without automatic parent completion

Spec: UnifyCN/mobile-app#359. Ticket: #366. Builds on #360-#363 (accepted, integrated at
mobile `0d941015`, web `02377a33`). Date: 2026-10-27.

A user opens one Checklist task (Checklist sheet or the Companion sheet on mobile, the
overlay drawer on web) and tracks preparation steps under it: adds the step they type,
checks it, renames it, or removes it after confirmation. Each control authorizes exactly
its own change and gets its own receipt with a revision-checked Undo. Companion may
suggest steps for one task the answer read; they are a server-owned draft until the
user approves the shown revision. Checking every step never completes the task: the
panel offers "Mark task complete". A completed task keeps its steps exactly as they
were (done and unfinished) and they are read-only until the task is reopened. Plans,
reminders UI/delivery, saved details, general conversational task edits and job UI stay
out of scope.

## What ships

| Part | Where | Notes |
|---|---|---|
| Migration | `unify-front-end/supabase/migrations/20261027183644_companion_task_steps.sql` (CLI-generated, this repo is the authority); web `supabase/migrations/` byte-identical | Additive. No column changes: the #361 `companion_task_steps` table (read-only RLS, writes revoked from API roles) is used as is. New step functions; proposal kind `step_create`; new versions of the shared action functions that keep each accepted body and add marked `#366` lines (table below). |
| Rollback | `unify-front-end/supabase/rollbacks/20261027183644_companion_task_steps.down.sql`, mirrored | Run before the #363 rollback. Restores the #363 functions (and the #361 task read) verbatim. Saved steps stay; step receipts and step drafts are archived to `companion_rollback_archive_366` and come back on re-application (a restored draft needs a new review). No reminder is touched. |
| Endpoint | web `supabase/functions/companion-actions` (`contract.ts`, `handler.ts`, `index.ts`) | Registry entries `step.create`, `step.update`, `step.set_done`, `step.remove`, `step.restore`, `step.remove_created`. `read` also returns `steps` (and still serves tasks after a rollback of this migration). A new step under `sanity:<id>` needs the published Checklist document: one Sanity CDN read (`SANITY_PROJECT_ID`/`SANITY_DATASET`), 404 when absent, 503 `content_unavailable` (nothing written) when the read fails. No model call, no generation allowance. |
| Suggestions | web `supabase/functions/rag-query/lib/actions/proposals.ts`, `index.ts` | `[STEP <task id>]: <title>` lines (at most 5, one task) become `actionProposal {type: 'step.create', version: 1, task_ref, titles}` only when the task id is a Checklist task this answer read for this account. The #363 `[TASK]` behaviour is unchanged and wins when both appear. rag-query writes nothing. |
| Mobile | `services/companionActions/*`, `hooks/companion/useTaskActions.ts`, `hooks/companion/useSendMessage.ts`, `hooks/checklist/useChecklistTaskTitles.ts`, `components/companion/tasks/TaskStepsSection.tsx`, `StepProposalPanel.tsx`, `TaskStatePanel.tsx`, `ReceiptBlock.tsx`, `TaskActionCards.tsx`, `TaskActionsSheet.tsx`, `app/(tabs)/companion/index.tsx` | Steps live inside the shared task panel, so the Checklist sheet and the Companion bottom sheet show the same section. Suggested steps: a dashed draft card under the answer, review in the bottom sheet. |
| Web | `lib/companionActions/*`, `hooks/useTaskActions.ts`, `hooks/useAccountScope.ts`, `hooks/useCompanion.ts`, `services/companion.ts`, `components/companion/tasks/TaskStepsSection.tsx`, `StepProposalPanel.tsx`, `TaskStatePanel.tsx`, `ReceiptBlock.tsx`, `TaskActionCards.tsx`, `TaskActionsDrawer.tsx`, `app/(main)/companion/page.tsx` | Same behaviour in the overlay drawer. The lib files are the mobile files through prettier (only header comments and `Array<>` spelling differ). |
| i18n | `taskSteps.*` (56 keys) in ar, en, es, fr-CA, hi, pa, vi on both platforms | Real translations; no plural forms needed (counts are written as "label: n"). Each step Undo names its own change. |
| Telemetry | `companion_action_result` | New actions `step_change`, `approve_steps`; `operation_type` is the step type. Never a title or id (tested on both clients). |

### Shared-interface needs (for #364 plans; recorded before any client work)

#366 and #364 both extend the same database action functions, each a single SQL body
that a later migration must `create or replace`. Whichever of #364/#366 is accepted
second must re-compose these bodies so that both domains survive. #366 keeps every
accepted #361/#363 branch verbatim and adds only a narrow dispatch to step-owned
functions, so re-composition is a merge of added branches, not a rewrite. No actual
conflict blocked a #366 mutation (#364 had not been accepted when this was handed off).

| Shared function (current owner) | What #366 adds | Composition rule |
| --- | --- | --- |
| `companion_validate_operations` (#363) | `step.*` calls `companion_step_validate(op)` | add a `plan.*` dispatch next to it; keep the `step.*` line |
| `companion_check_authorization` (#363) | step removal confirmation; `ui_control` adds exactly one step and cannot restore or remove an added set; `step.remove_created` only as the compensation of its own create receipt | add plan rules as separate branches; keep the step block |
| `companion_apply_one` (#363) | `step.*` calls `companion_apply_step(user, op)`; a completion result records `steps_done`/`steps_total` | add a `plan.*` dispatch; keep both step lines |
| `companion_receipt_summary` (#363) | `steps` (historical titles) and per-step `current`; completion counts | add plan fields as another `case` |
| `companion_undo_action` (#363) | a `step.*` receipt goes to `companion_undo_step` | add a plan dispatch; keep the step dispatch |
| `companion_read_tasks` (#361) | `last_receipt` excludes step receipts | keep the filter |
| `companion_prepare_proposal`, `_revise_`, `_cancel_`, `_recheck_`, `companion_conversation_actions` (#363) | kind `step_create`; context through `companion_proposal_context` (by kind) | add plan kinds beside it |
| `companion_proposals.kind` check (#363) | adds `step_create` | the constraint must list both new kinds |
| edge `contract.ts`/`handler.ts`, rag-query `proposals.ts` | separate registry objects; `prepare`/`revise` accept `step.create`; `read` adds `steps`; one suggestion per answer | add plan entries the same way |

### Behaviour rules (tested)

- One level only: a parent is always a task ref (`sanity:` published id or `custom:` positive id); `step:` refs, a `parent_step_id` field or any unknown field are refused. Steps never become main-list tasks.
- The parent must be this account's live, unfinished task. Missing, rolled-back (failed creation), hard-deleted, removed, another account's, or completed parents write nothing. A parent completion/removal and a step write are ordered, never interleaved, also when a content-backed task has no progress row yet (see "Parent ordering (review F1)" below). Adding, checking or editing steps never changes the parent's state or revision (an absent progress row stays absent, revision 0).
- Direct controls: `ui_control` adds exactly the one typed step; check, rename and remove act on one step at the revision shown. Every removal (and the Undo of an add) needs `removal_confirmed`; Keep sends nothing. Suggestions are drafts until the shown revision is approved; changing the selection saves a new revision first; a relevant change (a live step with a suggested title appears or goes away) answers `needs_review`, also when it commits while the approval is already waiting (see "Approval context (review F3)" below); an unrelated change (checking a step, another title, another task or account) does not. Two explicit direct adds of the same title stay legal.
- One operation id per intent: duplicate and concurrent sends save once; a lost reply is looked up; `pending`/lookup failure never write; `not_applied` retries the same id and payload; a reused id with another payload is refused.
- Receipts keep each step's title and done state as saved; a later rename or check makes them historical, never rewrites them. Undo targets one receipt: removal Undo restores; an Undo after a newer edit changes nothing and offers a reviewed change (a removal one also needs confirmation); two Undo requests apply once.
- Completion keeps unfinished steps unfinished, stops pending reminders in the same transaction (#361 trigger), and Undo/reopen restarts none. The completion receipt records "done of total" at that moment.
- Clients: typed step and edit text live in the account's action store (close, reopen and updates keep it); writes are off offline or after a failed read; the focused checkbox stays the same element through its save and re-read; an account change drops steps, drafts and typed text before the next account renders; controls meet 48dp (Android) / 44pt (iOS) on mobile and 44px rows/icon buttons on web.

## Parent ordering (review F1, correction r1)

Review `review-366-SPEC-r1.md` F1: with no `user_tasks` row for `sanity:<id>`, `step.create` read the
parent as Not started *before* its add lock, and nothing made a legacy insert wait. A held step add
saved (200) after a legacy completion/dismissal had committed and been publicly read with no step.
Step checks/renames had the same window (they took no parent lock at all).

Design (in the pending, undeployed `20261027183644_companion_task_steps.sql`, mirrored byte for byte;
no new migration):

- Parent lock: `companion_step_parent_lock(user, task_ref)` = transaction advisory lock on
  `hashtextextended(user || ':' || task_ref, 366)` (the key the add lock already used). Per account
  and task, so unrelated tasks/accounts never wait.
- Step writes: `companion_step_parent` takes the parent lock *before* it reads a content-backed
  parent (then `for share` on the row when one exists). Every step write and step Undo goes through
  it, and the same lock orders the positions of concurrent adds. (Correction F3 below extends the
  lock to custom parents too.)
- Legacy and service writes: a new `BEFORE INSERT OR UPDATE` trigger `companion_user_tasks_step_order`
  on `user_tasks` takes the same lock when the row it writes is completed or removed and is either an
  insert (a first insert, and the insert part of an `INSERT ... ON CONFLICT` upsert, whose BEFORE INSERT
  trigger fires before the conflict check) or an update that moves a row onto a `(user, sanity id)` key.
  A plain UPDATE of an existing row takes no parent lock: the step write's `for share` row lock orders it.
- Lock order: parent lock → progress row, for step writes and upserts alike; a plain UPDATE takes the
  row only. (Full order after F3: operation lock → proposal row → step rows → parent lock → task row.) Writes to existing steps lock their step rows before the parent lock, and no legacy or
  task writer locks step rows, so there is no cycle. One operation per apply, one parent per operation.
  Deliberate fault M4 (every UPDATE takes the parent lock) produced a real `40P01 deadlock detected`,
  which is why plain updates are excluded.
- Observable legal orders: (a) the step holds the parent first → the legacy completion/dismissal waits
  (pg_stat_activity: `advisory`) until the step commits; the step is saved (receipt `not_started` →
  `not_started`) and stays as history of the completed/removed task, parent revision 1 (the legacy
  insert's own). (b) The legacy write holds the parent first → the step write waits, then reads the
  change and is refused 422 `task_completed`/`task_removed`, nothing saved. A completion committed and
  read with no step can no longer be followed by a saved step.
- Rollback drops the trigger and the lock function (legacy writes then take no step lock); re-applying
  restores ordering (tested). Older clients' requests are unchanged; they may wait for one step write.

Tests: web `supabase/tests/companion-actions/steps_parent_race_test.ts` (11), through real local
GoTrue/JWT/PostgREST/edge with the released request shapes (mobile `setChecklistItemCompletion`,
`setChecklistItemDismissed`, `updateTaskCompletion`; web `services/checklist.ts`). Logs and the
red/green/mutation record: `DOCS/companion-actions/evidence/366-parent-r1/README.md`.

## Approval context (review F3, correction r1)

Review `review-366-SPEC-r2.md` F3: the approval of suggested steps read its relevant context (live
steps of the task with a suggested title) in `companion_recheck_proposal` *before* it waited for the
parent lock in `companion_apply_step`, and did not read it again after the wait. A direct add of the
same title could commit and be publicly read while the approval waited; the approval then saved a
second step without a new review (200, two steps). Renames, removals and Undo restores of custom-task
steps also took no parent lock, so they could commit even after the approval had read its context.

Design (same pending, undeployed migration, mirrored byte for byte; rollback unchanged):

- `companion_recheck_proposal` takes the parent lock of a `step_create` draft after its proposal row
  lock and draft checks and *before* it reads the context. The lock is held until the approval's
  steps are inserted and committed, so no relevant change can commit between the read and the save.
  A change that committed while the approval waited is read and answers `needs_review` (new draft
  revision, refreshed context); nothing is written or consumed.
- `companion_step_parent` takes the parent lock first for custom parents as well (then `for share`
  on the custom task row), so every step change (add, rename, check, remove, restore, Undo,
  compensation) of any task is ordered by it. The separate add lock in `step.create` became
  redundant and was removed.
- Lock order: operation lock → proposal row → step rows → parent lock → task row. Approvals,
  compensation approvals, direct writes, step Undo, prepare (parent lock, then a new proposal row)
  and legacy upserts all follow it; revise and cancel take the proposal row only (revise's context is
  re-read under the lock at approval). No new proposal-row/parent-row/advisory inversion; F1's
  trigger and plain-UPDATE rule and the absent-parent revision-0 rule are unchanged.
- Not changed: no text deduplication (two explicit adds of one title are legal), no account-wide
  serialization (per account and task), no new command grammar, same action service and receipts.

Tests: web `supabase/tests/companion-actions/steps_context_race_test.ts` (23): serial control; eight
relevant change kinds (same-title add on both task sources, rename to/away from the title, confirmed
removal, Undo restore, confirmed Undo of an add) each with the change queued first (a second SQL
holder keeps the approval blocked while a complete public read shows the change) and with the
approval first; three cases that stop the approval after its context read (an uncommitted receipt row
with its operation id); unrelated changes; competing approvals with replays; rollback/re-apply.
Logs, red/green, deliberate faults and limits: `DOCS/companion-actions/evidence/366-context-r1/README.md`.

## How to run

Backend (web repo, own stack): `cd supabase/tests/companion-actions && ACTIONS_CONTENT_PORT=<port> ./run.sh` (all files) or `./run.sh steps_test.ts`. This worker used project `unify-actions-366`, ports 60831-60834 and content port 3076 through a temporary `config.toml` edit that is not committed.
Browser (web): `ACTIONS_KEEP=1 ./run.sh`, export `ACTIONS_*`, then `COMPANION_TASK_STEPS_PORT=<content port> npm run test:companion-task-steps`.
Mobile real stack: `ACTIONS_API_URL=... ACTIONS_ANON_KEY=... ACTIONS_SERVICE_ROLE_KEY=... ACTIONS_DB_CONTAINER=supabase_db_<project> ACTIONS_REST_CONTAINER=supabase_rest_<project> ACTIONS_CONTENT_PORT=<port> npx jest __tests__/companionActions/companionActionsLocalStack.test.tsx`.
Mobile stand-in: `npx jest __tests__/companionActions/taskSteps.test.tsx __tests__/companionActions/taskStepSuggestions.test.tsx`. Web: `npx vitest run components/companion/tasks/TaskSteps.test.tsx`.

## Evidence (logs in `DOCS/companion-actions/evidence/366/`)

### Test order, honestly

| # | Slice | Red | Green |
|---|---|---|---|
| 1 | Backend public boundary, `steps_test.ts` (15) | `s1-red-steps.log`: 15/15 fail on the unchanged schema; 11 by assertion (`unsupported_operation`), 4 by a TypeError reading `receipt.steps` of that refusal | `s1-green-steps-run1.log`: 13/15, the 2 failures were a test-helper defect (postgres `Result` compared with `[]`), fixed in `support.ts`, no product change; `s1-green-steps.log`: 15/15 |
| 2 | Rollback, `steps_rollback_test.ts` (1) | Written after the rollback script existed (not red-first). Its first run (`s2-red-rollback-read.log` = `s2-backend-all.log`) found a real defect: after a schema rollback the deployed handler's `read` answered 500 | Handler serves tasks without `steps` when the step read function is absent: `s2-green-rollback.log` |
| 3 | rag-query `[STEP]` suggestions (3) | `rq-red-step-suggestion.log`: 3/3 by assertion | `rq-green-step-suggestion.log`: file 33/33 |
| 4 | Mobile, real local stack (2 #366 cases) | `m1-red-mobile-localstack.log`: 2/2, "Unable to find ... New step" (client contract/store edits had started, no step UI existed). The first attempt ran without `--forceExit`, held handles after its summary and was stopped by the harness at its time limit | `m1-green-mobile-localstack-run1.log`: 1/2 (a `waitFor` 1s default too short for the removal re-read; test timeout raised); `m1-green-mobile-localstack.log`: 2/2 |
| 5 | Mobile stand-in step client cases (8) | Not red-first: written after `TaskStepsSection` existed; `m2-first-run-standin.log` 8/8 | Sensitivity: `m2-mutations-standin.log`, 5 deliberate faults (remount control, blind retry, ignore failed read, remove without confirmation, title in analytics), each fails its named test; files restored |
| 6 | Mobile suggested steps (2) | `m3-red-step-suggestions.log`: 2/2, no `step-draft-card` | `m3-green-step-suggestions.log`: 2/2 (one test timing fix: wait for the second card) |
| 7 | Web mounted cases (6) | `w1-red-web-steps.log`: 6/6 fail; 4 on the missing "New step" control, 1 on the missing card, 1 because the red offline case left React Query offline (test isolation, fixed later) | After implementation 4/6 (`w1-green-web-steps-run1.log`, same isolation issue); `w1-green-web-steps.log`: 6/6 |
| 8 | Real browser (Chromium) against the real local stack (17 checks) | First run 9 passed, then stopped: three step Undo buttons had the same accessible name (a real accessibility defect) | Each Undo names its change (all locales, both platforms): `w3-browser-steps.log`/`.json` 17/17 |
| 9 | Backend deliberate faults | `s3-backend-faults.log`: 7/7 faults fail their named test (completed parent accepted, removal unconfirmed, no step revision check, step receipt as task receipt, parent not account-scoped, Undo ignores newer edit, content parent unchecked) | - |

### Selected final results (not summed across overlapping runs)

- Backend, real local GoTrue/JWT/PostgREST/Postgres 17/edge runtime: `s4-backend-all-final.log`, 10 files, 76 passed, exit 0. New for #366: 16 (15 behaviour, 1 rollback/cleanup); 60 are the accepted #361/#363 tests, whose `migrate()` now also rolls #366 down and up.
- Edge workflow, Deno 2.7.14 (CI uses v2.x): `w4-edge-deno-check.log` 21 files exit 0; `w4-edge-deno-test.log` 266 passed exit 0 (3 new rag-query tests).
- Mobile #366 cases: `m5-mobile-steps-final.log`, 3 suites, 13 passed (2 real-stack #366 cases + the #361 real-stack case on this stack, 8 stand-in, 2 suggestion). Behaviour cases 11, cleanup case 1 (account change). Focused suites before the label change: `m4-focused-suites.log` 60 suites, 623 passed, 5 skipped.
- Web: `w1-green-web-steps.log` 6/6 (cleanup: the account change part of the offline case); full `w2-web-npm-test.log` 53 files, 634 passed; `w2-web-tsc.log` exit 0; `w2-web-eslint-changed.log` 0 problems on changed app files; `w2-web-i18n.log` parity OK (2512 keys); `w2-web-build.log` exit 0. These were run before the last label-only change; the post-change reruns are in the final section.
- Browser: `w3-browser-steps.json` 17/17.
- Mobile gates: `m6-typecheck.log` exit 0; `m6-i18n.log` parity OK (1843 keys); `m6-lint.log` 0 errors, 85 warnings, none in a #366-changed file. `test:main`, `test:dst` and export: see the final section.

## Changed existing tests and fixtures

- Mobile `__tests__/companionActions/companionActionsLocalStack.test.tsx`: a new #366 `describe` (applies the #363/#366 migrations when absent, starts a content stand-in). Existing case unchanged.
- Mobile `testSupport/companionActionsServer.ts`, web `components/companion/tasks/taskActionsTestHarness.tsx`: step stand-in added; `read` also returns `steps`; `conversation_actions` also lists step drafts. No existing behaviour changed.
- Web `supabase/tests/companion-actions/support.ts`: `migrate('up'/'down')` includes #366, so the accepted rollback tests now also exercise it; step helpers and the content stand-in.
- Web `run.sh` and `supabase/config.toml`: a permanent fixture change, `[edge_runtime.secrets] COMPANION_CONTENT_QUERY_URL` from `ACTIONS_CONTENT_PORT` (default 60675). The project id and ports stay the accepted ones; this worker's 366 ports were a temporary edit, restored before every commit.
- Web `rag-query/index_companion_context_test.ts`: three tests added.

## Proof limits

- Server authorization, revisions, idempotency, receipts, rollback and isolation are proven only on the local disposable stack. No hosted schema, migration, deploy or data; no hosted Sanity read (a local stand-in answered the published-content read).
- Mobile rendering is Jest + React Native Testing Library; the real-stack cases send real HTTP with real JWTs, the others use the scripted stand-in (client behaviour only). Platform target sizes are declared styles. No device, simulator, TalkBack or VoiceOver run.
- The web browser check is one headless Chromium with the real components and hooks in a bundled fixture (not the Next.js shell or its cookie proxy, which the fixture server imitates). No Safari/Firefox, screen reader or 200% zoom.
- No live model: whether a real model writes good `[STEP <id>]` lines is unproved; the parsing and the context restriction are tested.
- Parent ordering (F1) is proven on the local stack only, with the released legacy request shapes listed below. No hosted row/lock test was run. A hosted writer that bypasses `user_tasks` triggers (`session_replication_role = replica`, bulk loads) would not take the parent lock.
- Approval context (F3) is proven on the local stack only, with the eight change kinds above. A writer that changes `companion_task_steps` outside the action service (none exists; clients have read-only RLS) would not take the parent lock.
- Steps are changed through explicit controls and reviewed suggestions. A chat command grammar for steps (for example "check step X") was not added: #363's command grammar is unchanged, and resolving a parent and step from free text needs its own clarification design.
- The mobile main Jest run keeps the known open-handle qualification (see the final section); focused runs used `--forceExit` only to end the runner after its summary.

## Final gates (after the last code change)

- Web: `w5-web-npm-test-final.log` 53 files, 634 passed, exit 0; `w5-web-tsc-final.log` exit 0; `w5-web-eslint-final.log` 0 problems on changed app files and the browser script; `w5-web-i18n-final.log` parity OK; `w5-web-build-final.log` exit 0; `w5-browser-steps-final.log`/`.json` 17/17 against the real local stack, exit 0.
- Backend: `s4-backend-all-final.log` (above), 76 passed, exit 0.
- Mobile: `m7-test-main.log` 134 suites passed (1 skipped), 1420 passed, 5 skipped; the runner then printed "Jest did not exit one second after the test run has completed" and kept running, as before #366; this worker stopped its own runner after the summary (exit 143). This is not a normal `test:ci` completion. `m7-test-dst.log` 2 suites, 13 passed, exit 0. `m7-expo-export.log` exit 0 (iOS 5698 modules, Android 5712); the export output was deleted.
- Integration tips re-read before handoff: mobile `feat/companion-actions-359` and web `feat/companion-actions-359` were still at `0d941015` / `02377a33`, the bases of both branches, so the merge was a no-op and no binding check had to be rerun.
