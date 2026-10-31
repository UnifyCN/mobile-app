# Saved-detail Edit Cancel focus, R10

Status: candidate for independent code review. Native F1 remains open until a fresh TalkBack check. This report grants no ticket, native, integration or release acceptance.

## Fixed input and failure condition

Base: `1f736dd2dc2a543cf10803a8a8069834d62becaf`.
Branch: `fix/companion-saved-detail-cancel-focus-359`.
Worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/root-companion-ci-ccc627b`.

The prior Android R9 report records F1, P2. After native Edit Cancel, TalkBack selected `Unlabelled` across the full window. The detail and receipts did not change. The prior native report hash is in `source-and-log-audit.json`.

A valid correction must return focus to the current detail's Edit button after Cancel. It must save no cancelled draft. It must request focus once after layout, including on a second edit/cancel cycle. Focus on another control, no focus, an early event, a duplicate event, or a saved edit disproves this claim.

## Change

`SavedDetails.tsx` gives the Edit button its own instance of the existing focus hook. Edit Cancel requests focus before it clears the local draft. The remounted Edit button sends the native accessibility focus event after its layout. Removal Cancel continues to use its separate hook. No service, schema, translation, dependency or native configuration changed.

## Test order and results

The new mounted test was written before the source correction. On the unchanged base, `red.log.gz` fails at the expected assertion: one focus event expected, zero received.

The first corrected-source attempt, `green-attempt-1-oom.log.gz`, stops at the Node heap limit, exit -6. The test compared the full React Native mock instance to the wrong object shape. The final test reads the target's accessible label and the event type separately. The original empty native-node mock helper is kept. No earlier test assertion changed.

The final test version was run again against the exact base source. `red-final-test.log.gz` fails on the same zero-event assertion, exit 1. `green-final-test.log.gz` passes, exit 0. The test checks two Cancel cycles, the named target, event timing and count, unchanged write count, and unchanged persisted fixture text. The existing removal-Cancel case remains a positive control.

Raw logs are stored as lossless gzip files. Their initial whitespace-check failure is kept in `raw-log-whitespace-check.log.gz`. Compression preserves every byte. It avoids treating runner formatting as authored source.

Final gates in `gates.json` all exit normally with code 0:

- Focused saved-details file: 18 tests passed.
- `npm run test:ci`: main 157 suites passed, 4 skipped; 1,615 tests passed, 29 skipped. The separate DST run passed 13 tests in 2 suites. No `--forceExit` was used.
- Normal TypeScript check passed.
- Translation parity check passed.
- Changed-file ESLint: 0 errors, 9 warnings.
- Normal iOS and Android bundle export passed.

These counts overlap. Do not add them.

## Proof classes and remaining work

- Mounted client: proves the app sends a focus request for the current labelled Edit control after layout and does not save Cancel. It uses a fake action service and the React Native View mock. It does not prove real native focus or speech.
- Regression suite: proves the checked client assertions on this source. Local-stack tests remain skipped where configured. It does not prove real service authorization.
- Export: proves both platform bundles can be generated. It does not prove device behavior.
- Native: no new run in this correction. The R9 focus failure remains a required native recheck. Its TTS synthesis errors remain a separate open result-speech gap. VoiceOver, full criterion 8, hosted delivery and provider delivery remain incomplete.

A new physical test-project copy is prepared under `build/android-detail-focus-r10/mobile`. The old `build/ios-metro-root-r9/mobile` is preserved. Project preparation is not a native check. No emulator, service stack or provider call was started by this correction.

## Cleanup and scope

All check runners exited naturally except the preserved first green attempt. It exited after the heap failure. No owned runner remains. Ignored dependencies, bundle output and the new physical build project are kept for review. The #371 worker and its service are not changed. Canonical integration paths, PRs and acceptance records are unchanged.

`source-and-log-audit.json` records source hashes, the prior report hash and a bounded credential-pattern scan of the captured logs. This scan is not a general security review.

COMPANION_DETAIL_EDIT_CANCEL_FOCUS_R10_CORRECTION_DONE
