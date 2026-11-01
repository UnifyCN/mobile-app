# Companion test-driver and service-input recovery

Status: the mobile repair passes. The complete service command needs one fresh successful run before integration. No actual integration changed. Tickets #367/#370 and native criterion 8 remain unaccepted.

Worktree: `/Users/savargupta/.t3/worktrees/Unify/t3-881f2449`. Branch: `fix/companion-command-ci-359`. Base: `5c00c5d35fbfcaf1e8aab76b3fd0b0026651ebab`. Code commit: `3bb5484c477052e807b718aaa6a181b6e8932564`, tree `40be63ff4579a89c32561bd4a7605ab6b960cdad`.

## Original failure and limits

The prior merger stopped correctly. Its mobile `npm run test:ci` exited 1 with one waiting-reason receipt test failure. Its full service run passed 228 cases and failed two cases because its runtime copy lacked web locale files. The unchanged report is in `../merge-367-370-native-code-r1/report.md`.

The original mobile failure was not reproduced by the eight-case focused run, five isolated diagnostic runs, 30 repeated diagnostic cases, or the full diagnostic run. These sets overlap. The full diagnostic run had test logging, so it is not an unchanged-test run. No diagnostic result proves the exact cause of the earlier CI failure.

The driver did not check whether the input was editable or Send was enabled. A controlled delayed first response produced the same missing-second-card assertion. The trace recorded `editableBefore: false`, an empty input, and `disabled: true` at the second action. This proves a driver defect under that controlled schedule. It does not retroactively trace the earlier failure.

## Repair and binding test

Only `unify-front-end/__tests__/companionActions/taskEdit.test.tsx` changes. The driver now waits for editable input before typing. It waits for enabled Send before pressing. App code, server code, migrations, dependencies and locales do not change.

The existing waiting-reason case now holds the first committed response with a promise. It starts the second interaction while the composer is disabled. It releases the first response after the interaction starts. This controls the order without a sleep or a machine-speed assumption.

The claim is false if two submitted waiting commands produce one card, a reason changes in history, or the title/reason assertions are removed. The held-response case with the old helper failed at the same two-card assertion. The repaired helper passed all eight cases. The first controlled test used 100 ms latency before the helper fix. The final promise schedule was added after the helper change and checked against the old helper again. It is a counterfactual regression check, not another test-first claim.

The test keeps the first receipt's saved states and reasons, the second receipt's exact before/after reasons, the later historical marker, the persisted row, and private-text exclusion from analytics. The syntax audit finds all 65 old matcher calls unchanged and four added guards, for 69 calls. The audit does not prove semantics; review must assess the changed interaction order.

## Fresh mobile results

- Focused repaired file: eight passed, natural exit 0.
- Exact `npm run test:ci`: natural exit 0 in 72.516 seconds. Main: 1,500 passed, 23 skipped. DST: 13 passed. Do not combine these counts with diagnostic runs.
- TypeScript: exit 0 in its own final command.
- Changed-file lint: zero errors, ten warnings. Every warning maps to an unchanged source line at the base.
- Tracked test diff check: pass. One test file, 36 insertions and five deletions.

The full CI, focused tests and type checks ran before the code commit on the same source bytes. Commit creation changed no source. The temporary trace and repeated-case edits were removed. No test timeout or assertion was relaxed. No application behavior fix is claimed.

## Service input recovery

The owned runtime copies 219 tracked web service and locale files from exact web `e8b99343b307a0f7bfa2f99ef74657e97b4f0154`. Every copied file was compared with its Git object. Seven mobile locale inputs also match the base. `ACTIONS_MOBILE_LOCALES` points at those inputs, so the priority-label case covers both clients.

The first root full command ran all 35 service files and exited 1 naturally. It passed 229 cases. Both former locale-input cases passed. Its one failure occurred after the schema/grant assertions: the optional `ACTIONS_COMPOSITION_EVIDENCE` export attempted a JSON write, but the normal Deno runner grants no write access.

The recovery removes that optional export setting. It does not remove schema, signature, privilege, RLS or rollback assertions. The affected file then passed through normal `run.sh` with natural exit 0. It does not need a broader filesystem permission.

All 230 unique cases now have successful coverage across the full attempt and the focused retry. That is a coverage record, not a successful full-command exit. The complete command remains a required fresh merger check. The failed full attempt, the target retry and the complete per-file distribution remain separate in `raw/service-recovery-coverage.json`.

`service_recovery.py` contains the checked input-copy procedure. It runs the normal tracked service runner. It uses one local project and sets both database and REST container names. It clears inherited `ACTIONS_*`, `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` values. It uses local addresses. The optional stage JSON export stays off. Its `prepare` command refuses an existing runtime and occupied ports. It is an evidence helper with explicit local paths, not a general product tool.

## Cleanup and remaining gates

The root stopped only project `unify-recover-367-370-ci-r1` after separately reading its exact container labels. Cleanup found zero assigned containers, zero assigned volumes and five free ports. The runtime copy, raw failures, ignored dependencies and caches remain for inspection. The original merger report and external caches remain unchanged. One early root output-path mistake ran no test and is recorded separately.

The separate native verifier keeps its assigned resources. The root did not drive, stop or modify them. The reviewed application code and retained Android binary are unchanged by this test repair. Previous product-scope SPEC and Standards approvals remain supplied evidence. The new test diff needs independent review before integration.

No web edit, push, PR change, ticket change, hosted operation or release occurred. Full web lint remains the supplied failing baseline with 12 errors. Native criterion 8 remains incomplete. A successful local test command does not accept a ticket or prove native behavior.

HANDOFF: COMPANION_COMMAND_CI_359_REPAIR_READY
