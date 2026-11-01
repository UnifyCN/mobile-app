HANDOFF: COMPANION_NATIVE_LAYOUT_R2_CORRECTION_CONSUMED

# Correct the two live text-size failures

Continue the existing implementation in your current owned worktree. This is a
substantive native state and layout correction. It is not a new design or ticket.
Use only Unify Codex, provider codex_aedfb650-7bcd-4660-98d3-5349e5edb462,
gpt-6.1-sol, high reasoning effort. No children or account/model fallback.
Keep Impeccable3.9.1. Do not update it or ask again.

Read the original native-layout-359-r1-brief.md, SPEC.md, reviewed-prototype.html,
review-native-layout-r1.md and review-native-layout-r1-appendix.md in this directory.
This addendum controls resource ownership, scope and the two current findings.
Do not repeat the original obsolete Personal-account instruction or delete the
transferred setup. The user authorized these local tests through full-send.

Your worktree is /Users/savargupta/.t3/worktrees/Unify/t3-12e53450, branch
t3/companion-native-layout-359. Starting HEAD is
03b3a50d2e4022d3bd288c9b4a5e242873bf97d3, tree
ed5ce5c3c40f03b2a906a401278d8e1f63e8fd4a. The root verified the full clean
status and identity. Repeat the check before editing. Retain all existing work.
The accepted integration still has HEAD68984d18c534cb870b1d2f41a8fe823625017976.
The reviewer and previous implementation are stopped. Do not make a checkout,
reset, stash, change instructions or import pending #367/#370 work.

## Written findings and binding tests

S1: index.tsx keys a container by font scale above MessageWithSources. That
component owns showSources, selectedSource and showContext. A live font change
remounts it, closes the context sheet and collapses sources. Fix the state owner,
not only a mock. Retain the owner and refresh only the text that needs measurement.
Add a rendered caller test that opens the real MessageWithSources context sheet
and source list before changing text size. Prove the same panel stays open and
its controls and focus state survive. Do not remount the screen or hide the sheet.

S2: the mounted TaskActionsSheet keeps its old measured bounds after a size
change. The title and rows clip. Reopening at the new size lays them out correctly.
Update the mounted text measurements without replacing the sheet's state owner,
selected task, waiting draft or composer. Check the context sheet descendants too:
correcting S1 must not leave a retained sheet with clipped text.

Read the review's exact native captures and state-retention.probe.test.tsx at
/Users/savargupta/.t3/worktrees/Unify/t3-b44c4583/DOCS/companion-actions/evidence/review-native-layout-r1/.
They are read-only inputs. Keep raw failures. State the falsifier before each
check. Use the TDD skill for the real caller regression. Distinguish a test
written before its fix from later mutation or regression evidence.

## Transferred native setup

The root now transfers the stopped setup back to you. Preserve it and the old
evidence. Before starting anything, inspect retained jobs, process cwd, labels and
ports. Do not duplicate a Metro, build, simulator driver or database run.
Own simulator: unify-layout359-r1, UDID A54D1945-3A80-4584-BBD0-AAD229FF3102.
Own project: unify-native-layout-359-r1. Ports: API61791, DB61792, shadow61793,
inspector61794, content3276, Metro8199, analytics61799. Use both explicit DB and
REST container names. Do not touch the #367 simulator or its 61871/8201 resources.
Read the Supabase skill and current docs/help before local writes.
Use the retained Debug build, controlled accounts and local endpoints. Verify the
served changed source bytes. No hosted login, PostHog, model, push or paid build.

Repeat default to standard XXXL with an open context sheet. Repeat accessibility
medium to AX XXXL with an open task sheet. Do not restart the app between the
binding transitions. Capture native geometry and real input. Check the selected
task, open source/context state, typed waiting reason and composer after each
transition. Include English and French. Preserve the previous N1 entry correction.
Check visible keyboard behavior and reduced motion where supported. A hierarchy
dump is not observed VoiceOver proof. Keep unavailable platform checks incomplete.
The phone app is portrait-only. Do not claim landscape app rendering from rotation.

## Completion

Keep scope to the two findings and direct affected callers. Run focused tests,
natural-exit test:ci, types, i18n, changed-file lint and both bundle exports after
the correction. Review current integration tips before return. Commit clean code
and evidence in your worktree. Do not push or write integrations, PRs or issues.
Do not accept tickets. Copy this brief into your own evidence directory and change
only that local marker to COMPANION_NATIVE_LAYOUT_R2_CORRECTION_CONSUMED.
Return exact HEAD/tree, branch, proof by finding, retained failures, limits and
resource cleanup. Stop owned processes but preserve the setup for independent
review. End with the absolute handoff and COMPANION_NATIVE_LAYOUT_R2_CORRECTION_DONE.
