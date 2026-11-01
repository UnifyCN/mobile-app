# Composition of #365 and #370

The pending #370 migration now preserves accepted #365 task edits and waiting-reason receipts. Its rollback restores the accepted functions and proposal kinds. This is an implementation handoff for review. It does not accept either ticket or qualify a native release.

## Source and ownership

Mobile: `/Users/savargupta/.t3/worktrees/Unify/t3-6a798481`, branch `t3/companion-compose-365-370`.
Web: `/tmp/unify-review-actions-361-web-r5-deno-base-9d05`, branch `feat/companion-compose-365-370-r1`.

The implementation commits remain mobile `2a5dc03557621a3f760074c58f0e1f81e49b6116` and web `d859fbf913e923f960a16562abd556723d67b0ec`. This continuation changed documentation and evidence only. `pins-precommit.json` records those source trees, full status, and ancestry. `pins-final.json` records the final candidate heads and trees after the evidence commit.

Accepted mobile `68984d18c534cb870b1d2f41a8fe823625017976` and reviewed #370 mobile `44936f9cd233512876cc873be675fb74d0845dcd` are ancestors. Accepted web `21df0701f12f99b5d1dd8af246fa4b5f8acb41ae` and reviewed #370 web `05ab5299deeea43eee892e11ef1e98ff31f16d8b` are ancestors. The accepted integration tips were read again before return. Neither changed. No #367 or pending native correction was imported.

The local brief and account addendum have CONSUMED markers. Their canonical files remain unchanged. This continuation used the required Unify Codex account. It started no child and changed no provider or model. The implement-spec, TDD, Supabase, Playwright, and writing skills supplied the applicable procedures. The explicit ownership instructions prohibit their delegation and PR steps.

## Migration and rollback

Application order is #361, #363, #364, #366, #365, #370. Rollback uses the reverse order. Migration identities did not change.

| Shared function | Accepted rollback source | Composed behavior |
| --- | --- | --- |
| `companion_validate_operations` | #365 | Keep task edits and add detail validation. |
| `companion_check_authorization` | #365 | Keep exact edit authorization and add detail authorization. |
| `companion_apply_one` | #365 | Keep task edits and add detail dispatch. |
| `companion_receipt_summary` | #365 | Keep before/after fields and waiting reasons; add detail receipts. |
| `companion_undo_action` | #365 | Keep edit inverses and add detail Undo. |
| `companion_cancel_proposal` | #365 | Keep edit draft cancellation and add detail cancellation. |
| `companion_conversation_actions` | #365 | Keep edit drafts/results and add detail drafts/results. |
| `companion_prepare_proposal` | #366 | Add detail proposal preparation. |
| `companion_revise_proposal` | #366 | Add detail proposal revision. |
| `companion_recheck_proposal` | #366 | Add detail revision checks. |
| `companion_proposal_context` | #366 | Add detail context. |

`function-rollback-ledger.json` records all 11 functions and all 12 migration/rollback mirror hashes. All rollback function bodies match their accepted sources. The original #366 declaration of `companion_proposal_context` uses `create function`; its rollback uses `create or replace function`. A first literal statement comparison rejected that header difference. The final comparison normalizes only that declaration. The runtime schema comparison separately checks function definitions, grants, and proposal kinds.

The #370 migration SHA-256 is `26772c2725b95d7b0bc2c9e323bcc36ddcd626e0f606d89931899adab2d97374`. Its rollback SHA-256 is `a6b12f3df40a3b16233ad88640b9daa59852c3ef585ea0bb6ec7ef191fcf7df6`. Mobile and web files are byte-identical. The proposal constraint retains `task_edit` and adds `detail_create`.

`continuation-locale-union.log` checks every leaf key and value against both parents for all seven locale files on each client. There are no mismatches. This check proves the union. It does not repeat the earlier semantic translation review.

## Test order and failures

The primary test boundary was already authorized: authenticated action requests and persisted outcomes, with small mounted client cases. The checks state their rejection conditions in source comments. The service composition checks were written at the text-merge state before the migration correction. Web commit `4f28b14` records them before fix `1a020e9`. Mobile fix `2a5dc035` records the same SQL correction.

`red-backend-merge-state.log` and its readable copy retain the original failures. `red-backend-merge-state-2.log` follows a fixture correction from two step titles to one. Missing task-edit validation, invalid authorization, and rollback schema differences produced assertions. `red-mobile-localstack-merge-state.log` retains one rendered real-service failure with five other cases passing. These checks preceded the SQL correction. The mounted scripted composition cases are post-merge regression checks. They do not prove a product correction followed a red test.

The first green service attempt had two incorrect expectations: removing Undo needs confirmation before conflict evaluation, and a plan read contains live task revisions. The next run passed after those expectations were corrected. A later helper change added a direct assertion on the remember response. The final ordered suite first failed in the #366 rollback test because a mocked cache wait skipped a prerequisite rollback. Web commit `d859fbf` corrects that test order. The final suite passed naturally with exit 0. All earlier raw logs remain.

The six SQL fault configurations each produced a behavioral assertion failure. Their final and initial records remain separate. This establishes sensitivity after the implementation. It does not establish test-first order. Six client fault dispatches returned exit 1. Five failed to find expected rendered content. MC2 reported an unmounted component error. Do not describe all six as assertion-level behavioral detections.

The supplied #370 correction records remain supplied evidence: 19 dispatch entries and 15 behavioral detections. Original W2/W5/M3 survived. Original M2/M3 failed in setup. Later checks do not establish test-first order. This composition does not replace those records or expand the round-2 verdict beyond S370-1/2/3 and T370-1/2.

## Verification results

The retained runs below occurred in this same implementation task before the account change. Their product bytes still match the preserved implementation commits. They were inspected during continuation. They are not fresh reruns on the new account.

| Retained run | Result | Proved | Only passed through |
| --- | --- | --- | --- |
| Ordered service suite | 207 passed in 29 files, exit 0 | Authenticated task/detail writes, receipts, retry, isolation, concurrent final states, reverse rollback/reapplication, plan/step preservation | Local Auth, PostgREST, Postgres, and edge runtime. Content is controlled. No hosted system or model. |
| Edge type check | 21 entrypoints, exit 0 | Deno type compatibility | No runtime behavior. |
| Edge tests | 276 passed in 19 files, exit 0 | Tested handler/module behavior | Controlled dependencies. No model or hosted proof. |
| rag-query tests | 232 passed in 13 files | Context/proposal regression behavior, including edit/detail composition | Controlled Supabase and generation. |
| Mobile `test:ci` | Main: 1,480 passed, 18 skipped. DST: 13 passed. Natural exit 0 | Tested mobile component/store behavior and DST cases | Native modules and scripted services. Skips are not passes. |
| Mobile real-service mounted tests | 16 passed in two suites, exit 0 | Rendered callers use the local authenticated service | Native modules remain controlled. |
| Mobile changed-file lint | 0 errors, 34 warnings | Lint for the retained changed-file set | No runtime or accessibility proof. |
| Native export | iOS and Android bundles exported | Both native export paths completed | No installed app, device, or accessibility proof. |
| Client i18n scripts | Passed on mobile and web | Scripted key parity | No semantic language review. |

Fresh continuation results are separate:

| Fresh run | Result | Proved | Only passed through |
| --- | --- | --- | --- |
| Mobile type check | Exit 0 | Current TypeScript types | No runtime behavior. |
| Web changed-file lint | 19 files, exit 0 | Changed client files satisfy lint | No runtime behavior. |
| Web `npm test` then `npm run build` | 707 passed, 9 skipped; both exit 0 | Current test behavior and Next production compilation/type check | jsdom/scripted services for tests. Build is not production operation. |
| Full web lint | Exit 1, 12 errors | Error locations map to identical lines in accepted parent `21df0701` | This remains a failing baseline. No lint pass is claimed. |
| Locale union and SQL mirror/body checks | Passed | Exact parent union and recorded byte/body comparisons | No additional hosted or native proof. |
| Real Next.js browser composition | Required interaction assertions passed, exit 0 | Cookie login, separate draft drawers, keyboard focus return, preserved composer draft, exact waiting-reason and remember commands, persisted rows, settled Undo, saved-detail drawer, 390 px layout | Local synthetic account and local services. No model request. No screen reader. |

`retained-counts.json` derives each service distribution from the same log's file declarations and final summaries. These counts are not added together because the runs overlap.

The browser's first run captured a transient historical notice before the detail read refreshed. Run 2 waits for the named Undo control. It failed a new assertion because the visible control says `Undo this change`, not `Undo`. The raw run and images remain. Run 3 uses the correct visible label, passes all interaction assertions, and records current receipts on desktop and at 390 px.

The browser result is not a clean-console result. It records a hydration error in the task-entry loading text on both page loads, plus fixture Sanity CORS/resource errors. No accepted-parent browser reproduction ran. The hydration error remains an observed limitation for review; this handoff does not label it a proven baseline or a resolved defect. The focused interactions and persisted outcomes passed despite these messages.

## Local resources and cleanup

Project `unify-compose-details-370-r1` used API 61751, DB 61752, shadow 61753, inspector 61754, content 3268, and browser 3218. `tools/owned.sh` checks project/workdir labels for all five containers and sets both `ACTIONS_DB_CONTAINER` and `ACTIONS_REST_CONTAINER`. It refuses another API. No default361 container was used.

Continuation inspected retained jobs before any new test. The retained Next server belonged to this web workdir. The unrelated Vitest process belonged to another worktree and was left alone. No new database reset or service suite ran during continuation. Browser runs and service cleanup were sequential.

Installed Supabase CLI 2.118.0 help and the current changelog were read. No upgrade ran. The current TLS change concerns hosted APIs. These tests used local HTTP. The documented table grants, RLS, schema-cache refresh, reset reconnection, and copied-source/type-input constraints were read. Local results do not verify hosted grants or rollout readiness.

The owned Next process and its recorded children were stopped. The owned Supabase project stopped with `--no-backup`. `stack/cleanup.json` confirms no owned container, volume, or assigned listener remains. Other recorded container IDs remained unchanged. Temporary Deno copies were removed before the final web test/build. The original tracked test configuration was restored byte-identically, SHA-256 `08a3f04c229f7e255a8afd328c1fd05bddfaba2a28633fcf1d776636d051c678`. No TypeScript or lint configuration changed.

The original synthetic browser seed files remain local evidence. They contain test-account passwords and are excluded from the committed manifest. No real account credential or service key is committed. Build output and Python bytecode are also excluded. Raw failures and their sources remain in this folder.

The staged diff whitespace check passes when raw `.log` files are excluded. The complete check reports terminal-generated trailing spaces and blank lines in those logs. Their original bytes remain unchanged.

No push, PR/issue/watch change, integration write, hosted action, deployment, paid service, live model call, instruction edit, simulator, or native build ran. Native criterion 8 remains incomplete. The root owns the fresh review and merger.
