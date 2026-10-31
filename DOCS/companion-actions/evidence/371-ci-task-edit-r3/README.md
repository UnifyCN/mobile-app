# Mobile task-edit CI helper correction

This candidate needs independent SPEC and Standards reviews. It gives no native, hosted, ticket, integration or release acceptance.

- Base: `c8b11b2c0628ce59bb199a3477c7b676045a016b`.
- Root: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/root-companion-task-edit-ci`.
- Branch: `fix/companion-task-edit-ci-359`.
- Remote failure: run 41200451670, frontend job 124535043301. The waiting-reason case expected two command cards and found one at parent line 600. The step-suggestion and step-receipt files passed. Lint, types and locale parity passed. Native export was skipped after the unit failure.

## Correction

Only `unify-front-end/__tests__/companionActions/taskEdit.test.tsx` changes in the application tree. The helper waits for the rendered input value and awaits the existing installed async press API. The receipt case starts its intentionally held first send as an explicit promise. It releases the first response at the same point and then awaits both sends. This keeps the original blocked-composer and pending-second-interaction order without a wait cycle.

All 69 original expect calls, data, requests, timeouts and domain assertions remain. One input-value assertion is added, giving 70. Reversing the five exact edits restores every parent byte. The original two-card, saved reasons, later receipt history, current backend row and analytics assertions remain. No product, dependency, lockfile, workflow or instruction file changes.

The installed RNTL is 13.3.3. Its [13.x async event API](https://oss.callstack.com/react-native-testing-library/13.x/docs/api/events/fire-event#fireeventasync) was already checked in the preceding correction. The dependency versions and API implementation are unchanged here. No library update occurred.

## Binding checks and limits

The unchanged eight-test file passes locally. This does not reproduce or explain the remote failure. The relevant test, screen, hook, card and package bytes match the actual GitHub synthetic merge `69065cee56e67a1d7cbf735ed22372ce8e8921c2`.

A controlled case holds the second committed apply response. With the old helper, the second send promise has returned while that response is still blocked. The new helper stays pending. The base control fails the added pending assertion; the fixed control passes. Release then lets every original waiting-reason assertion pass, with two writes, exact Friday/Monday reasons and zero model calls. This proves the helper completion distinction. It does not reproduce the historical CI interleaving. The number of visible cards during this held checkpoint is observed, not asserted. The fixed control can already have two cards because a separate read sees the committed rows.

A deliberate product fault omits receipts whose task state is unchanged. It fails the original two-card assertion at candidate line 603, expected two and received one. Exact product bytes are restored in finally. An earlier fault that kept only the first command did not fail at the intended two-card check. It failed later at the history assertion. That raw failure remains and is not counted as the required missing-card proof.

The reusable `probe_driver.py` runs the base held case, corrected held case and same-state receipt fault. It restores exact test and card hashes in finally. The script itself ran with all three required outcomes. It uses literal ROOT and OUT paths. A reviewer must copy it into an owned worktree and adapt only those paths before execution. The control uses the same held fixture section for both helper versions.

One preparation assertion failed after the valid temporary fixed control was written. Its count also included a later composition test with the same command text. The count was corrected to the intended test section. The unchanged temporary control bytes were verified. `preparation-failure.json` explicitly reconstructs that tool failure; it is not captured stderr. No product fix resulted from it.

## Related helper audit

Six helper definitions and their callers are recorded in `helper-callers-audit.json`. The preceding step-suggestion helper already awaits its event. This correction changes only the current task-edit helper. Account-ownership cases deliberately start pending work before account changes. Create and saved-detail cases inspect results after one initial send. The real-service plan helper is outside this scripted check. These helpers remain unchanged. This audit gives no broad stability qualification for them.

## Final results

| Check | Result |
| --- | --- |
| Edit, step-suggestion and step-receipt files | 38 passed; natural exit 0 |
| Exact npm run test:ci | Main: 1623 passed, 31 skipped; DST: 13 passed; natural exit 0 |
| Normal types | exit 0 |
| Changed test lint | 0 errors, 10 warnings; exact diagnostic set matches the parent |
| Held helper control | Required base assertion failure, corrected pass |
| Same-state receipt omission | Required original two-card assertion failure |
| Restoration and original assertions | Exact product bytes restored; all 69 retained |

Counts overlap. Do not add them. The exact commands, full failures, summaries, controls and restoration records remain in the archive. The original remote cause and earlier intermittent causes remain unproved. A green local run gives no guaranteed remote stability. Native export was not repeated for unchanged product bytes.

## Proof and cleanup

The tests use mounted scripted clients and mocked Auth, message storage, transport, model and native APIs. They do not prove real persistence, RLS, native input, screen-reader, provider, delivery or hosted behavior. No app server, Docker, native runtime, hosted write, provider call, push or acceptance action occurred.

The independent dependency copy has equal package and lock bytes, separate sampled file inodes and 108 internal symlinks with no external target. Ignored dependencies and owned test/npm caches remain. All owned check commands ended naturally, including the intended assertion failures. Temporary test and product changes are restored. The two immediate prior review hashes and protected source/integration roots match their recorded states. This work did not edit earlier evidence or Impeccable 3.9.1.

HANDOFF: COMPANION_371_CI_TASK_EDIT_R3_REVIEW_READY
