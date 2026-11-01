HANDOFF: COMPANION_365_CORRECTIONS_R1_CONSUMED

# #365 command and receipt corrections

You are the implementation worker for two remaining #365 behavior findings. Use Claude
Second Opus as selected. Do the work yourself. Start no children. The root has fixed the
small receipt-history finding and restored the missing test setting. Preserve those changes.
The user invoked implement-spec and full-send for the entire #359 graph on mobile and web.
This is implementation, not acceptance. Do not push, edit PRs/issues, watch, deploy, change
hosted data, start paid services, call a live model, or change instruction/skill files.

Read /tmp/unify-companion-359/review-365-r1.md and review-365-r1-appendix.md, SPEC.md,
ticket-365.md, GLOSSARY.md, reviewed-prototype.html and handoff-365-r1.md. Read the source
decision and evidence files at DOCS/companion-actions/365-task-edits.md and evidence/365/.
Use the tdd skill. The authorized test boundaries are the authenticated shared action
service and the smaller rendered mobile/web layer. Real disposable database and runtime
checks must state their proof limits. No new permission question is needed for these checks.

## Ownership and exact starting pins

Use your T3-created mobile primary. Do not create another checkout in shell. The root-owned
mobile source /Users/savargupta/.t3/worktrees/Unify/t3-9f078e30 is now immutable. Its branch is
t3/companion-365-r1-implementation, HEAD f19298f5493e16a7206f41fd369506638447712d,
tree 70e39964812af5a33936fe2df52361e65ebd5e5b, parent 34a3e677. Verify its identity and
cleanliness. Read the primary's actual start before changing it. If that HEAD is an ancestor
of this candidate, fast-forward to it after the separate ancestry check. If T3 starts your
primary at accepted integration e30c1902 (or a later accepted integration), it can contain
plans that the standalone candidate lacks. In that case, verify both parents and common
accepted ancestry, then merge f19298f5 into your own primary and preserve both sides. Record
the actual composition and run affected gates. Never reset, stash, discard changes or switch
a shared checkout. Do not ask the user to resolve routine merge choices within this scope.

The existing web secondary /tmp/unify-review-actions-361-web-r5-deno-candidate-9d05 is explicitly
reassigned to you. Branch feat/companion-task-edit-365-r1, HEAD
00ff1c4c68b039e1371d6f2df64c7b6d1fd7fba7, tree 7ace0aaea384d9d78bedf058774b79791a5d0259,
parent 02802a15. It is clean. The old implementation worker is held. The completed reviewer
has been stopped with task_cancel. The root will make no further source writes there.
Verify branch, HEAD, tree and status before use. No additional web checkout.

Other active workers own /tmp/unify-merge-361-web (#367) and
/tmp/unify-review-actions-361-web-r5-deno-base-9d05 (#370). Do not touch them or their daemons.
Integration roots and shared Github roots are read-only for you.

## Root corrections already present

S365-003: a command card keeps its original receipt values. For the same operation identity,
it updates only current, undoable and undoneBy from a fresh conversation-actions read.
The new mounted test on each client performs two renames. It waits until the query cache says
the first receipt is historical. It requires the historical notice and the original saved
title and field values. It failed by assertion on each unchanged candidate. Six mounted
task-edit tests per platform now pass with natural exit 0. Types and changed-file lint pass.
An initial whole-receipt replacement exposed the stand-in returning a current task title;
those failed attempts are preserved. Do not weaken the final immutable-value assertions.

T365-001: the root restored the five content-fixture secret lines in the web test config
from accepted #366. No local stack ran during the root correction. This still requires a
fresh-stack run with the committed configuration, apart from explicit project/port isolation.
Do not silently repair other settings only in the disposable copy and call the candidate green.

Root evidence is committed in mobile DOCS/companion-actions/evidence/365-root-r1/ with manifest,
results and raw compressed failures. Web docs/evidence/365-root-r1/README.md points to it.
These are partial corrections, not accepted candidates.

## Remaining findings

S365-001 [blocker]: the quoted-value expression in web companion-actions/commands.ts consumes
a second command. The literal input is:
Rename task "Phone" to "Mobile" and rename task "Bank" to "Credit union"
Interpret currently returns an edit. Authenticated apply saves the compound tail as Phone's
title. Narrow the documented one-command grammar so this ambiguous input asks a question and
writes nothing. Test through interpret and apply. Include normal quoted commands and the
documented seven-language examples as positive controls. Do not build a general NLU system
or expand which messages authorize writes. Do not merely hide the UI interpretation while
the direct-command apply path still authorizes a forged parsed operation.

S365-002 [should]: a state command that changes a waiting reason saves the reason but the
receipt omits it. Friday to Monday shows only Waiting to Waiting. Record immutable before
and after reason values in the receipt, return them through the actual client contracts,
and display them on both platforms. Keep historical values after a later edit and through
lookup/replay/Undo. Preserve existing receipts that lack the new optional metadata. Keep
private reason text out of analytics. Use the existing receipt and localized text structures;
do not introduce a second receipt system. Add real translations only if new copy is needed.

Retained review reproduction sources are read-only in
/Users/savargupta/.t3/worktrees/Unify/t3-c3b95719/DOCS/companion-actions/evidence/review-365-r1/:
review_adversarial_test.ts.txt, taskEdit.mobile-review.test.tsx.txt,
TaskEdit.historical-confirmed.test.tsx.txt and TaskEdit.review365.test.tsx.txt.
Use permanent focused regressions. Run unchanged-code RED before each remaining fix. Report
test-first and implementation-first runs honestly. A timeout, setup error or survivor is not
evidence that a test detects the defect.

## Composition with accepted plans and steps

Before final handoff, read actual integration tips and state.json. Current accepted tips are
mobile e30c1902280f3b127ff6231358d4d6883686b748, web
269a5b9334caac72a32e6a340bf9b3a37b247c26. Merge the latest accepted integration into both
of your branches before returning. Preserve #364 plans, #366 steps, local fonts and the
accepted rollback schema-cache test correction. Do not import unreviewed #367/#370 or main
changes absent from integration. No writes to integration roots.

Both #365 migration mirrors and rollback mirrors must remain byte-identical. They are pending,
undeployed migrations. Verify actual chronological apply and reverse rollback composition.
Do not use a handcrafted test order that hides function replacement. Plan code is additive;
check existing step functions and registry entries remain available after your migration.

## Isolated verification

Use only owned project unify-edits-365-corrections-r1 with API61611, DB61612, shadow61613,
inspector61614, content3240 and browser3194. Check all ports and Docker project/workdir labels.
Read the Supabase skill, current changelog, command help and repository platform quirks before
database writes. No upgrade, hosted write or Docker Desktop restart. Set BOTH
ACTIONS_DB_CONTAINER and ACTIONS_REST_CONTAINER to this project before mounted mobile runs.
Never use default 361 container names. Other workers have active stacks; do not stop them.

Run the committed service configuration from a fresh owned stack. Only documented project/port
isolation is permitted in the copy. Keep copied Deno sources outside app TypeScript inputs,
or remove them before app types/build. Do not change tsconfig/lint settings to hide them.
Restore test config exactly before commits. Run appropriate final service/edge checks, mobile
test:ci with natural exit, types/lint/i18n/native exports, web npm test and build/types/i18n,
and changed-file lint. Full web lint currently has twelve earlier integration errors. A
new error is not part of that baseline. Preserve raw failures and correct counts.

Verify the changed web receipt controls in headless Chromium with the actual page/components,
keyboard, narrow view, 200% zoom and drafts where relevant. Existing UI direction B is fixed.
No redesign or new navigation. #370 owns native simulator work now; do not use its simulator,
Metro or native build. Record native and observed screen-reader gaps without claiming that
bundle export or Jest proves them. The final qualification ticket owns full release proof.

## Output and handoff

All writes stay inside your two owned repositories. Copy this brief into primary
DOCS/companion-actions/evidence/365-corrections-r1/, verify READY and consume only that copy.
Do not write canonical /tmp task state or handoffs. Root copies your final report.

Commit clean candidates on both branches. Include actual paths, verified branch names, full
HEAD/tree/base pins, integration ancestry, the four-ID findings ledger, test order, raw
failures, final counts and explicit supplied/local/native/hosted proof limits. Remove only
your own stack/process resources. Keep excluded roots unchanged. End with the absolute handoff
path inside your primary and COMPANION_365_CORRECTIONS_R1_DONE. No acceptance claim.
