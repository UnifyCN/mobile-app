# Ticket 368 internal runtime continuation R3

Status: local execution finished. HOLD for fresh independent SPEC and STANDARDS review and the remaining native and hosted checks. This implementation continuation gives no acceptance.

## Candidates and ownership

| Candidate or input | Commit | Tree |
| --- | --- | --- |
| Mobile product input and original read-only source | e9955ca7aebfa8728473198b8c4240712882aefa | 0b0e110b0e1edfc729a278e76af192a9c1ad7567 |
| Initial web input | 941e8cabb86ae11e4523854d9c8e7320c171663f | 1ea72aba1606b48b3e99387ea3cffecc84075286 |
| Web test source after both corrections | f1d4b650452535e4500beb1bc7b9587eabe9ef87 | 93665b9b62cd36c8569c1ddfbfe8530eb29bb5c9 |
| Final web candidate, including its evidence pointer | 4a2834a51fd1d389e5ebf7d22e60ad588fe5fc2a | a390d0d1b8a1b76acbc996eeedef8a94a757a0a9 |
| Mobile integration | 61a4134c786c37f65a02baca2364fd7e18ea2509 | 473039fa8eb0019a562413c221e4410d0c3c494c |
| Web integration | 914e4f54b08deaa9cf48e25aa86041720e6296db | 069454bb5bc7b45484d013222ffcc55265445fa8 |

Primary: /Users/savargupta/.t3/worktrees/Unify/t3-dc125d75, branch t3/internal-runtime-service-checks-368. Its physical path is /Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-dc125d75. The primary started clean at the mobile integration. Separate identity, cleanliness and ancestry checks passed before git merge --ff-only e9955ca7. No checkout, reset, stash or branch switch occurred.

Assigned web secondary: /Users/savargupta/.t3/worktrees/Unify-Web-App/fix-removed-receipt-view-359, branch feat/companion-reminders-368-r1. Pointer: docs/companion-reminders-internal-r3.md. It started clean at the required 941e8cab input. No new web checkout was made.

The final mobile evidence commit contains this handoff and the documentation update. Product input stays at the exact mobile pin above. Resolve HEAD on the named primary branch for the final evidence tip. The final response supplies its exact commit and tree. candidate-and-integration-pins.json records the actual branches, trees, clean original source and integration states before that evidence commit. Both accepted integration tips remain ancestors. The approved probe subtree and all historical R1/R2 evidence remain unchanged.

## Service and source sets

The root transferred an already-running project, unify-reminders-368-r1. Its internal source root is /private/tmp/unify-companion-359/reminders-internal-r3. Its control directory is DOCS/companion-actions/evidence/368-reminders-runtime-r2 below that root. Its workdir is the control directory plus .runtime/supabase/tests/companion-actions. This is a private source snapshot, not a Git checkout.

Ports: API 63081, DB 63082, shadow 63083, inspector 63084, content 3385 and browser route 3390. Actual container labels, running state, internal mounts and COMPANION_CONTENT_QUERY_URL=http://host.docker.internal:3385/content passed separate checks. No stack was created. No external Docker bind or Desktop restart occurred.

The initial manifest has 163 records: 162 exact copied inputs and one documented project/port configuration change. Source set 2 changes only the race test, at web commit b3ac2bdcc55bac7f38fb2551718f691fac0faa41. Source set 3 also changes the boundary fixture, at web commit f1d4b650452535e4500beb1bc7b9587eabe9ef87. source-set-2-test-barrier.json, source-set-2-preflight.json and source-set-3-preflight.json retain the hashes and transitions. source-and-mirrors-final.json verifies all final copied inputs and all 21 cross-repository mirrors.

No product code, migration, rollback, ACL, operation registry, translation or accepted SQL body changed. Earlier passing files retain the same executed file and dependency bytes in the final source. Later test corrections do not enter those files' imports. The root-passed reminder file and its dependencies remain unchanged. Its supplied result is retained separately. No pass from a different product source is substituted.

The copied suite excludes reminders_test.ts. It places reminders_commands_test.ts and reminders_races_test.ts before the 35 older files. It resumes after completed passing files when a failed attempt needs correction. Each executed file retains its owned database reset, REST restart and five consecutive HTTP 200 readiness replies. The exact 37-file order is in suite-driver-change.json. Final driver bytes and hashes are in driver-manifest-final.json. Only suite exclusion/resume controls and the copied mobile driver's ROOT changed. The latter now names the assigned primary. ACTIONS_STACK_WORKDIR stays internal. All exact project, DB/REST, running-state and content-URL guards remain.

## Failed attempts and corrections

- Preliminary driver start: the source check rejected the documented configuration change. The next command started before that failed check was read. It was interrupted during database reset. No test ran. premature-suite-interrupted.log and premature-reset.log retain this error. The corrected check verified the documented configuration change before the next execution.
- R3-1: the race trigger declared kind as a local variable and used kind as a table column. Cron recorded SQLSTATE 42702. Cases timed out before the required waits. The run was stopped and preserved in attempt-1. This is invalid setup, not assertion RED or a product defect. The correction uses barrier_ref and barrier_kind. All original race assertions remain.
- R3-2: boundary_test.ts retained reminder.schedule as an unsupported operation after ticket 368 registered it. Its strict assertion failed: expected unsupported_operation, received explicit_instant_and_zone_required. attempt-2 retains the failure. The correction keeps the unsupported-operation assertion with the out-of-scope reminder.send_email operation. The original malformed reminder.schedule input remains as an additional exact rejection case. No assertion was removed or relaxed.
- The normal check of all 37 service files failed with six errors in three unchanged older tests. Five errors are extra arguments to an existing helper. One is the npm/JSR Supabase client type mismatch. service-normal-types.log and service-normal-types-result.json retain the command and failures. The affected tests and support.ts match the accepted web integration byte for byte. service-type-baseline-inputs.json records those hashes. No suppression or unrelated fix was made.
- execution-notes.md also records two read-only diagnostic corrections. The protected volume count must include unmounted volumes. Docker mount arrays must be compared as complete sets because their order can differ. The raw failed mount-array comparison remains in protected-resource-compare-attempt.json.

No binding ticket 368 product defect was established. The changes correct two test inputs. The final 37-file service run has zero failures. This does not change the failing broad normal-type result.

## Service results

Fresh continuation: 37 files, 244 passed, zero final failures. The counts include cleanup cases. service-counts.json contains all 244 exact case names, file counts, durations, readiness counts and log hashes. service-final contains every final log and REST readiness record. Each file ran once successfully. Only the two failed files had corrective attempts. Completed passing files were not repeated.

Root supplied: reminders_test.ts, 10 passed, zero failed, including cleanup. Its three mutations reached assertion RED: owner, cancelled due and due time. The root restored the functions. root-supplied-results.json and root-supplied-reminders.log retain the supplied evidence and matching log hash. This continuation did not execute that file or claim its mutations as fresh work. No new mutation survivor was produced. A timeout is not a mutation kill.

Combined service set: 38 files and 254 passes. The supplied reminder file covers authenticated concurrent saves, actual Cron, owner isolation, content parents, proposal/revision/change/Undo, clock boundaries, worker/read faults, bounded scans and rollback/reapply. The older files retain their existing foundation and migration fixtures. Some exercise an in-process handler with real database access. They do not each prove the complete reminder schema or the actual Edge HTTP boundary.

| File | Pass | Fail |
| --- | ---: | ---: |
| reminders_commands_test.ts | 3 | 0 |
| reminders_races_test.ts | 11 | 0 |
| actions_test.ts | 4 | 0 |
| boundary_test.ts | 11 | 0 |
| command_test.ts | 7 | 0 |
| compose_365_370_test.ts | 4 | 0 |
| compose_367_370_recovery_test.ts | 1 | 0 |
| compose_367_370_rollback_test.ts | 1 | 0 |
| compose_367_370_test.ts | 1 | 0 |
| compose_rollback_test.ts | 2 | 0 |
| create_rollback_test.ts | 3 | 0 |
| create_test.ts | 17 | 0 |
| details_language_test.ts | 3 | 0 |
| details_rollback_test.ts | 2 | 0 |
| details_test.ts | 12 | 0 |
| edit_command_test.ts | 10 | 0 |
| edit_published_test.ts | 5 | 0 |
| edit_rollback_test.ts | 2 | 0 |
| edit_test.ts | 9 | 0 |
| edit_undo_test.ts | 3 | 0 |
| plan_access_test.ts | 6 | 0 |
| plan_multiple_reviews_test.ts | 5 | 0 |
| plan_recovery_test.ts | 8 | 0 |
| plan_retry_review_test.ts | 8 | 0 |
| plan_rollback_test.ts | 3 | 0 |
| plan_test.ts | 8 | 0 |
| plan_undo_test.ts | 6 | 0 |
| receipt_history_test.ts | 4 | 0 |
| remove_plan_race_test.ts | 3 | 0 |
| remove_rollback_test.ts | 2 | 0 |
| remove_test.ts | 15 | 0 |
| rollback_test.ts | 6 | 0 |
| steps_context_race_test.ts | 23 | 0 |
| steps_parent_race_test.ts | 11 | 0 |
| steps_rollback_test.ts | 2 | 0 |
| steps_test.ts | 15 | 0 |
| undo_test.ts | 8 | 0 |

## Cancellation orders

All ten orders passed: complete, remove, explicit cancel, legacy completion and content completion, each with claim first and stop first. The race file has ten cases plus cleanup. race-results.jsonl has exactly ten intermediate records and ten final records. race-summary.json and race-final.log retain the distribution and log hash.

Each case observes an actual pg_cron worker in the lock graph. It checks the wait direction before release. The committed intermediate reminder is pending and unclaimed. The parent change is not yet committed. The final public read withholds due state. The five claim-first cases retain claimed history. The five stop-first cases have no event. All ten schedules end cancelled. Cancellation reasons: task_completed 6, task_removed 2 and user_cancelled 2. Task Undo leaves stopped work stopped. HTTP reply order is not used as commit proof.

## Live client results and proof limits

prepare_live.py exited zero after exact owned-stack checks. It applied the reminder migration only when absent and waited for the schema cache. This is setup only.

The mobile driver ran from the final primary. One rendered RNTL test passed and exited naturally. It reviewed and saved a reminder through real Auth/JWT/actions, observed actual Cron due state, opened the exact task reference, stopped through its own receipt, preserved task state/revision and verified a foreign account saw no reminders. React act warnings remain in mobile-live.log. This is rendered component evidence, not a native device or screen-reader result.

The browser driver ran REMINDER_BROWSER_MODE=live on the assigned web source. One English 390-pixel Chromium case passed and exited naturally. It used real local Auth/JWT/actions and actual Cron. It checked review before apply, persisted save and receipt Undo, same-task navigation, unchanged task state/revision, account isolation, drawer focus, Escape, composer preservation, no overflow and minimum control sizes. browser-live contains the persisted readback, layout, screenshot and HTTP records. There are 50 HTTP records: 49 status 200 and one status 201. Each records bytes and elapsed time. The route adapter blocks other browser network requests. It is not the actual Next.js shell or a native check.

The mobile and browser checks ran separately after service files finished. They used the same owned internal service. Browser output and temporary/cache files stayed under the internal control. client-results.json records their distinct results. Persistence, scheduler execution, server visibility and rendered display passed at these boundaries. Observation by a person and delivery remain unproved. No acknowledgement or delivery claim was added.

## Static and supplied checks

| Subsystem | Result and limit |
| --- | --- |
| Corrected race test, normal Deno check | Fresh pass. Compile proof only. |
| Corrected boundary test, normal Deno check | Fresh pass. Compile proof only. |
| All 37 service files, normal Deno check | Fresh failure: six errors in three unchanged older tests. Not green. |
| Python controls | Fresh syntax checks pass. Runtime results are reported separately. |
| Complete Edge workflow fixtures | Supplied R2: 277 pass, zero fail, 19 files. No SQL execution or real external provider. |
| Edge source and fixture types | Supplied R2 pass. No additional runtime assertion. |
| Mobile full main and DST runs | Supplied: 1516 main passes, 24 skips and 13 DST passes, natural exits. |
| Web full tests | Supplied: 720 passes and 13 skips. |
| Mobile/web types, i18n, changed product-file lint and web build | Supplied exact-source passes. |
| Full web lint | Supplied 12 mapped earlier errors. Not green. |
| Native iOS/Android exports | Supplied Hermes bundling proof only. |
| Four scripted browser cases | Supplied English/Arabic at 390/1280 pixels. Rendered fixture proof only. |

Initial reuse verification matched 1264 mobile files and 752 web files. After the two service-test corrections, final verification matches 1264 mobile files and 750 web files. The only two changed web inputs are the corrected Deno tests. Both are excluded from the Next and Vitest programs and have fresh focused Deno checks. reused-client-final.json retains the complete unchanged file hashes and changed test hashes. No relevant client product input changed, so the full client gates were not repeated.

Installed Deno is 2.7.14. The Edge workflow selects floating v2.x. No exact hosted workflow-run version was supplied. Supabase CLI remains 2.118.0. No tool or Impeccable upgrade occurred. Live model/provider calls and generation quota calls remain zero. The final owned database has zero quota calls, four successful Cron runs, zero failed Cron runs and one cancelled historical schedule. This last snapshot describes the post-reset client database only. It is not an aggregate of earlier reset databases.

## Cleanup and review

The exact project stop with --no-backup exited zero. cleanup-final.json verifies no assigned container, volume, network or driver remains. All six ports are free on IPv4 and IPv6. All 33 protected container identities, running states and complete mount sets match the saved record. All 18 protected volume names remain present. No protected data was used or changed.

The internal source snapshot remains at /private/tmp/unify-companion-359/reminders-internal-r3. Its Deno cache and temporary cache remain. The primary's ignored mobile dependencies and existing web dependencies remain. No temporary app configuration needs restoration. New logs, hashes, race records, client readbacks and the screenshot are copied here, so /tmp is not their only location.

SPEC: HOLD for fresh independent review and the remaining native and hosted requirements. This continuation gives no independent acceptance verdict.

STANDARDS: HOLD for fresh independent review and the recorded broad normal-type failure. Focused changed-test checks pass. This continuation is not independent review.

Observed iOS/Android input, keyboard clearance, text scaling, focus, VoiceOver/TalkBack and complete native task workflows remain open. Native criterion 8 and tickets 367/370 remain unaccepted. Hosted migrations, grants, Cron service-account setup/execution, schema cache and deployment qualification remain open. No push, PR or issue edit, integration change, hosted action, model/provider run, child agent, Desktop restart or acceptance occurred.
