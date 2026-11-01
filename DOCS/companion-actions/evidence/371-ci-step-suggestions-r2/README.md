# Mobile step-suggestion CI driver correction

The correction needs independent SPEC and Standards reviews. It gives no ticket, native, hosted, integration or release acceptance.

- Base: `8df4e028c92b1143dab56efd6052b847fc44261f`.
- Root: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/root-companion-second-send-ci`.
- Branch: `fix/companion-second-send-ci-359`.
- Remote failure: run 41197768868, frontend job 124527315038. The second step draft is absent at test line 534: expected two cards, received one. The step-receipt test passes. Lint, types and translation parity pass; export is skipped after the unit failure.

## Change and binding checks

The only application-tree change is `unify-front-end/__tests__/companionActions/taskStepSuggestions.test.tsx`. The send helper imports `fireEventAsync` and awaits its press call. All 73 original expect calls, domain assertions, test data, timeouts and requests remain. Product code, dependencies, lockfiles, workflows and instructions are unchanged.

The installed React Native Testing Library is 13.3.3. Its async event API is present. The [13.x API documentation](https://oss.callstack.com/react-native-testing-library/13.x/docs/api/events/fire-event#fireeventasync) describes that API. The first public documentation URL redirected to 14.x; the matching 13.x page was then checked. No dependency update occurred.

The controlled falsifier is a helper that returns while the second user save remains held. An owned test copy holds that exact save. After one event-loop turn, the old helper has returned although the question is unsaved, the stream has one call and the conversation has one draft. The new control assertion fails on unchanged code: expected false, received true. The awaited helper stays pending in the same check. Releasing the response permits it to finish, and the original Not now, two-card, AI-limit, exact step and no-extra-model-call assertions then pass. The control changes only the scripted response and adds the helper assertion. It does not run a real network request.

A separate deliberate product fault prepares steps only in a new conversation. The corrected driver still fails the unchanged two-card assertion at candidate line 535: expected two, received one. The source was restored exactly. This proves that awaiting the handler does not hide a missing second proposal.

`probe_driver.py` reproduces both held-response cases and the second-proposal fault. It restores the exact candidate test and hook bytes in finally. It contains literal ROOT and OUT paths. A reviewer must make an owned copy and adapt those two paths before execution. The scripts and each log remain in the archive.

## Failure and timing limits

The unchanged real ten-test file passes locally. The unchanged full CI command also exits 0. Twelve focused repeats with boundary instrumentation all pass. No failure snapshot was produced by those repeats. The temporary tracing is preserved as text and is removed from the application tree.

These green runs do not explain the original CI failure. The controlled response proves an early-return defect in the test helper. It does not prove that this timing caused the historical remote failure. The earlier two-card failure in taskEdit also remains unproved. No permanent change was made to taskEdit. The new correction provides no guaranteed CI stability.

GitHub ran synthetic merge `9c2d539c5df5bcfbbc6535123b06216891e47d0b`, merging the feature with main `8aef964b01f644ca6433af23d7c031d4c1779d9c`. The relevant screen, send hook, suggestion test, package and lock bytes match this base. The incoming changes are service/ingestion files and the Edge job timeout. They are recorded in `ci-merge-comparison.json`. No main change is imported by this candidate.

## Final results

| Check | Result |
| --- | --- |
| Complete step-suggestion and step-receipt files | 30 passed; natural exit 0 |
| Exact npm run test:ci | Main: 1623 passed, 31 skipped; DST: 13 passed; natural exit 0 |
| Normal types | exit 0 |
| Changed test lint | 0 errors, 16 warnings; exact diagnostic set matches the base |
| Controlled early return | Base assertion fails; awaited driver passes |
| Deliberate missing second proposal | Original domain assertion fails |
| Source restoration and assertion audit | Exact product bytes restored; all original assertions retained |

Counts overlap. Do not add them. Machine-filtered summaries, commands, exit codes and raw failures remain in the archive. One initial evidence-scan setup failed because it treated byte-pattern values as compiled objects. The corrected scan uses the actual value types. Its failure record is an explicit reconstruction of the tool result, not captured stderr. The reusable probe script was itself run once with all three required outcomes. The fixed test and exact CI command ran after the temporary source was restored. Native export was not repeated because the product bytes are unchanged. Fresh remote CI is still required after an approved push.

## Proof and cleanup

The controls prove scripted mounted-client ordering and assertion sensitivity. They pass through mocked Auth, native APIs, analytics and action transport. Types prove static consistency. No hosted, database, real concurrency, provider, native rendering, screen-reader or device-delivery proof follows.

The dependency copy has equal manifest and lock bytes, separate sampled inodes, and 108 internal symlinks with no external target. Independent ignored node_modules and owned test/npm caches remain. All owned check commands ended naturally, including the deliberate assertion failures. No app server, Docker resource, native resource or hosted service was used. The old candidate, completed review reports and all integration worktrees remain unchanged. No push or acceptance action occurred. Impeccable remains 3.9.1.

HANDOFF: COMPANION_371_CI_STEP_SUGGESTIONS_R2_REVIEW_READY
