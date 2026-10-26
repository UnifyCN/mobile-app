# #363 Add one task through Companion: mobile and web

Spec: UnifyCN/mobile-app#359. Ticket: #363. Builds on #360 (contract), #361 (task actions) and #362 (context). Date: 2026-10-26.

A newcomer asks Companion for a missing settlement task (fixture: phone service for a fictional Vancouver arrival). The answer may suggest one task. The client asks the action service for a server-owned draft; the conversation shows it as a draft card ("Draft · not in your Checklist yet"). Review opens the direction B container (mobile bottom sheet, web overlay drawer) with the exact title, priority, the profile values it was prepared against and any task with the same title. Approval of the shown revision adds exactly one shared custom task and shows its receipt with revision-checked Undo. A clear direct command in the user's own message ("Add task: <title>", one phrasing per supported language) adds exactly its task with no model request; an unclear one gets a question and writes nothing. Plans, steps, reminders, saved personal details, job UI and any external submission stay out of scope.

## What ships

| Part | Where | Notes |
|---|---|---|
| Migration | `unify-front-end/supabase/migrations/20261026165156_companion_task_create.sql` (this repo, authority), web `supabase/migrations/` byte-identical, sha256 `ed5c218e...3651a7` | Additive on #361. Proposal kind/context/source/review reason/previous context columns, `companion_command_uses` (one write per command message), `task.create_custom` and `task.remove_created` in the registry. Gate still ships off. |
| Rollback | `unify-front-end/supabase/rollbacks/20261026165156_companion_task_create.down.sql`, mirrored, sha256 `8d9b3690...35cf332` | Run before the #361 rollback. #361 controls keep working; requests #363 cannot serve are refused, never misapplied; re-application marks restored drafts `restored` so they need review again. |
| Endpoint | web `supabase/functions/companion-actions` (`commands.ts`, `contract.ts`, `handler.ts`) | New actions `interpret`, `prepare`, `proposal`, `revise`, `cancel`, `conversation_actions`; `apply` accepts `approved_proposal` bound to proposal id + revision + exact operation hash, and `direct_command` bound to the caller's own saved user message. Account from the JWT only. Never calls rag-query, a model or the generation allowance. |
| Suggestion | web `supabase/functions/rag-query/lib/actions/proposals.ts` | Typed registry. The model may write one `[TASK]: <title>` line; it is stripped from the answer and returned as `actionProposal {type, version, title}` (plain text, 3-120 chars, one only). rag-query writes nothing and builds no authorization. |
| Clients | mobile `services/companionActions/*`, `hooks/companion/useTaskActions.ts`, `hooks/companion/useSendMessage.ts`; web `lib/companionActions/*`, `hooks/useTaskActions.ts`, `hooks/useCompanion.ts` (mirrors) | Contract v1 additions, store `applyOperation` with keys `proposal:<id>` / `command:<message id>`, removal only with explicit confirmation. `saveMessage` returns the saved id on both platforms. |
| Mobile UI | `components/companion/tasks/TaskActionCards.tsx`, `TaskProposalPanel.tsx`, `ReceiptBlock.tsx`; `TaskActionsSheet.tsx` opens on a draft or one task | Cards under their message in the conversation list; dashed edge for an unsaved draft. |
| Web UI | `components/companion/tasks/TaskActionCards.tsx`, `TaskProposalPanel.tsx`, `ReceiptBlock.tsx`; `TaskActionsDrawer.tsx` | Same behaviour in the overlay drawer (full width when narrow). |
| Telemetry | `companion_action_result` | New actions `approve_create`, `command_create`, outcome `needs_review`, `operation_type` `task.create_custom`. Allowlisted; never a title, message or reference. |
| i18n | `taskCreate.*` (46 keys) in ar, en, es, fr-CA, hi, pa, vi on both platforms | Real translations. The taught command example in each locale is a server test case. |

### Behaviour rules (tested)

- Nothing is written before approval. Approval binds to the displayed revision and the exact resolved operation. An unsaved title edit cannot be approved; a saved edit makes a new revision that needs review. A relevant profile or same-title-task change since review answers `needs_review` with the refreshed revision and writes nothing; unrelated changes do not. Relevant context is compared with the actual records, not a timestamp.
- One operation id per intent; repeated taps, concurrent retries and competing approval ids add one task. A lost reply is looked up first; `pending` and `lookup failed` never write; `not applied` retries the same id.
- Undo of an added task asks first (Keep sends nothing). Its removal is revision-checked: after a newer edit nothing is removed and a reviewed removal at the current revision is offered.
- Draft and command caches are keyed by account and removed on account change or sign-out; a late prepare reply reaches no screen. Mobile closes an open draft or task view on account change (the task list stays and reads the new account).
- At the AI limit, existing drafts can still be approved; no model request is made by any action.

## How to run

Backend (web repo, own disposable stack `unify-actions-363`, ports 60671-60674): `supabase/tests/companion-actions/run.sh` (all files) or `run.sh create_test.ts`. Mutation check: `python3 supabase/tests/companion-actions/mutation_check.py`.
Edge workflow (web): both steps of `.github/workflows/edge-functions.yml` with Deno 2.9.8.
Mobile: `npx jest __tests__/companionActions/taskCreate.test.tsx --watchAll=false`; gates `npm run lint`, `typecheck`, `check-i18n`, `test:main`, `test:dst`, `npx expo export --platform ios --platform android`.
Web: `npx vitest run components/companion/tasks/TaskCreate.test.tsx`; gates `npm test`, `npx tsc --noEmit`, `npm run check-i18n`, `npx eslint`, `npm run build`.

## Evidence

Logs: `DOCS/companion-actions/evidence/363/`. CI-after-#361 main merges and corrections are separate commits, recorded in `evidence/ci-after-361-2026-10-26.md`.

### Test-first slices (backend, web repo local stack)

| Slice | Red | Green |
|---|---|---|
| s1 prepare and approve | `s1-red-prepare-approve.log` (tests fail: actions missing) | `s1-green-prepare-approve.log` |
| s2 retries, lost reply, held lock | passed on first run: inherited from the #361 executor (`s2-first-run-pass-inherited.log`). Not counted as red. | same |
| s3 review context, edits | `s3-red-review-context.log` | `s3-green-review-context.log` |
| s4 direct command | `s4-red-direct-command.log` | `s4-green-direct-command.log` |
| s5 Undo of an added task | `s5-red.log` | `s5-green.log`, `s5-green2.log` |
| s6 cross-account, forged, allowance | `s6-red.log` | `s6-green.log` |
| s7 conversation reads | `s7-red.log` | `s7-green.log` |
| s8 rollback and re-application | `s8-red.log` | `s8-green.log` |
| rag-query suggestion | `rq-red-task-suggestion.log` (2 fail) | `rq-green-task-suggestion.log` |

Backend mutation check: 19 of 20 mutations red at first (`backend-mutations.log`); `removal_of_any_task` survived, a forged-removal case was added to `create_test.ts` and the rerun is red (`backend-mutation-rerun-removal.log`).

Per-locale command examples (`command_test.ts`, "the command phrasing taught in each supported language adds exactly its task"): added after the parser existed, so it is a boundary check, not a red-first test. 1 passed on 2026-10-26.

Full local suite on the final web tree (`w-backend-all-final.log`): 7 files, 56 passed, 0 failed (actions 4, boundary 11, command 7, create_rollback 3, create 17, rollback 6, undo 8), exit 0.

### Mobile client (this round)

- Red first: `m1-red-mobile-acceptance.log`, 8 of 8 fail on missing behaviour (no draft card, no command result), no crash.
- Green: `m1-green-mobile-acceptance.log`, 8 of 8.
- Binding: `m1-mutations-mobile-acceptance.log`. Allowing approval of an unsaved title edit fails the edit test; ignoring an interpreted command fails the command test. Both files restored.
- Focused suites: before the stand-in update 17 failures in 4 suites (`m2-focused-before-standin-update.log`): three SDK stand-ins modelled `insert()` without `.select().single()`, and the account-change reset closed the open task list that a #361 test keeps open. The product now closes only draft and task views; the stand-ins answer the new call shape. After: 4 suites, 35 tests passed (`m2-focused-after-standin-update.log`).
- `test:main`: 132 suites, 1397 passed, 3 skipped (`m3-test-main.log`). The runner then held open handles ("Jest did not exit"), as before #363; I stopped my own runner after the summary. This is not reported as a normal `test:ci` exit.
- `test:dst`: 2 suites, 13 passed, exit 0 (`m3-test-dst.log`).
- `npm run lint` exit 0, 0 errors (warnings at the existing level; new-code array-type warnings fixed). `typecheck` exit 0. `check-i18n` parity OK. `npx expo export --platform ios --platform android` exit 0 (iOS 5575 modules, Android 5709).

### Web client (this round)

- `TaskCreate.test.tsx` 9 of 9. Full `vitest run`: 52 files, 615 passed. Four existing analytics tests first failed because their `saveMessage` stub returned `undefined`; the real service returns the saved row, which the send now reads. The stub now returns a row; no assertion changed.
- `tsc --noEmit` exit 0; `check-i18n` parity OK (2456 keys); `npm run build` exit 0.
- `eslint`: 12 errors, all `no-explicit-any` in #361/#362 test files, the same count as the integration tip `8324a58` (checked file by file); new #363 tests are typed. The web CI has no lint job.
- Edge workflow, Deno 2.9.8: `deno check` of 21 files exit 0; `deno test` 263 passed, 0 failed.

### Real web app in a browser (T3 Preview, Chromium)

`next dev` on 127.0.0.1:3033 against the own local stack, with both migrations and the gate on. A fixture account (Vancouver profile) and a draft were prepared through the public `prepare` action. The disposable database got app-only columns the test baseline lacks (`conversations.updated_at`, `messages.sources`, `users` profile columns) so the app could load; nothing of that is committed.

- The seeded conversation shows the draft card "Suggested task · Set up phone service · Draft · not in your Checklist yet · Review".
- Keyboard: Review focused, Enter opens the dialog "Review new task" with focus on its heading; Escape closes it and focus returns to Review.
- Drawer content: title input `Set up phone service`, "Priority: Do soon", City, Province, "Arrival date: November 2, 2026".
- Contrast (computed colour over composited background): lowest 5.84:1 (hint text, Close); approve 18.06:1. Targets: Close 44x44, approve 185x40, Not now 90x40, Save title 79x32 (WCAG 2.2 AA 24px met; below 44px).
- 390x844: drawer full width (0, 390), no horizontal overflow. Approve by keyboard, Enter pressed twice: the database holds exactly one `Set up phone service` (`Do soon`).
- Undo by keyboard opens the confirmation; Keep sends nothing and Undo returns. After the Undo button is replaced by the confirmation, focus moves to the task heading inside the dialog (not to Remove/Keep).
- Arabic: `dir=rtl`, Arabic copy and date, Undo aligned to the start edge, drawer full width, no overflow.
- Direct command typed in the real composer, "Add task: Buy a transit pass": the card shows "Added to Checklist: Buy a transit pass"; the database has the task and no assistant message; rag-query was not called.
- Screenshots were not captured: the preview snapshot timed out in the background tab.

## Changed existing tests

- Mobile `accountOwnershipReadFallback`, `accountOwnershipStages`, `companionContext.acceptance`: SDK stand-ins answer `insert(...).select('id').single()`. No assertion changed.
- Mobile `testSupport/companionActionsServer.ts`: #363 stand-in actions (port of the web harness).
- Web `useCompanion.analytics.test.ts`: `saveMessage` stub returns the saved row.
- Web `command_test.ts`, `create_test.ts`, `create_rollback_test.ts`: callback parameters typed instead of `any`.

## Proof limits

- Server authorization, revisions, idempotency, receipts and rollback are proven only against the local disposable stack (real GoTrue, PostgREST, Postgres and edge runtime). No hosted schema, migration, deploy or data.
- No live model: the suggestion path is proven with the stubbed rag-query harness and the scripted mobile stream. Whether a real model writes the `[TASK]` line well is unproved.
- Mobile rendering is Jest with React Native Testing Library and a scripted endpoint; Android 48dp and iOS 44pt targets are declared styles. No device, simulator, TalkBack or VoiceOver run.
- The web browser check is one Chromium session; no Safari, real screen reader or 200% zoom.
- The mobile suite still holds open handles after its summary (pre-existing).
- Web `services/companion.ts` and `ChatPanel.tsx` carry formatter-only line changes next to the #363 edits.
