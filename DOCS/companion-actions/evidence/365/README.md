# #365 evidence (2026-10-27/28)

Raw outputs are under `logs/` (ANSI colour removed, JWTs replaced by `<jwt>`, gzip; `MANIFEST.txt` lists sha256, compressed and raw sizes). Browser results are under `browser/`. Proof classes are kept apart:

- **local-stack**: disposable Supabase project `unify-actions-365-r1` (API 61251, DB 61252, shadow 61253, inspector 61254; published-content stand-in port 3164), real GoTrue JWTs, PostgREST, Postgres 17 with RLS, edge runtime serving the real function source. Ports and Docker labels (`com.supabase.cli.project=unify-actions-365-r1`, workdir = this web checkout's test dir) were checked before the first write. Stopped with `--no-backup` at the end; no container or volume left.
- **in-process + local-stack**: `edit_published_test.ts` runs the same handler in the test process against the same stack, with a controlled published-content fixture (the local edge runtime cannot reach published content).
- **scripted-client**: mounted Jest (React Native Testing Library) and Vitest (jsdom) tests with the contract stand-in. Not evidence of server rules.
- **local-stack client**: mobile `companionActionsLocalStack.test.tsx`, real HTTP from the mounted mobile sheet.
- **real app (local)**: `next dev` on 127.0.0.1 against the same stack, headless Chromium (Playwright from the web checkout), disposable DB with app-only columns (`browser/app-columns.sql`, never committed).
- **bundle**: Hermes export for iOS and Android.
- Not run: hosted, device or simulator, store binary, screen reader, live model, live Sanity.

## Candidate history

1. Built on integration `1597c2c5` (mobile) and `ca144e86` (web): commits `32404e03` (mobile) and `3724dca` (web).
2. During the run, accepted #366 was integrated (`30fa639d` mobile, `0f6b820` web). Both were merged into the candidates (`1a4dece6`, `1fd36b5`). #366 replaces the same shared action functions; the #365 migration was rebuilt so each replaced function is the #366 body plus the #365 lines (3-way merge with #363 as base; two kind lists and two marked insertions resolved by hand), its rollback restores the #366 bodies, and direct commands are now limited in SQL to `task.create_custom`, `task.edit_details` and `task.set_state`. Clients reuse #366's Checklist title hook. Every gate below marked **merged** ran on the merged trees.

## Backend slices (test-first unless marked)

| Slice | Falsifier | Red | Green |
|---|---|---|---|
| s1/s2 edit drafts, stale approvals (`edit_test.ts`, 9) | preparing writes; two approvals both write; a newer edit of a touched field applies the old approval; an unrelated change forces reapproval | `s1s2-red-edit` 9/9 fail: 4 by assertion (`unsupported_operation`, `expected_revision_required`), 5 by TypeError reading the draft that the refused prepare did not return (missing behaviour, not setup) | `s1s2-green-edit` 9/9 |
| s3 clear edit commands (`edit_command_test.ts`, 5) | a command resolves to another task/field, writes twice, guesses an ambiguous or unread target | `s3-red-commands` 5/5 by assertion (`kind: none`) | `s3-green-commands` 5/5, #363 command suite 7/7 |
| s3b clarify reasons split (`value_too_long`, `multiple_changes`) | — | changed with the implementation (expectations edited in the same step; not red-first) | `s3b-clarify-reasons` |
| s3 replay of a committed rename | the retry is refused or writes again | written after the code | in `s3b` and later runs |
| s3c priority labels of both apps (`edit_command_test.ts`) | a label shown on either platform is not understood | written after the grammar | `s3c-priority-labels`; bound by mutation `commands_mobile_labels_only` |
| s3d database single use of a command message | a second operation under a used message writes | written after the code (the handler pre-check and revision/same-title checks shadow it over HTTP) | `s3d-single-use-green`; bound by mutation `command_reusable` |
| s4 Undo (`edit_undo_test.ts`, 3) | Undo changes another field, overwrites a newer edit, applies twice | `s4-red-undo` 2/3 by assertion; the state-command Undo test passed on its first run (inherited #361 path; not counted as red) | `s4-green-undo` 3/3 |
| s5 published targets (`edit_published_test.ts`, 5, in-process) | a published task is not found by its shown title, its shared fields are edited, a task the Checklist does not show is drafted, unread content resolves a command | written after the code (paths built with s1/s3): `s5-published-first-run` 5/5 | bound by mutations `handler_edits_shared_content`, `handler_drafts_any_published_id`, `handler_names_task_from_partial_list` |
| s6 rollback (`edit_rollback_test.ts`, 2) | rollback loses saved edits, misapplies edit work, re-application reuses an old approval or loses Undo | `s6-red-rollback`: test 1 by assertion; test 2 failed by schema-cache timeout (setup, unresolved, not counted) | `s6-green-rollback` 2/2. The first green attempt (`s6-first-green-attempt-wrong-expectation`) showed my test was wrong: after a full re-application every revision moves on (#361 rule), so Undo must conflict and offer review; the test was corrected, not the product |
| rag-query `[EDIT]` suggestion (2 tests) | a tag stays in the answer; a suggestion for an unshown task, a shared field or any other shape reaches the client | `rq-red-edit-suggestion` 2/2 by assertion | `rq-green-edit-suggestion` 32/32 file; merged `rq-after-merge` 35/35; one-off mutation (drop the shown-task check) red: `rq-mutation-shown-tasks` |

Full backend suite: pre-merge `backend-all-final` 13 files, 87 passed; **merged** `merged-backend-all-1` 17 files, 137 passed, 0 failed (includes #366's step suites on top of the #365 migration).

Mutation check (`supabase/tests/companion-actions/mutation_check.py`): #365 replaces the shared functions, so nine #361/#363 mutations were retargeted to the #365 migration and two handler anchors updated (otherwise they would silently survive). Pre-merge run `backend-mutations`: 27 of 29 RED; `command_reusable` SURVIVED (see s3d) and `handler_drafts_any_published_id` was UNRESOLVED (the mutation itself crashed the handler; rewritten to accept any id). Re-runs `backend-mutations-rerun*`: both RED. **Merged** `merged-mutations`: the 20 mutations of functions the merge rebuilt, 20 of 20 RED.

## Clients

| Check | Result | Class |
|---|---|---|
| Mobile `taskEdit.test.tsx` (5) | written after the UI; baseline with integration production code: 5/5 fail by assertion (`m1-baseline-red`); green 5/5 (`m1-green`) | scripted-client |
| Web `TaskEdit.test.tsx` (5) | written after the UI; baseline 5/5 fail by assertion (`w1-baseline-red`); green 5/5 (`w1-green`), includes the allowlisted analytics event | scripted-client |
| Mobile real stack, new case | pre-merge 2/2 (`m3-local-stack-final`); **merged** 4/4 with #366's step cases (`merged-mobile-local-stack`), natural exit, `ACTIONS_DB_CONTAINER/REST_CONTAINER` set to this project | local-stack client |
| Mobile `npm run test:ci` | pre-merge 1417 passed, 4 skipped + DST 13; **merged** 1447 passed, 6 skipped (real-stack suite without env) + DST 13; exit 0, no forceExit | scripted-client |
| Mobile typecheck, i18n parity (1888 keys merged), lint | exit 0; lint 0 errors, 85 warnings, none in a changed file | — |
| Mobile `expo export` iOS + Android | **merged** exit 0 (iOS 5641, Android 5712 modules); both bundles contain `Save this change` and `task.edit_details` | bundle |
| Web `npm test` | pre-merge 54 files, 640; **merged** 55 files, 669; exit 0 | scripted-client |
| Web tsc, i18n parity (2557 keys merged), `npm run build` (41 pages) | exit 0 | — |
| Web full lint (generated run.sh copy excluded) | pre-merge 12 errors, 7/1/4, equal to the base; **merged** 21 errors (context_rls 7, steps_parent_race 7, rollback 1, support 6) = the 21 recorded at the accepted #366 integration; no new error, 0 warnings. Changed-file lint: only support.ts's pre-existing errors | — |
| Edge workflow (local Deno 2.7.14) | **merged** `deno check` 21 files exit 0; `deno test supabase/functions/` 268 passed | — |

## Real app in a browser (`browser/`)

`check.cjs` (run three times: before a fix, after it, and on the merged tree; results kept). Merged run (`browser-results-merged.json`):

- Draft card "Suggested change · Get a phone plan · Priority: Do now · Draft · not saved yet · Review". Keyboard: Review + Enter opens dialog "Review change", focus on its heading; text "Now: Do soon / After you save: Do now"; Escape closes and focus returns to Review; the composer keeps "My next question".
- Approve by keyboard, Enter pressed twice: the row is `Do now` at revision 2 (one write); receipt "Changed in Checklist: Get a phone plan / Priority: Do soon → Do now"; composer still holds the typed text; card shows "Saved in Checklist".
- Command typed in the real composer `Rename task "Get a phone plan" to "Get a prepaid plan"`: card "Changed in Checklist: Get a prepaid plan / Title: “Get a phone plan” → “Get a prepaid plan”"; row title changed (revision 3); the Checklist page shows the new title and not the old one. Model requests (`/api/companion`, blocked and counted): 0.
- Contrast: Save button 18.06:1, "Now:" line 7.23:1. Targets: Save 147×40, Not now 90×40, Review 75×44 (WCAG 2.2 AA 24 px met; below 44 px for the two drawer buttons, as in #363).
- Arabic at 390×844 (user language saved as `ar`, reduced motion on): `dir=rtl`, Arabic card and receipt (`الأولوية: افعله قريبًا ← افعله الآن`), drawer full width (0–390), no horizontal overflow. Screenshot `narrow-arabic-review.png`.
- Found and fixed during this check: an applied draft still labelled its reviewed-against value "Now:". Open drafts only now show the review rows; a saved draft shows its receipt (both platforms; run 1 vs run 2 files).
- Console: a dev-mode hydration warning in `CompanionTasksEntry` (#361, "Loading task progress…" vs the loaded summary) on both runs; not caused by #365. The first visit's "what's new" tour was dismissed with Skip. Missing Sanity configuration means the Checklist shows only custom tasks in this setup.

## Supabase documentation

Read before local writes: the installed Supabase skill, CLI 2.118.0 help (`start`, `db reset`, `migration new`; the migration file name came from `supabase migration new`), and `https://supabase.com/changelog.md` on 2026-10-27 (`supabase-docs/changelog-2026-10-27.md.gz`). No breaking change after the #363 capture affects these local writes (new: TLS 1.2 cipher removal on hosted APIs, Knowledge Base).

## Changed existing tests and test support

- Web `supabase/tests/companion-actions/support.ts`: applies #365 after #366; `migrate363('down')` and `migrate366('down')` roll #365 back first; schema-cache states for #365. No assertion changed.
- Web `run.sh`: copies `rag-query/lib` next to the function (the task lister imports it).
- Web `mutation_check.py`: nine mechanisms retargeted to the #365 migration, two handler anchors, one anchor after the #366 merge; ten #365 mutations added; `command_reusable` points at the new database-level test.
- Web `taskActionsTestHarness.tsx`, mobile `testSupport/companionActionsServer.ts`: edit actions added; drafts carry their kind; custom tasks carry priority/description. No existing assertion changed.
- Mobile `companionActionsLocalStack.test.tsx`: setup applies #361, #363, #366, #365 in order when missing; new #365 case. No existing assertion changed.
- rag-query `index_companion_context_test.ts`: two tests appended.
- `edit_rollback_test.ts` test 2: my own wrong expectation corrected before it ever passed (see s6).

## Limits

Hosted schema, deploy, gateway, PostgREST cache and isolation are not proven (no hosted write). No live model writes `[EDIT]` lines here (stubbed rag-query harness). Published-title resolution is proven in process with a fixture, not through the edge runtime. Custom titles longer than 160 characters cannot be named by a command (the shared context read clamps titles; the command then asks, never guesses). Native: no simulator, device, VoiceOver, TalkBack, Dynamic Type or keyboard behaviour; touch targets are declared styles. Browser: one Chromium; no Safari, screen reader or 200% zoom. Local Deno 2.7.14, not CI's 2.x.
