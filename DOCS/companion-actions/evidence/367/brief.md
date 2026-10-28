HANDOFF: COMPANION_367_IMPLEMENTATION_CONSUMED

# #367 confirm and recover task removal across plans and steps

You are the isolated implementation worker for ticket367 only. The user invoked
implement-spec for the whole #359 graph and full-send. Work through implementation,
appropriate tests and clean candidate commits. No children. Root owns independent review,
integration and PR work. Use TDD at the already approved seams: authenticated shared
service requests and persisted outcomes, with a small actual rendered-client layer.
No repeated test-method permission is needed. No production/hosted write/deploy, paid
resource, live model, push, PR/issue/watch/integration change or instruction/memory edit.

## Authority and scope

Read /tmp/unify-companion-359/SPEC.md, ticket-367.md, ticket-graph.json, GLOSSARY.md and
reviewed-prototype.html. The prototype hash is
eda81466e32fe553fa7b01723d1ae230fb39879359e66cae76da093cbb867c0d.
Read the current implement and tdd skills. Read applicable global/project instructions,
mobile typography contract and web design-system/MASTER.md. Preserve direction B: current
mobile bottom sheet and web overlay drawer, with existing navigation and design tokens.
This is task removal, not a new settlement workflow or reminder feature. #368 follows it.

Both blockers are now accepted and integrated: #364 settlement plans and #366 task steps.
Use local acceptance/state, not GitHub closed state. All15 tickets stay open until final
PR merge. Six integrated:360,361,362,363,364,366. #365 review and #370 correction run in other
isolated roots. Do not import their unreviewed work or edit their checkouts.

Read DOCS/companion-actions/360-compatibility-decision.md, 361-task-actions.md,
363-task-create.md, 364-plan.md, 366-steps.md and 364-366-integration.md in the accepted
mobile source. Canonical acceptance and review pointers:
/tmp/unify-companion-359/accepted-364-366-combined.md,
review-364-366-combined-r2.md and merge-364-366-recovery-r3.md in the same directory.
The C1 helper correction and twelve-error lint baseline are already integrated.

## Ownership and exact start

Use only your T3-created mobile primary and the explicitly reassigned existing web
secondary. Do not create a checkout in shell or a superrepo. Verify actual branch, HEAD,
tree, status and ancestor relation; read each check before an action. Never reset, stash,
discard unrelated work or switch a shared checkout. Report your actual path and branch.

Mobile accepted integration: e30c1902280f3b127ff6231358d4d6883686b748,
treec5c8bf6145094454f17f3b83bd0b3e38b178f6ab, branchfeat/companion-actions-359 at
/Users/savargupta/.t3/worktrees/Unify/feat-companion-actions-359. Your clean primary may
fast-forward to this exact commit only if its HEAD is an ancestor. Stop on mismatch.

Web accepted integration:269a5b9334caac72a32e6a340bf9b3a37b247c26,
tree0e5da50d8b1d1db67789f4ea58ff25a05cc4bdec. Existing /tmp/unify-merge-361-web is explicitly
reassigned from the completed, held recovery merger to you. It is clean on
t3/reconcile-companion-364-366-web at that exact accepted commit. You may rename that owned
branch for367. Do not switch it. No new web checkout. The web integration target
/Users/savargupta/.t3/worktrees/Unify-Web-App/feat-companion-actions-359 is read-only to you.

Shared roots /Users/savargupta/Github/Unify and /Users/savargupta/Github/Unify-Web-App are
read-only. Their unrelated changes must remain. Immutable accepted candidate sources are
also read-only. Only your two owned worktrees may receive code/test/config edits.

## Required behavior

Follow the entire written ticket, including focused accessibility and all7 locales.
Every task removal, whether requested by clear chat command or panel control, requires
explicit confirmation of the named task and effects on shared plans and step history.
The command can open a review; it cannot bypass confirmation. Cancel writes nothing.
Keep exact operation/revision authorization through the existing service, receipt, lookup,
same-operation retry and conflict paths. Model output never authorizes a write.

Use the approved mapping: content-backed removal uses dismissal; custom removal is
reversible soft removal and hidden from older readers. Preserve stable owner-scoped
identities, task/step/action history, and recoverable plan references. Do not infer hard
delete from prototype removal. The rejected360 soft-delete trigger broke account deletion;
do not recreate that design. Preserve existing legacy dismissal/account-deletion behavior.

Undo names its removal receipt and checks current revisions. Restore only eligible task
and plan references, keep newer edits and separately removed work, and never silently
recreate a removed task from an old message, device or refresh. Old conversations/devices
must detect removal and disable stale controls. Bind any revised removal confirmation to
current displayed values and current affected work, not historical receipt text.

Integrate lifecycle behavior so future reminder cancellation joins the same transaction.
Do not add #368 schedules, notification UI, deliveries or reminder settings in this slice.
Preserve the already accepted rule: completion/removal stops pending schedules atomically;
restoration, reopen and Undo never restart stopped schedules. Keep the rollback policy
from360. Reuse existing lifecycle functions where they meet the actual case; avoid a new
framework or speculative event bus.

Test the actual concurrent removal/edit/Undo paths in one run. Include affected plan/step
changes between review and approval where they can change the reviewed effects. Test
account boundaries, relevant versus unrelated revisions, exact Cancel, retry/lookup,
historical receipts and the restored references. Do not replace public auth/HTTP tests
with direct SQL assertions alone; use SQL only for controlled fixtures/locks or inaccessible
history. Test new client controls through their actual panels and preserve drafts/focus.

## Structure and proof discipline

The shared backend is deployed from web supabase/functions/companion-actions, separate
from rag-query and the AI allowance. Keep both clients on one typed contract and common
execution rules. Current migrations and rollbacks mirror byte-for-byte across repos.
Generate any new migration identity with supabase migration new, never guess a timestamp.
Preserve chronological apply and reverse rollback order used by deployment tooling. Do not
prove only a handcrafted test order that hides a later migration replacing shared functions.
Record shared function changes/overlaps so later accepted #365/#370 can be composed safely.

Before final handoff read state.json and actual integration tips and merge the latest
accepted integration into your own branches. Preserve plans, steps, fonts, C1 and any later
accepted sibling. Do not import unreviewed siblings. Re-run affected checks after a real
merge. No source changes to integration roots. Never mark your own ticket accepted.

State falsifiers before checks. Work one vertical slice at a time. Keep red assertion
failures separate from crashes, setup failures and timeouts. Do not count an unresolved
mutation as proof. Capture exact counts from the same selected runs and recount before
reporting. Run regular types/focused tests and full final suites once after final changes.
For TypeScript web, npm test and npm run build are required. Mobile test:ci must exit
naturally, including DST; no forceExit or passing-summary-as-completion. Preserve the known
full web lint failure (twelve earlier errors) without new diagnostics, rule or ignore edits.
Do not expand scope to unrelated lint cleanup or instruction-file migrations.

Run focused actual-browser checks for the added removal controls at narrow web/keyboard
and RTL sizes as practical. Full-send permits required native/simulator methods too. Keep
Jest/jsdom, real local database, browser, native/export and observed AT proof separate.
No bundle or declared style is a device proof. Do not defer a confirmed focus, draft or
account-isolation defect to release qualification.

For local Supabase work, read the current Supabase skill/help/changelog first. Own project
unify-actions-367-r1: API61571/DB61572/shadow61573/inspector61574/content3232/browser3190.
Use an owned Metro port8096 if needed. Check ports first. Set BOTH
ACTIONS_DB_CONTAINER=supabase_db_unify-actions-367-r1 and
ACTIONS_REST_CONTAINER=supabase_rest_unify-actions-367-r1 for every local client test.
Verify project/workdir labels before writes and cleanup. Never run defaults, another
worker's stack or Docker Desktop restart. Keep env/key material private. Put copied Deno
sources outside app TypeScript include paths, or remove them before types/build. Do not
edit tsconfig to hide a fixture. Restore temporary tracked config byte-for-byte and stop
only your own resources. Do not alter user simulators or another worker's native tools.

## Handoff

All your writes stay within owned repositories. Copy this brief to your primary
DOCS/companion-actions/evidence/367/ and verify its literal READY marker. Consume the copy
after work. Store evidence/manifests and a final handoff there; root copies canonical /tmp
records. No canonical state or handoff write. Commit both clean candidates and merge the
latest accepted tips before returning. Report actual paths/branches/HEAD/tree, ancestry,
representation decisions, function/migration order, test order, raw failures, full gates,
proof limits and cleanup. No acceptance, integration or release claim. End with the absolute
handoff path and COMPANION_367_IMPLEMENTATION_DONE. No push or PR actions.
