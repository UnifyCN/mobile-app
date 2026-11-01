The code correction passes the final local checks. It needs independent review and fresh native validation. It is not native acceptance.

Findings and fixed behavior:

- N01: The task removal section uses the existing LiveText component. A live text-size change replaces only each native Text node. The panel and review retain their state. Fresh native geometry and focus checks remain required.
- N02: One draft belongs to the active account session. History selection, New conversation, and a same-account screen remount retain it. Send clears it. An account change or observed sign-out clears it. A restarted session hides the stored text until its owner is known. A token refresh keeps it. Text typed while the first session read is pending can remain after that same session resolves.
- N03: The welcome container and its sibling disclaimer no longer share the font-scale key. LiveText supplies the key at each native text node. The welcome container remains mounted.

N02 uses the accepted web draft policy: one draft per active account. The native report proposed a draft per conversation. The spec requires preservation through navigation and permits discard only after send, clear, or account reset. The account policy keeps the same text through a change of conversation.

A delayed send failure can restore a question only while the same account session remains active and the cleared draft has no later edit. The current question and its input origin stay together. The store is in memory. There is no disk storage or network request in the new hook.

Test boundaries are the real rendered Companion caller with the existing scripted service/auth inputs. These are the approved client acceptance boundaries in SPEC.md lines 161-165. The native removal label needs a rendered iOS check. A Jest result cannot prove native clipping, native focus, or VoiceOver.

Test order:

1. The first four N02/N03 cases were added before the product edit. All four failed at assertions on the unchanged base. The full raw record is native-red.log.
2. The first correction passed the three draft cases plus three account controls. The separate three-file run passed 42 cases, including the duplicate-key case after its fix.
3. Five further draft cases were added after the first correction. Four were controls. One exposed a late failed send that replaced a newer draft. That case failed at an assertion before the late-result guard. All eight N02 cases then passed.
4. The four-file regression run passed 54 cases. Counts overlap with earlier runs.
5. Three deliberate hook faults each failed at assertions: retaining another account's text, clearing on unmount, and replacing a later draft after a send failure. The source was restored byte for byte after every run. See mutation-results.json.

No earlier assertion was relaxed. The existing screen helper now accepts route changes and an auth-session read under test control. The mocked Send control uses the same control lookup as the retained ownership tests. Existing asynchronous React act warnings remain in the raw results.

No native, service, hosted, live model, Android, or screen-reader check has run for this correction. The retained original Android task, steps, plan and earlier evidence remain outside this worktree. The integration and reminder candidates are unchanged.

Final local checks: npm run test:ci exits naturally with 0 in 55.619 seconds. Main: 144 passed suites, one skipped; 1,518 passed tests, 23 skipped. DST: two suites and 13 tests passed. TypeScript, translation parity, full lint, changed-file lint, and both bundle exports exit 0. Full lint has 85 warnings and no errors. Changed-file lint has ten warnings and no errors. Bundle export is not native workflow proof.

The complete final 16-case caller file also ran on the unchanged base product files. Six cases failed at assertions and ten controls passed. The new hook was present but unused by that base screen. The original product bytes were restored exactly after this check. See final-baseline-result.json. The full local gates ran before that byte-restored baseline check; source-inputs.json verifies the same final source bytes.

Each saved log is compressed without byte changes. compressed-logs.json records its original byte count and SHA-256. These logs preserve all setup warnings and failures.
