# Native layout correction R2

S1 and S2 are corrected in the owned candidate. This report supplies bounded local iOS proof. It does not accept #359, a platform accessibility criterion, or a release.

Worktree: `/Users/savargupta/.t3/worktrees/Unify/t3-12e53450`.
Branch: `t3/companion-native-layout-359`.
Code commit: `dee8d770323f9082f1aaf830d3de256eb030c01e`.
Code tree: `3607ff971d330559f4fc22ce28c236d397d009e1`.
The following evidence commit contains this report. The return message identifies its final HEAD and tree.

The starting commit `03b3a50d2e4022d3bd288c9b4a5e242873bf97d3` remains an ancestor. All earlier implementation commits and R1 evidence remain. No checkout, reset, stash, child agent, provider change, push, or integration write was used. Impeccable 3.9.1 was retained.

## Corrections and regression tests

S1: The screen no longer keys the container above `MessageWithSources` by text scale. The component retains the source disclosure, selected source, and open context panel. `LiveText` replaces only the native Text element when its scale key changes. This lets native text measure again while the component and controls remain mounted.

The real rendered caller test opens both the source list and context panel. It changes text scale without replacing the screen. It checks the same controls, open panel, source title, composer draft, and focus calls. No resize causes a focus-return call. An explicit close causes one call. This tests focus wiring through a native boundary mock. It does not establish observed VoiceOver focus.

S2: The task sheet, context descendants, and directly affected message/card descendants use `LiveText`. The waiting TextInput stays mounted. Its minimum height follows the current font scale. The rendered caller test retains the same sheet, task row, selected waiting state, waiting input, waiting draft, and composer across size changes. It checks replacement of native heading/row text and the increased waiting-input minimum height. It makes no service write.

The old mocked message component was replaced with the real `MessageWithSources`, `MarkdownText`, `ContextSummary`, and `CompanionContextSheet`. Only native boundaries and the animated sheet wrapper are controlled in the test. The earlier large-text assertions remain.

TDD sequence, with raw logs under `logs/`:

- `s1-red.log`: The new real caller test failed before the S1 fix. Eighteen other tests passed.
- `s1-green-3.log`: All 19 tests passed after the fix. The initial green command used the wrong directory. Two later attempts exposed the test query's hidden-background handling. Those failures remain. The query now uses the label API with `includeHiddenElements` for the retained opener behind the modal.
- `s2-red.log`: The new heading-measurement assertion failed before the S2 fix. Nineteen other tests passed.
- `s2-green-2.log`: All 20 tests passed after the fix. The first green attempt typed the composer before authentication settled. The test now waits for the real task entry before it types. That failure remains.

The red tests precede their respective fixes. The final source-byte and capture assertions are later verification. They are not presented as pre-fix tests.

## Direct native observations

Device: `unify-layout359-r1`, `A54D1945-3A80-4584-BBD0-AAD229FF3102`, iPhone 17 simulator, iOS 26.5, 402 by 874 points, portrait. The retained Debug build used local services and a controlled account. No model request, hosted login, paid build, or external source link was used.

`native-ui-ledger.json` records the MobileBuildMCP actions and capture results. `capture.py` saves actual screenshots and native AX trees through the installed AXe engine. Each capture has a system text-category readback. `native-validation.json` holds the machine-checked geometry and values. `verify_evidence.py` can check the retained observations without starting the app.

S1 English: `b02-en-context-default` to `b03-en-context-live-xxxl` changes `large` to standard `extra-extra-extra-large` with the context sheet open. Its heading grows from 26 to 35.33 points. The 48 by 48 point close control remains. The panel stays open. After explicit close, `b05-en-expanded-sources-visible` shows the expanded source title and unchanged `R2 retained composer` value.

S1 French: `c07-french-context-default` to `c08-french-context-live-xxxl` repeats the live transition with the panel open. The title and content measure again. `c09-french-context-closed` records explicit close, retained source disclosure, and the same composer. The source row is off screen in c09. The earlier c06 capture shows the expanded source list in French.

S2 English: `b08-en-task-list-medium` to `b09-en-task-list-live-axxxxl` changes `accessibility-medium` to `accessibility-extra-extra-extra-large` with the task sheet open. The heading grows from 43 to 257.33 points. Both task rows grow from about 90.33 to 234.67 points. The title and rows appear without the old clipped measurements. No reopen or app restart occurs in the transition.

S2 French: `c10-french-task-list-medium` to `c11-french-task-list-live-axxxxl` repeats the same retained-sheet transition. The longer French heading grows from 86 to 257.33 points. Both rows grow and remain below the heading. The task names are the controlled account's saved English names. The sheet controls and status text use French.

Selected waiting task: b11 to b12 and c13 to c14 retain the same selected waiting task, waiting draft, and composer through the size change. Native input continues without a tap or refocus in b13 and c15. The English value becomes `R2 waiting for provider continued`. The French keyboard had already corrected the intended test word before resizing. The actual value `R2 attempts du fournisseur` remains unchanged during resizing and then becomes `R2 attempts du fournisseur suite`. The literal mismatch and corrected value readback remain in `logs/c15-input-literal-mismatch.txt` and `logs/c15-retention-readback.json`.

`b15-en-waiting-visible-large.png` shows the English waiting field with the full value and caret at the large size. The French value is confirmed by native input/readback after resizing, but c17 scrolls below the field. It is not a visible-field proof. The captures named `keyboard` contain keyboard nodes below the visible screen. They do not establish a fresh visible software-keyboard layout pass. Native hardware input and continued first-responder input are observed.

N1 remains: c19 to c20 changes the French empty screen from AX XXXL to AX medium. The task entry ends before the welcome text begins. e04 confirms the same separation after English and default text size are restored. d06 also opens the task sheet from the empty screen through its native entry.

Reduce Motion: d03 shows the setting off. d04 shows it on, with native preference readback 1. A separate app restart follows the completed English and French binding transitions. With Reduce Motion enabled, d06 to d07 opens and resizes the retained task sheet. The raw video `native/d05-reduced-motion.mp4` includes startup and the task path. It also includes a development startup error overlay before the task path. It is not a motion audit or a clean release recording. d10 and the preference readback confirm restoration to 0.

No app restart occurs within any b02/b03, b08/b09, b11/b12/b13, c07/c08, c10/c11, c13/c14/c15, or d06/d07 binding sequence.

## Required gates

All commands completed naturally on the code commit. Logs are retained.

- Focused caller tests: 20 passed.
- `npm run test:ci`: Main run has 140 passed suites and one skipped suite. It has 1479 passed tests and 16 skipped tests. The separate DST run has two passed suites and 13 passed tests. These are separate distributions.
- `npm run typecheck`: exit 0.
- `npm run check-i18n`: exit 0.
- Changed-file ESLint: exit 0, zero errors and 11 warnings in the test file. Warnings concern imports and `require` use.
- iOS and Android Expo export: exit 0. This proves bundle generation. It does not prove Android rendering.
- Served Metro source bytes: all 12 changed runtime files match their worktree SHA-256 values at code commit `dee8d770`. `served-source-proof.json` records each path and hash. The full source map is retained locally and excluded from the evidence commit.
- Final native observation assertions: pass. These check the saved observations, current runtime source hashes, retained panel/draft state, text bounds, and empty-entry separation. They do not repeat a native interaction.

## Retained failures and limits

Three Maestro attempts stopped with SIGTERM and exit 143 before native input. Thread dumps show Android discovery blocked on another worker's emulator console, even with the explicit iOS platform and owned UDID. The other emulator was not changed. The attempts, YAML, empty logs, thread dumps, and discovery diagnostics remain. MobileBuildMCP and its installed AXe engine then drove only the owned iOS simulator.

The UI action ledger retains expired-reference and unsettled-capture results. Early captures taken before navigation settled are not used as final screen proof. d01 and d08 show the app before Settings settled. e01 records an unmatched exact-label attempt during cleanup. e02 records a modal transition. The final e04 snapshot verifies restoration. A first run of `verify_evidence.py` named a nonexistent c15 capture; the filename was corrected before the passing run. The input assertion mismatch and early test failures remain distinct from product failures.

VoiceOver focus traversal, TalkBack, Android native rendering, physical-device behavior, RTL layout, and release qualification remain incomplete. The app is portrait-only. No landscape rendering is claimed. The fresh visible software-keyboard check and a visible French waiting field after resizing remain incomplete. This report does not claim ticket or native accessibility acceptance.

## Integration and cleanup

`pre-evidence-identity.json` records clean candidate and integration states before this evidence commit. Mobile integration remains `68984d18c534cb870b1d2f41a8fe823625017976`, tree `1017aae91c087435bcff18b18247075c1ef56aaa`. Web integration is `edcc47a3f9003c6eacb4f2a3c02da6039d9e9bec`, tree `048a90ac105afd411d9b865bdcd03cc93abe3b58`. Its diff from the supplied web pin is empty for `supabase/functions/companion-actions` and `supabase/functions/rag-query/lib`. No integration checkout was changed.

`fixture-restored.json` confirms full-row equality with the saved synthetic message 4 before the temporary source/context fixture. No waiting reason or task change was saved. English, default `large` text, and Reduce Motion off were restored through the owned native setup.

`cleanup.json` confirms no listener on the owned API, DB, shadow, inspector, content, Metro, or analytics ports. There are no remaining containers for `unify-native-layout-359-r1`. The simulator is shut down. Metro, analytics sink, forwarder, and recorder are stopped. Supabase stopped with backup enabled. Its database and edge-runtime volumes remain. The Debug build, stack files, screenshots, and old R1 evidence remain for review. No #367 resource was stopped or changed.

The evidence commit excludes exported bundles, the full source map, and the raw stack-start log that contains disposable local auth keys. The redacted stack-start log is included. The raw files remain local. `evidence-manifest.json` lists hashes for the selected committed evidence, excluding the manifest itself.

The source diff passed the whitespace check before the evidence was staged. The whole evidence diff reports whitespace in preserved raw diagnostic logs. The check passes when those logs are excluded. Their bytes were retained.

HANDOFF: COMPANION_NATIVE_LAYOUT_R2_CORRECTION_DONE
