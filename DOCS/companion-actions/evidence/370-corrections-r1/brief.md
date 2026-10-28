HANDOFF: COMPANION_370_SPEC_CORRECTION_CONSUMED

# #370 consent, language and native proof corrections

You are the implementation worker for the remaining substantive #370 corrections.
Use Claude Second Opus as selected. Do the work yourself, no children. The root fixes small
review findings; it has applied the two web Standards corrections. Your work is the consent
state correction across both clients, the two shared command-classification defects, and
bounded native input/accessibility proof. No redesign, feature expansion or general NLU engine.

Read /tmp/unify-companion-359/review-370-r1.md and review-370-r1-appendix.md, then SPEC.md,
ticket-370.md, GLOSSARY.md, reviewed-prototype.html and handoff-370-r1.md in the same directory.
Read the candidate's DOCS/companion-actions/370-personal-details.md and evidence/370/README.md.
The user invoked implement-spec and full-send. Required isolated browser/simulator/device
methods are authorized, no repeated permission. No production/hosted write/deploy, paid
resource or live model. No children, PR/issue/watch/push/integration changes or instruction edits.

## Ownership and work-in-progress pins

Use the T3-created mobile primary and the explicitly reassigned existing web checkout.
Do not create a checkout in shell. Verify branch, HEAD, tree, clean status and ancestry,
read the result, then fast-forward. Never reset/stash/discard or switch a shared checkout.

Mobile WIP72cce9f3fdb2d6f5124cb04918bf38daa1d0d112, treef21db5fa528c8ebcb559b778889606d6b57cf8ef,
on original68056674a919dd5c84dd6c8d0c7ffca4daeb75cd. Root-owned source
/Users/savargupta/.t3/worktrees/Unify/t3-be2445cb on t3/companion-implement-370 is now immutable.
Fast-forward your clean T3 primary to72cce9f3 only if its HEAD is an ancestor.

Web WIPfa56b9841aeb1bc74a2d72845e042609eba4bdb2, treeecb0e21ee90780d76018515932f8328806c44267,
on original33a6be08fad57908da5d804e23ca843fbb52e9c3. Existing
/tmp/unify-review-actions-361-web-r5-deno-base-9d05 on feat/companion-saved-details-370-r1 is
explicitly reassigned from the root to you. It is committed and clean atfa56b984. No prior
owner remains active. Use it as your owned secondary; no new web checkout.

These WIP commits deliberately contain failing S370-1 tests. They are not review candidates.
Root added the exact SQL current_detail field to both stand-ins (id,text,revision,removed),
then added one per-client consent regression. Both fail at the wrong-current-text assertion.
The final versions also assert the creation receipt still shows Friday. Cancel must preserve
Saturday, and explicit new confirmation must name revision2 and remove Saturday. Do not
weaken these tests. Logs/results are /tmp/unify-companion-359/root-correct-370-r1/:
s370-1-*-red-recheck.log and result.json. Earlier red logs are retained too.

Root T370-1: saving/checking now use the existing loading-delayed class, keyed by phase to
restart the delay. Actual300ms browser timing still needs verification. Root T370-2: the
local Action passes event.detail===0; editor and removal disclosures use shared Reveal instant
for keyboard activation. The new editor keyboard case failed before; after it,8selected web
cases pass,1deliberately skipped S370-1 case. Web types and changed-file lint pass. These are
rendered declarations/behavior, not a physical browser proof. Preserve these fixes, verify
all relevant disclosure paths and actual timing with the retained reviewer browser checks.

## Required fixes

S370-1 [blocker]: forward the server current_detail through the real client/store. It has
only detail_id,text,revision,removed; parseSavedDetail expects other fields and cannot be used
unchanged. Show the verified current text for compensating removal, keep the historical
receipt text separate, and permit approval only when identity/revision/state match the shown
operation. If a newer known read or missing/mismatched current value prevents verification,
keep approval disabled. The server already revision-checks; do not add a new backend framework.
Test Cancel, exact new approval, a newer edit while review is open, and absent/mismatched
metadata through actual clients. Retain original receipt identity/text. No SQL change is
expected unless a concrete binding defect requires one.

S370-2 [should]: the clear interpreter need for work-permit appointments is not an asserted
immigration status. Narrow the guard at the supported statement boundary; preserve true-status
refusals and the authoritative profile rule. Use the concrete reproduction and relevant
supported-language controls. Do not replace it with an unbounded language parser.

S370-3 [should]: the actual Arabic help example uses أنني. The parser removes only أن and
saves broken ني. Handle the attached first-person form without losing its meaning. Test the
literal localized examples through interpret and apply, not only the pure parser. Preserve
all existing documented command examples and unclear-command controls.

Use the tdd skill for each remaining vertical slice. Root red tests already bind S370-1.
Write and run binding S370-2/S370-3 tests before fixing those. Retained review test sources
are in /Users/savargupta/.t3/worktrees/Unify/t3-81be7e12/DOCS/companion-actions/evidence/review-370-r1/.
No agent is active there. Read only; do not edit that evidence. Report test-first versus
implementation-first honestly. No timeout/crash/survivor is sensitivity proof.

## Native and verification

The missing proof is native input, keyboard/focus, text scaling and accessibility for added
controls. Root verified maestro at /opt/homebrew/bin/maestro and iOS26.5/iPhone17 runtimes via
xcrun simctl. No simulator was booted. xcrun simctl ui supports content_size through AX sizes.
No existing Debug bundle was found in default DerivedData or the shared ios/build path.
Discover current paths/tools with help first. Do not assume a cached app. Use only your own
simulator/build/Metro fixture and synthetic data. Do not alter existing user simulators or
shared roots. Full-send authorizes required local builds and automation, not paid EAS builds.

A native harness must render the actual production components and exercise real native text
input and controls. State exactly what services/auth are controlled. It must not contact
production or silently use a live model. Prefer actual app navigation when feasible. Capture
normal and large-text behavior, keyboard/input focus, confirmation content, targets/labels,
drafts and accessibility hierarchy. Do not call hierarchy inspection observed VoiceOver.
If an actual AT/device method is unavailable, report the concrete remaining proof and tools
tried; never fabricate a pass. Do not stop after a bundle export and call it native evidence.

For local service checks use own project unify-details-370-corrections-r1,
API61531/DB61532/shadow61533/inspector61534/content3224/browser3186. Check ports/project labels.
Read current Supabase skill/help/changelog before writes; no upgrade needed. Set both
ACTIONS_DB_CONTAINER and ACTIONS_REST_CONTAINER explicitly to your own project for client
runs. Put copied Deno sources where app types/build will not scan them, or remove before
app gates. Do not edit tsconfig/lint settings to hide a fixture. Keep env/key material out
of evidence. Run appropriate full final gates after the corrections and after merging tips.

A dedicated merger is about to integrate approved #364/#366 (mobilee30c1902, web269a5b9).
Before final handoff, read state.json and actual integration tips. Merge the latest accepted
integration into both own branches, preserving plans, steps, fonts and the root test-helper
correction. Do not import unreviewed #365 or unrelated work. A cross-repo partial tip update
must be reported rather than guessed. Re-run affected checks after a real merge. No writes
to integration roots.

## Outputs

All your writes stay within your two owned repositories. Stage this brief as a copy inside
DOCS/companion-actions/evidence/370-corrections-r1/ in your primary; grep READY and consume the
copy after work. Package root red/green records and your own evidence with explicit manifests
in version control; exclude credentials and unrelated files. Do not write canonical /tmp
state/handoffs. Root will copy your final report. Commit clean candidates on both own branches,
include actual paths/branches/HEAD/tree values, accepted integration ancestry, finding ledger,
test order, raw failures, gates, native/browser proof classes and cleanup. No acceptance claim.
End with absolute handoff path inside your primary and COMPANION_370_CORRECTIONS_R1_DONE.
