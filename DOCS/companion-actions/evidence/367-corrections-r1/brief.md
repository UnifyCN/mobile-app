HANDOFF: COMPANION_367_CORRECTIONS_R1_READY

# #367 plan-effect serialization and root announcement verification

Implementation continuation on Claude Personal Opus as the user selected. Read
review-367-r1.md, ticket-367.md, SPEC.md, GLOSSARY.md and reviewed-prototype.html in this
directory. Read source DOCS/companion-actions/367-task-remove.md and evidence/367/HANDOFF.md.
Use TDD. No children, PR/issue/watch/push/integration edits, hosted mutation/deploy, paid
service, live model or instruction/skill edit. Keep direction B and all seven locales.

The root fixed the small S2 announcement code in isolated mobile source
/Users/savargupta/.t3/worktrees/Unify/t3-9fce36e0, branch t3/companion-367-implementation,
HEAD a429d337dd917a31e39a3053fa56a60faa4da2c1,
tree 4b6bef6f45cd460ff7bf4c9bc57bab87ef46a931. Source is clean and becomes immutable.
Web source /tmp/unify-merge-361-web, branch t3/companion-367-implementation-web,
HEAD 9c48776abda3b46f468b8b4599602f43c5e07cc1,
tree 5a3568be96ea919837055ed9be53df8392da2ac7, is clean and is explicitly reassigned to you.
Use your T3-created primary and assigned existing secondary only. Do not make a checkout.
Preserve source commits and the latest accepted integration. If branches diverge, verify
parents and merge both into your own checkout, not an integration root. Never reset/stash.

S1 [blocker]: the review's authenticated interleaving saves and publicly reads a new plan
reference while removal is paused after its effect checks. The old removal then commits
with plans:[] in its receipt. Order relevant plan-reference writes with the removal effect
check and commit. Either serialization order can be valid; a previously saved relevant
plan change must be reviewed before removal. Preserve a consistent lock order and unrelated
task/account concurrency. Do not introduce account-wide serialization or a new framework
without evidence it is needed. Test the actual plan writer and removal boundary concurrently,
with observed lock waits/intermediate reads. Do not infer commit order from HTTP reply order.
Retained reproduction and report are in t3-457f38cc/DOCS/companion-actions/evidence/review-367-r1/.
Read only; do not modify that evidence. Write permanent binding red/green checks before fixes.

S2 [should]: root now selects the named removal or restore result in TaskStatePanel's
announcement API call. The existing per-operation guard remains. State operations keep
the state announcement. The real-stack mobile case now requires no result announcement
for Cancel and one named removal plus one named restore. Root typecheck/lint pass;25
existing state-control cases pass. The new real-stack assertions have NOT run on the root
fix. Root did not repeat the R1 database RED; its independent supplied RED excerpt/result
are in evidence/367-root-announcement-r1/. Verify the root test with real local persistence,
plus the state positive control. Do not claim root green or a full root TDD cycle. These
API assertions are not observed VoiceOver/TalkBack or native focus proof.

The dedicated #365 merger integrated and the root published mobile68984d18 and web21df0701.
Read actual integration tips/state before starting and before final return. Merge only accepted
integration changes into both own branches. Preserve #365 command/field/reason receipts,
#364 plans and #366 steps. #367 replaces eight shared SQL functions after #365 in timestamp
order. Reconcile the bodies and reverse rollbacks so all accepted behavior survives actual
chronological apply. Do not hide a dropped function behind a manual test order. #370 is
unreviewed; do not import it. Do not rewrite accepted migration identities or historical
proof. Any necessary pending SQL changes and cross-repo mirrors must be byte-identical.

Use own project unify-remove-367-corrections-r1, API61711 DB61712 shadow61713 inspector61714
content3260 browser3210. Check ports and project/workdir labels. Read Supabase skill/current
help/changelog before writes. Set BOTH explicit owned DB/REST container names. No default
361containers, concurrent reset/client tests, global process cleanup or Docker restart.
Keep copied Deno sources out of Next app type inputs. Restore temporary config exactly.
Run relevant full final service, mobile CI and web test/build gates after a real composition.
Native exports remain bundling only. Preserve earlier twelve full web lint errors; add none.

All new writes stay within your two owned repos. Copy this brief into primary
DOCS/companion-actions/evidence/367-corrections-r1/, grep READY and consume only that copy.
Do not write canonical /tmp state. Commit clean candidates and handoff with full pins,
actual branches, integration ancestry, S1/S2 ledger, raw failures/test order, gates and
proof limits. Remove only own resources. Root will arrange fresh scoped round2 review.
End with absolute handoff path and COMPANION_367_CORRECTIONS_R1_DONE. No acceptance claim.
