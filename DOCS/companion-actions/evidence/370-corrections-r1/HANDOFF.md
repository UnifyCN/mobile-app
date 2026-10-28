# Handoff: #370 corrections r1 (S370-1, S370-2, S370-3, native proof)

A passing implementation is not ticket acceptance. Independent review must follow.

## Pins

Mobile primary: `/Users/savargupta/.t3/worktrees/Unify/t3-a768fdfa`, branch
`t3/companion-s370-spec-corrections`. Final code HEAD `4cb263c7bec0860c89c09f8c92649ddf9801c3fb`;
the evidence commit on top of it is reported by the root from `git log -1` (it changes only
this folder). Clean after the evidence commit.

Web secondary: `/tmp/unify-review-actions-361-web-r5-deno-base-9d05`, branch
`feat/companion-saved-details-370-r1`, HEAD `05ab5299deeea43eee892e11ef1e98ff31f16d8b`,
tree `a9e28ef5492b83708fae1984597472bda5a70e55`, clean.

Accepted integration (read at return, unchanged): mobile
`e30c1902280f3b127ff6231358d4d6883686b748`, web `269a5b9334caac72a32e6a340bf9b3a37b247c26`.
Both are ancestors of the final heads (merge commits mobile `f723e1f8`, web `2c7f81c`). No
unreviewed sibling (#365 or other) was imported.

New commits since resume. Mobile: `10d82ded` (binding tests), `f723e1f8` (merge),
`4cb263c7` (dead-code removal). Web: `582c17c` (English binding case), `73e1a4b` (binding
tests), `2c7f81c` (merge), `05ab529` (dead-code removal). Earlier commits of this task:
mobile `af3c39a5`, `af6fc3e2`; web `3a76bd0`, `a97e21b`. Root commits `72cce9f3`/`fa56b98`
are preserved.

## Finding ledger

| ID | State | Where |
|---|---|---|
| S370-1 blocker | fixed | client and store carry `current_detail` (`detail_id`, `text`, `revision`, `removed`); the review and confirmation name the current text; the receipt keeps its historical text; approval needs identity, revision and state to match and no newer read to contradict; the store refuses on its own. Mobile af3c39a5, web 3a76bd0, binding tests 10d82ded/73e1a4b. No SQL change. |
| S370-2 should | fixed | a status word counts only in a per-language statement frame; "I need an interpreter for work permit appointments" saves; true status statements still go to the profile. Web a97e21b, 582c17c. |
| S370-3 should | fixed | Arabic "تذكر أنني …" saves "أنا …" (أننا as نحن); other attached forms ask. Literal locale help examples tested through interpret and apply. Web a97e21b. |
| T370-1 (root) | verified | real browser: saving and checking hidden before 300 ms, then visible (5 + 2 runs pass; fault W10 caught). |
| T370-2 (root) | verified | real browser: editor (Enter, Space), removal confirmation and Undo-of-save confirmation open without motion by keyboard and with the shared motion by pointer (fault W11 caught). |
| Merge | done | mobile and web conflicts were unions; extraction order is plan, task, steps, detail; every locale key of both sides kept (checked by script). |
| Cleanup | done | the S370-1 change left `DetailPhase`'s `text` prop and the removed-text draft without readers (web lint warning); removed on both clients. |
| N1 new, outside #370 | open, not fixed | at accessibility text sizes the empty Companion screen's welcome text overlaps the "Your tasks" card, and a tap on the card does not open the sheet (`native/n25*`); the same tap opens it at the default size (`native/n26`). In a conversation the card is not overlapped (`native/n30`). Not in this ticket's scope. |
| N2 observation | open | at the largest size (AX XXXL) the Companion screen's starters, header and tab labels overflow (`native/n24`). After a live text-size change, already-mounted text clips until a relaunch (`native/n22*`, `n27`, `n28`). Saved details itself lays out at AX XXXL (`n20`, `n21`). |
| N3 observation | open | at `accessibility-medium` with the keyboard up the sheet is at full height and the keyboard covers Save change and Cancel until the user scrolls; one scroll brings them into view (`n31`, `n33`). |

## Gates (final heads)

Mobile (4cb263c7): `tsc --noEmit` 0; `npm run check-i18n` OK (1978 keys per locale);
`npm run test:ci` 1471 passed, 17 skipped (139 suites, 1 skipped), DST 13 passed; eslint on
the 15 files changed from e30c1902: 0 errors, 22 warnings, all earlier than this work
(`require()` imports in tests, an unused `act` from #361, an unused `usage` from 2025-11).
Real local stack `companionActionsLocalStack` on the merged tree: 5 passed.

Web (05ab529): `tsc --noEmit` 0 (after `run_checks.py clean`; with the copied Deno sources in
`build/` it reported 135 errors, all in that copy); `npm run check-i18n` OK (2656 keys);
`npm test` 698 passed, 9 skipped (59 files); `npm run build` 0; full `eslint` exit 1 with 12
errors and 1 warning: the 12 earlier errors the acceptance record names, and the warning is in
an ignored copied handler under `supabase/tests/companion-actions/supabase/functions/`
(present before this task). My one new warning was removed.

Backend on the merged web tree: all 22 companion-actions test files against the local stack,
a reset before each: 172 passed, 0 failed (`b-backend-all-merged.log.gz`; its first attempt
crashed in my own `sync` setup and is kept as `run1-setup-crash`). Function-level Deno
(`supabase/functions/rag-query`, `companion-actions`): 230 passed. Real browser check on the
merged tree: 23 of 23, two runs.

## Raw failures kept

- Browser runs 1 and 3 before the merge: "controls at least 44px tall" measured an empty
  list (the restored row comes back with the re-read after Undo). The harness now waits for
  the restored row; runs 2, 4, 5 and both merged runs pass. This is a harness race, but the
  brief disappearance of the row after Undo is product behavior from #370, not changed here.
- Faults round 1: W2, W5, M3 survived; M2/M3 local runs crashed in setup. See README.
- Native setup failures (all fixed in the harness, logs kept): Metro started from the wrong
  directory and `npx` began to fetch another Expo CLI (stopped before install; no repo or
  cache change); conflicting Metro flags; stack busy during the backend suite; PostHog
  provider throws on an empty key; Reanimated assert on a second JS load in one process;
  SecureStore failed because my first build disabled signing (rebuilt with simulator ad-hoc
  signing, entitlements embedded).

## Native proof (class: simulator, real app, real native input; no observed screen reader)

Method: Expo prebuild + `xcodebuild` Debug for the iOS 26.5 simulator in an own simulator
(`unify-370c-r1`, created and deleted by this task), Maestro 2.11.0 driving the actual app
from sign-in through the Companion tab. Services: Supabase auth, PostgREST and the
`companion-actions` edge function of this worker's local stack only (API 61531), with a
synthetic `.invalid` account. Sanity used its `placeholder` project (no lessons load).
PostHog had a fake key and a loopback sink that answered 200 and kept only a request count
(37 requests; no bodies). Expo ran offline. No message was sent to Companion, so no answer
and no model call happened. Local fixture gaps were filled in my own DB only (profile
`onboarding_completed` and related columns, nullable `stage`, `conversations.updated_at`,
`messages.sources`, the shipped `messages_companion_context` migration); no product SQL
changed.

Observed natively, each with screenshot and hierarchy (`native/`) and service readback:
- S370-1 on the command card: Undo of a save, another device edits the detail, the
  confirmed stale Undo writes nothing; the receipt keeps "Fridays", is marked as changed
  since, and the review names the current "Saturdays"; its confirmation names "Saturdays";
  Cancel leaves revision 2; approval removes it (DB revision 3, removed) (`n01`-`n06`).
- Saved details panel: real detail, 44 pt Edit/Remove targets with labels naming the detail
  (`n10`); editor opens prefilled with the label "Saved detail"; tap focuses it (caret) and
  the system keyboard appears; real typing through the keyboard; the sheet moves above the
  keyboard at the default size (`n11`, `n12`); the typed draft survives closing and reopening
  the sheet and nothing is saved (`n13`); Save change writes revision 2 and names the change
  with an Undo (`n14`); removal confirmation names the detail, Cancel sends nothing, removal
  and its Undo go through the service (`n15`-`n17`).
- Text scaling: AX XXXL and accessibility-medium (panel, wrapped 77 pt controls, editor with
  keyboard, confirmation) (`n20`, `n21`, `n30`-`n33`); limits N1-N3 above.

Not proved: an observed screen reader (the simulator has no VoiceOver; the only physical
iPhone was unavailable in `devicectl`). Hierarchy dumps are not observed VoiceOver. Not
proved: Android, a release build, hosted stacks, Arabic or other locales natively, and the
#370 conflict review at large text sizes.

## Owned resources

Stopped: Metro (port 8197), the IPv4 loopback forwarder, the analytics sink (61539), all
Maestro runs. The own simulator was shut down and deleted. The text size was restored before
deletion. Kept for the reviewer: the local stack `unify-details-370-corrections-r1` (stopped
at return, volumes kept), `unify-front-end/ios/` (gitignored prebuild and DerivedData
`ios/build/dd370c`), and `build/s370c-stack/` in the web checkout (gitignored; copied Deno
sources removed by `clean`). No hosted change, deploy, paid service, live model, push, PR,
issue, watch, or integration write.

COMPANION_370_CORRECTIONS_R1_DONE
