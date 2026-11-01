# #363 corrections, round 1

Corrections of the four confirmed #363 review findings: Standards S363-1 (the same
defect as SPEC F2), Standards S363-2, SPEC F1 and SPEC F3. Reports:
`review-363-STANDARDS-r1.md` and `review-363-SPEC-r1.md` (root handoff directory).
Both original candidates (mobile `76b64832`, web `e895c9b`) were left unchanged; work
was done on own branches started from them. This record is evidence, not acceptance:
both reviews run again on the corrected candidates.

## Findings and what changed

| Finding | Behavior now | Code |
| --- | --- | --- |
| S363-1 / F2 (P2, both clients): a late Save title or Not now reply recreated the removed private draft cache of the previous account | Each intent is bound to the account and session (epoch) the panel shows, from the same snapshot its client is bound to. After the reply, nothing (cache, panel state, typed-title draft, the store's approval state) is written unless that session is still the signed-in one. A same-account token refresh keeps the reply; another account, a sign-out, and sign-out followed by the same account signing in again do not. Panel request state carries its owner, so a refusal or busy state never shows for another session. | mobile and web `TaskProposalPanel.tsx`, `useTaskActionClient` (now returns the client together with its owner) |
| (found while fixing F2, web only) the open review panel read the old account's draft id as the new account, and again in the same account's next session | The web page closes the drawer only once the new account's profile query loads, which lags the auth account the panel reads. The panel now keeps the account and session it was opened in; for any other one it shows nothing and makes no draft read. Mobile closes the sheet from the same account snapshot, so this did not occur there (its test asserts no entry for B). | web `TaskProposalPanel.tsx` |
| S363-2 (P2, web): command "Adding …" and draft "Checking …" showed at once | Saving and checking states use the shared `loading-delayed` utility (300ms wait, fade dropped under reduced motion). The status role and text are in the page from the start. Pending/lookup-failed/not-applied, receipts and refusals still show at once. No new timing API or CSS. | web `TaskActionCards.tsx` |
| F1 (P2, both clients): Retry after an unsaved title edit created the earlier title | Retry is offered only while the draft shows the reviewed title (unsaved edits disable it; putting the title back enables it). Retry keeps the original operation identity and payload. After a confirmed "not applied", a changed title can be saved: that makes a new revision, drops the not-applied approval (`supersedeNotApplied`, never for an unknown outcome) and needs a new approval, which is a new operation. While the outcome is unknown (pending, lookup failed) only Check again is allowed: no Retry, no Save title, no approval. | both `TaskProposalPanel.tsx`, both `taskActionStore.ts` |
| F3 (P2, both migration mirrors): a creation receipt's title followed later renames | `companion_apply_one` records the authorized title in the private receipt outcome (`task.create_custom`: the approved/commanded operation's title; `task.remove_created`: the task's title when it was removed). `companion_receipt_summary` returns that recorded title; it no longer reads the current task. `current`, identity, revisions, Undo and access policy are unchanged; the outcome stays in the RLS-locked receipt table reached only through the existing security-definer functions. Mobile migration and web mirror are byte-identical. The rollback script is unchanged (it restores the #361 functions, which have no create summary). | `supabase/migrations/20261026165156_companion_task_create.sql` (both repos) |

## Call path, owner and guard map (changed #363 client paths)

M = mobile, W = web. "Owner" is the account and epoch the work belongs to.

| Path | Owner captured | Checked before | Status |
| --- | --- | --- | --- |
| Send: save user message, `interpret`, clarify message, direct-command apply, AI answer, `prepare` (M `useSendMessage`, W `useCompanion.useSendMessage`) | at send, `ownAccountWork()`; client bound to it | every later request and result (`ensureOwned`), invalidations keyed by the owner; W `onSuccess` checks `stillOwned` | unchanged; guarded (#361 pattern) |
| Draft review Save title / Not now (`revise`/`cancel`) | at the intent, the panel's bound client owner | the transport before sending; after the reply: cache write, panel state, typed-title draft, `supersedeNotApplied` | **fixed** (S363-1/F2) |
| Draft read `useTaskProposal`, conversation cards `useConversationActions` | in the query function, compared with the keyed account | before the request; entries are keyed by account, and the account scope cancels and removes every other account's entries | unchanged; W panel now makes no draft read for another session (**fixed**) |
| Approve, command apply, status lookup, Retry, Check again, Undo, reviewed removal (store) | the account store, its client bound to account and epoch | the transport before each request; a store is per account and is dropped from the registry on account change | unchanged. A late reply lands in the dropped store, which nothing reads. Its `onChanged` still invalidates (re-reads, no data write) and `onResult` still sends a content-free analytics event; not changed (#361 behavior) |
| Retry eligibility in the draft panel | n/a | shown title equals the reviewed title, no request in flight | **fixed** (F1) |
| Undo confirmation (`ReceiptBlock`) | local confirm state, then the store path above | as the store | unchanged |
| Receipt text (server) | n/a | recorded at apply | **fixed** (F3) |

Unknown ownership: a panel without an established account has no bound client, so
its controls are off and nothing is sent; the web panel opened without one renders
nothing. Proposal reads check the owner before the request, as in #361.

## Red and green

Each red ran on the unchanged original code (or, where stated, with only the new
guard removed) and failed at its behavior assertion. Logs and JSON are in this
directory.

| Slice | Red | Green |
| --- | --- | --- |
| Mobile late Save title / Not now (`taskCreate.test.tsx`, "late Save title …") | `mobile-red.*`: 6 fail (revise and cancel × another account, sign-out, sign-out then same account), 3 controls pass (token refresh × 2, late refusal shown) | `mobile-green-taskCreate.*`: 21/21 |
| Mobile Retry (`taskCreate.test.tsx`, "Retry of an approved draft …") | `mobile-f1-red.*`: 3 fail; the "title put back → same-operation Retry" control passes | same run: 21/21 |
| Web late Save title / Not now and Retry (`TaskCreate.test.tsx`) | `web-red.*`: 6 + 3 fail; 4 controls pass | `web-green.*`: 31/31 (22 permanent + 9 reviewer copies) |
| Web panel session binding | `web-session-binding-red.*` (callback guard in place, only the new session binding removed): 4 fail (another account: a draft read and entry as B; sign-out then same account: a new-session draft read and entry) | `web-green.*` |
| Web loading delay (`scripts/verify-companion-task-loading.mjs`, `npm run test:companion-task-loading`) | `web-loading-red.*`: 4 fail (command "Adding …" and draft "Checking …", normal and reduced motion: opacity 1, no animation), 12 pass, including the simultaneous `loading-delayed` control (opacity 0, `loading-appear` 0.3s) | `web-loading-green.*`: 16/16 |
| Historical receipt (`supabase/tests/companion-actions/receipt_history_test.ts`) | `f3-red-backend.log`: reviewer's exact `review363_history_test.ts` fails at its title assertion (`Find a family doctor` ≠ `Set up phone service`, `current:false`); 3 permanent cases fail at the title assertions (approved, command, removal after a later change) | `f3-green-backend.log`: 1/1 + 3/3; `backend-all-after-f3.log`: all 8 files, 60/60 |

Reviewer reproductions (exact copies, run in this tree, then removed):

- Standards mobile `mobile-ownership.test.tsx` and SPEC mobile `review363Spec.test.tsx` on the corrected code: `mobile-reviewer-repros-green.*` 8 of 9 pass; the SPEC same-account refresh control failed once at its setup step (`Task title` not yet rendered, the file does not wait for the draft to load). Rerun of the SPEC file alone, twice on the original panel/hook/store sources and twice on the corrected ones: original 2 fail (F1, switch) and refresh passes both times; corrected 3/3 both times. The single failure was a load-timing flake, not a behavior assertion.
- Standards web `ownership.test.tsx` and SPEC web `review363Spec.test.tsx` on the unchanged original web code: `web-reviewer-repros-red.*` 6 fail at their final assertions (4 Standards cache cases, SPEC switch, SPEC Retry), 3 same-account controls pass. On the corrected code: all pass (`web-green.*`).

TDD order: the client and server tests above were written and run red before each
change. The web session binding was found during the F2 green step; its red was
recorded by removing only that guard, after the fact.

## Final gates (corrected code)

- Mobile: `__tests__/companionActions` and `__tests__/companion` (17 suites) 213 pass, 1 skipped (local-stack suite), 0 fail (`mobile-focused-final.*`). Jest still keeps open handles after the summary; the runs were stopped after it (timeout exit 124, or SIGTERM 143 for the final focused run); that is not normal `test:ci` completion. Main and DST suites were not rerun: no shared code outside these paths changed. Types (`tsc`) pass; lint 0 errors, 85 warnings (unchanged count); i18n parity OK (no new keys).
- Web: `npm test` 52 files, 628 tests pass; `npm run build` passes; `tsc` passes; `check-i18n` OK; `eslint` 12 errors, the same pre-existing test-file errors (`supabase/probes/companion-context-362`, `supabase/tests/companion-actions/rollback_test.ts`, `support.ts`), none in changed files.
- Backend: own disposable stack `unify-actions-363-corrections` on 127.0.0.1:60711-60714 (ports inspected first; the test config was changed locally and restored, not committed), hosted-shape baseline, synthetic accounts; real GoTrue/JWT/PostgREST/Postgres/edge runtime; 60/60. Supabase CLI 2.118.0. Current changelog and local-development, functions and API-security docs read first (`supabase-docs/`); the 2026-09-25 Postgres minor-release notice concerns ltree/pgcrypto/btree_gist/custom operators, none used here. Stack stopped and removed afterwards; the implementer's `unify-actions-363` and the #361 stack were not touched.

## Not changed, and limits

- Web `PhaseMessage` (shared with #361 task controls) still shows "Saving…/Checking…" at once inside the draft panel after approval. S363-2 named the cards; this shared #361 component was left for the reviewers to decide.
- Late store replies after an account change still run `onChanged` invalidations and the content-free `onResult` analytics event (see the map). No cache data is written by them.
- The web loading check is one headless Chromium on a component fixture (actual cards, store, phase hook, CSS and translations; stand-in action client). No Next.js routing, Safari/Firefox, or screen-reader timing.
- T3 Preview, same fixture served with `COMPANION_TASK_LOADING_SERVE=1` on 127.0.0.1:3049 (corrected code, background tab, `visibilityState: visible`): right after `fixture.start()` the control, "Adding …" and "Checking …" all had opacity 0 with `loading-appear 0.3s`, the draft title opacity 1; after `finish()` the receipt showed at opacity 1. 700ms later the control was still at opacity 0 as well, so that background tab did not advance animations; the "appears after the delay" step is proven only by the headless run. Tab closed, server stopped.
- Mobile proof is rendered Jest with a scripted endpoint; no device, simulator or screen reader. No hosted schema, migration, deploy or live provider was used.
- Receipts already recorded before this migration change carry no title; the migration is unpublished, so none exist outside disposable stacks.
