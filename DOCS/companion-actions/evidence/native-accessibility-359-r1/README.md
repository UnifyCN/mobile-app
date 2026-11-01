The correction is ready for independent review. No ticket, native criterion or release is accepted.

A failure is any clipped saved-detail label after a live text-size increase, a lost edit draft, Cancel focus on a different control, missing or interrupted final task-result speech, a focus move when reopening history, or a failed required check.

Code commit: `9df597c951a507f19e5a4aafa4be80608d64b7ab`. Code tree: `515cf51b489ecb5a96e9d34a33c37dfafbfc4ed4`. Fixed base: `81a14014a7119c4c64b28ffa1ca277baae41a82f`. Branch: `fix/companion-native-accessibility-359`. Only three product components and two test files change.

- N1: SavedDetails uses the existing LiveText component. Its text leaves refresh their native measurements. Inputs, controls and their state remain mounted. The native English 1.0 to 2.0 case keeps the exact edit value and native focus with the software keyboard visible. The detail, provenance and button labels expand and fit. The source map matches the final SavedDetails bytes. See `raw/live-text-comparison.json` and b03/b04 screenshots.
- N3: Cancel requests focus on the control that opened the confirmation. The request runs after that control has a native layout. It runs once. The direct removal case returns real TalkBack focus to Remove saved detail. The same helper handles the other detail confirmations. Those other focus paths have no fresh native observation.
- N2: On Android, a new removal or restore receipt receives focus after native layout. The panel does not send a competing announcement or live-region update. Receipt history stays visible. A saved receipt present at panel entry does not take focus. The initial native removal and Undo result utterances complete. The final history guard was then added. The final replay removal completed: TalkBack utterance 45 returned true. The final replay Undo did not restore the task: the read still has revision 4 and removed=true, and the screenshot shows a network error. Its cause is unproved. The earlier Undo utterance 68 completed before the entry-history guard. Do not report the final replay Undo as passed. Records e13 onward retain the distinction. The public native API emits input-focus and accessibility-focus events. An earlier copy of the same phrase is interrupted; the final phrase completes. Do not claim only one speech event.

Tests and order:

- The two detail controls were written before the fix. Both failed at behavior assertions. A later Edit setup needed an enabled-control wait. The original failure is retained.
- The result-component tests were written before the fix. Their first selectors used the wrong wording and are invalid RED evidence. The corrected red run has two assertion failures and one passing history control.
- The caller tests came after the first focus implementation. The retained-history case failed before its entry guard. The fresh-removal and restore controls passed. The guard fixes that failure.
- Final focused checks: 43 passed. Full CI: 1,508 main tests passed, 23 skipped, then 13 DST tests passed. The complete command exited naturally with 0. Both exports exited 0. Changed-file lint has 0 errors and 9 warnings on unchanged test source.
- All 70 original matcher calls in savedDetails.test.tsx remain. The current file has 87. This is syntax evidence only.

Type-check limit: the normal command failed on 102 diagnostics, all from a retained generated Deno service copy under build/native-combined359. The same application inputs pass a temporary config that excludes generated build files. That temporary config was removed. The clean reviewer must run the normal type command. This report does not call the failed normal command green.

Native proof uses the retained Android APK and real app on the isolated emulator, with real local Auth, database and edge service. The served maps match the changed source. Guest IPv4 and IPv6 controls allow local test traffic and reject nonlocal traffic. The new account accepted the app policies through the native checkbox and Continue. Persisted times are recorded. The fixture adds only local baseline shape. It is not a hosted migration.

Setup failures remain in raw records and setup-limits.json. Two final-reload user message rows exist. No single-message or duplicate-click proof is claimed. The final card opened the task panel. Root opened the removal review from that panel. Do not count this as proof that the card opened the review directly. No content-backed task, pending reminder, French/Arabic repeat, landscape, physical device or iOS VoiceOver was qualified here. Audio intelligibility was not independently judged.

Native criterion 8 remains INCOMPLETE. Impeccable stays at 3.9.1. Integration, remote branches and PR state remain unchanged.

The full raw records and private setup remain in this worktree. The tracked evidence is a bounded selection with hashes. The continuation found no retained native, Metro, local-server or test process. Docker is stopped, so the current owned container and volume inventory is unqueried. The emulator is stopped. The final guest TalkBack state and preferences were not restored before interruption. The original guest preferences and data remain for a later verifier. Do not report complete native cleanup.

COMPANION_NATIVE_ACCESSIBILITY_359_R1_DONE
