# Mobile step receipt CI correction

This is a test-only candidate. It needs independent review before integration or push. It does not accept ticket 371, native criterion 8, or a release.

Base: `6b6a302c8b9d17b6831892bd9f211b55f22564cc`.
Worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/root-companion-step-receipt-ci`.
Branch: `fix/companion-step-receipt-ci-359`.

## Problem and correction

Remote run `41190145739`, frontend job `124505072494`, failed at `taskSteps.test.tsx:694`. The checked-step receipt case expected two historical receipt notices after two remote edits. It found one. The job passed lint, translation parity, and types. It did not reach native export. Edge tests and backend dependency checks passed.

The test previously waited for a saved receipt and one historical notice before its simulated remote writes. That does not identify which receipt is historical. The saved receipt can appear before the progress read completes. At that point the added-step receipt still matches the old progress, and the newly checked receipt does not yet match it. The one notice can therefore name the newly checked receipt.

The change adds seven lines. It waits for the checkbox to be checked and enabled before the existing one-notice assertion and remote writes. No original byte or domain assertion is removed. The unchanged assertions still require the checked value, the saved receipt text, two remote writes, and two historical notices after the later revisions. The test has 101 `expect` calls instead of 99. All product code is unchanged.

This correction makes that precondition explicit. It does not establish the exact cause of the historical CI failure.

## Binding controls

The controlled check holds the progress response after the checkbox save. The saved receipt and one historical notice appear while the checkbox is still unchecked and disabled. This demonstrates the ambiguous old precondition through the mounted screen. The check then releases the read. The corrected test passes, including the original final assertions.

The domain fault replaces the component's revision comparison with a comparison of title and checkbox value. The same checked-step test then fails at the final historical-notice assertion. The test correction therefore retains sensitivity to later revisions that restore the same value. The component and test instrumentation were restored to their saved hashes. `probe-results.json` records the restoration.

The permanent change was not developed with a local assertion-red run of the unchanged driver. The remote assertion failure is retained. The held-response control was written after the precondition change. Its passing result proves the ordering distinction, not the historical CI interleaving.

## Results and retained failures

| Check | Result |
| --- | --- |
| Complete step test file | 20 passed; natural exit 0 |
| Held progress-response control | 1 passed, 19 selection skips; natural exit 0 |
| Revision-comparison fault | 1 required assertion failure, 19 selection skips; source restored |
| Normal TypeScript | exit 0 |
| Changed test-file ESLint | exit 0; 0 errors, 13 existing warnings |
| First full CI attempt | exit 1; 1621 passed, 2 failed, 31 skipped; DST did not run |
| Two other files, focused rerun | 18 passed; exit 0 |
| Same two files with failure-only tracing | 18 passed in each of three runs; exit 0 |
| Full main suite with failure-only tracing | 1623 passed, 31 skipped; exit 0 |
| Exact final `npm run test:ci`, trace removed | main 1623 passed, 31 skipped; DST 13 passed; natural exit 0 |

Counts overlap and must not be added. The first full attempt failed in `taskStepSuggestions.test.tsx:534` and `taskEdit.test.tsx:600`. Both expected two cards after a second message and found one. The corrected receipt file passed that run. The two other failures did not repeat in the three focused runs, the instrumented full run, or the final exact CI run. Their cause remains unproved. They are retained failures, not corrected defects. No timeout, assertion, or driver in those files changed in the permanent candidate.

The failure-only diagnostic wrapper logged saved messages and query state only if the two-card assertion failed. It did not fail in those runs, so it produced no failure snapshot. The wrapper is removed. An initial inline assertion audit failed to parse because of an extra parenthesis. No audit assertion ran then. The corrected `assertion_audit.py` passes and remains reproducible after commit.

`raw-evidence.tar.gz` retains the command records, complete failed remote job log, failed local run, focused and diagnostic runs, final CI run, controls, restoration hashes, and audit script. Its `HANDOFF.md` is the earlier in-progress note. This README reports the final candidate state. `raw-evidence-manifest.json` records file sizes and SHA-256 values.

## Proof limits and cleanup

These are scripted client checks. They do not prove hosted persistence, real SDK event order, provider timing, native rendering, screen-reader behavior, or notification delivery. No service, Docker, native, hosted, provider, deploy, push, PR, or integration action occurred for this correction. No product code, dependency manifest, lockfile, CI workflow, assertion, or timeout changed. Native bundle export was not repeated because application bytes are unchanged. The remote frontend/export check remains failed until a reviewed correction is pushed and a new check completes.

All owned check commands ended naturally. No owned check process remains. The ignored independent dependency clone is retained. The frozen feature and integration checkouts remain unchanged. All prior failed evidence remains. Impeccable stays at 3.9.1. Native, ticket, and release acceptance remain open.

HANDOFF: COMPANION_371_CI_STEP_RECEIPT_REVIEW_READY
