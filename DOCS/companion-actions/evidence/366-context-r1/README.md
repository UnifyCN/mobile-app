# #366 F3 approval-context correction (r1): evidence

Scope: SPEC review r2 F3 only (`/tmp/unify-companion-359/review-366-SPEC-r2.md`). Root's S366-3
input-target fix (`e0c7184a`) is root's and is preserved unchanged; F1 (`366-parent-r1`), F2 and
S366-1/2 are earlier corrections, kept as they were. Design: `DOCS/companion-actions/366-steps.md`,
section "Approval context (review F3, correction r1)".

Starting pins: mobile `e0c7184a` (tree `65595b22`), web `2ad539ac` (tree `a57c01b4`). Changed: the
pending #366 migration (mobile authority, web byte-identical mirror), the new web test
`supabase/tests/companion-actions/steps_context_race_test.ts` (SHA-256 in `final-test-sha256.txt`),
these docs and the web tests README line. The rollback script needed no change (it already drops
the helper functions and restores the #363 `companion_recheck_proposal`). No client, edge, locale
or existing test file changed.

## What changed in SQL (3 places)

1. `companion_recheck_proposal`: for a `step_create` draft, `companion_step_parent_lock` after the
   proposal row lock and draft checks, before `companion_proposal_context`. Held to commit.
2. `companion_step_parent`: the parent lock first for custom parents too (it was content-backed
   only), then `for share` on the task row. Every step change of every task is now ordered by it.
3. `companion_apply_step` (`step.create`): the separate add lock after the parent read was removed
   (now redundant, re-entrant).

Lock order: operation lock → proposal row → step rows → parent lock → task row. Checked callers:
apply (direct, approved step/task drafts, compensation drafts), Undo (task and step receipts,
conflict path inserting a new compensation draft), prepare (parent lock, then a new row), revise and
cancel (proposal row only), legacy upsert/insert trigger and plain UPDATE (F1, unchanged). Custom
task writers (`task.set_state`, `task.remove_created`, released clients) take only the task row
and never the parent lock, so the new custom order (parent lock → `for share`) has no cycle.

## Stack and proof boundary

Own project `unify-actions-366-context-race-r1`: API 61031, DB 61032, shadow 61033, inspector
61034, content stand-in 3118, through a temporary edit of the web test `supabase/config.toml`
(restored before commit). Postgres 17, real GoTrue/JWT/PostgREST/Kong/edge runtime serving the
web `companion-actions` source, synthetic accounts, accepted hosted-shape baseline. `run.sh` was not
used (it restarts containers); `run-owned.py` checks the project label and port bindings with
`docker inspect`, then runs `deno test` against the started stack with no reset or restart.
`reapply366_test.ts` swaps #366 (rollback script, then the migration file or an override) between
red, fault and green runs. Supabase CLI 2.118.0. Checked before writes: supabase.com/changelog.md
(latest entry 2026-10-23; no breaking change for plpgsql or advisory locks), the 2026-09-25
Postgres 17.11 notice, the advisors guide and PostgreSQL 17 explicit-locking docs.

All behaviour is observed through the public action endpoint with the user's JWT and full public
reads. SQL is used only to hold the parent lock, queue a second holder, hold an uncommitted receipt
row, and read `pg_stat_activity` waits. Reply arrival order is never used as commit order. The
service sets `lock_timeout = 3s`; every case asserts no 503 (`operation_in_flight`) and none occurred.

## Test cases (`steps_context_race_test.ts`, 23)

| Case | Falsifier / what it binds |
|---|---|
| serial control | matching add before approval → 409 `needs_review`, one step |
| 8 relevant changes × change first (8) | change queued on the held parent lock, second SQL holder queued, approval queued; first holder released → change commits; complete public read shows it while the approval still waits; then approval must be 409 `needs_review` (revision +1, context = current matching steps), no new step |
| 8 relevant changes × approval first (8) | legal order: the change must wait on the parent lock behind the approval; nothing relevant visible before the approval commits; both 200 |
| late window (3: same-title add, custom rename, custom Undo restore) | approval stopped after its context read and insert (uncommitted receipt row with its operation id): the change must wait for it; a change committed and read there would make the approval a stale save |
| unrelated changes (1) | another title / checking the matching step (both orders): no review; same title under another task or account: no wait (2 s bound), no review |
| competing approvals + replays (1) | two approvals of one revision with a matching add committed and read between: no 200, one `needs_review`, one 403 stale revision; retry of a refused id writes nothing; the refreshed revision approved twice concurrently with one id saves once; replay returns the same step |
| rollback then re-apply (1) | after the #366 rollback script and re-application the change-first add still answers `needs_review` |

Relevant change kinds: same-title direct add (content-backed and custom), rename of another step to
the title (custom and content-backed), rename of the matching step away (custom), confirmed removal of
the matching step (content-backed), Undo restoring a removed matching step (custom), confirmed Undo
of the added matching step (content-backed).

## Red/green chronology (honest order)

1. `r1-red-unchanged-sql.log` (exit 1): first 20-case file on unchanged SQL: 7 passed, 13 failed,
   all assertions: 9 at the falsifier, 3 change-first custom cases at "the approval waits on the
   parent" (the unordered custom change committed before the approval started, so the old recheck
   saw it; their approval-first twins fail at the falsifier), 1 competing case ("no approval
   saved..."). The review's sequence reproduces: approval 200, two steps.
2. SQL fix. `g1-green-context.log` 20/20.
3. Deliberate faults on the 20-case file (`mut-*.log`, `mutants/*.diff`): C1 no recheck lock 10/10
   failed; C2 lock after the context read 10/10; C3 custom step writes unordered (pre-fix custom
   order) 14 passed / 6 failed, caught only by lock-wait assertions. To bind C3 by the falsifier, the
   three late-window cases were added *after* the fix: `g2-green-context-late-window.log` 23/23.
4. Final file on unchanged SQL and each fault (first `final-*`, then after a type-only lint
   edit `z-red-*` on the final bytes; same counts): unchanged 8 passed / 15 failed (11 falsifier,
   3 lock-point, 1 competing); C1 13/10 and C2 13/10 (9 falsifier + competing each); C3 15/8
   (2 late-window falsifier, 6 lock-point). Zero 503s, timeouts or setup errors in every run.
   Green on final bytes: `z-green-final.log` and `z-green-final-after-faults.log` 23/23.

`exits.json` is the machine ledger of every run (exit code, passed/failed parsed from deno's
summary line, override file). The `*-reapply.log` entries are the #366 swaps, not tests.

## Regression and gates

| Gate | Log | Result |
|---|---|---|
| Ordered backend suite on a recreated stack (`supabase stop --no-backup` + `start`, baseline only; rollback file first) | `b-*.log` | 12 files, 110 passed (87 existing + 23 new), each exit 0. The new file ran here with its pre-lint bytes (type annotations only differ) |
| Lock-sensitive repeats | `rep1-*`, `rep2-*` | parent race 11/11 twice, context race 23/23 twice |
| Advisors, `supabase db advisors --local --level info` | `advisors-fixed-info.json`, `advisors-compare.json` | 43 findings, same count as F1's final run, no new `function_search_path_mutable`, none naming a changed function (`advisors-fixed.json` is the default-level run, 30) |
| Mobile real local stack, explicit `ACTIONS_DB_CONTAINER`/`ACTIONS_REST_CONTAINER` (identity: `m1-container-identity.txt`) | `m1-mobile-localstack.log` | 3 passed, natural exit 0 |
| Mobile `npm run typecheck` | `m2-mobile-typecheck.log` | exit 0 |
| Mobile step client suites | `m3-mobile-step-suites.log` | 2 suites, 16 passed, exit 0 |
| Web step client suite | `w1-web-step-suite.log` | 14 passed, exit 0 |
| Web eslint, new test file | `w2-…` (first: 8 `no-explicit-any`), `w3-…-final.log` | 0 problems after typing; the existing test files keep their own `any` errors |
| Migration/rollback mirrors #361/#363/#366 | `mirror-check.log` | byte-identical |
| Own stack stopped (`supabase stop --no-backup`), config restored | `cleanup-stack.log` | exit 0; no container, volume or network left; 61031-61034 and 3118 free |

Counts overlap across runs and are not summed. Not rerun: mobile `test:ci`, lint, i18n, export;
web full `npm test`, build, i18n. No client, locale or app source changed; root gated its
`e0c7184a` client change.

## Proof limits

- Local disposable stack only. No hosted schema, lock or data test; no deploy; content stand-in.
  Local advisors do not show hosted privileges.
- Eight relevant change kinds on one or both task sources; not every kind × source × order. A step
  writer outside the action service (none exists; clients have read-only RLS) would not take the lock.
- A step write may now wait for one in-flight approval or step write of the same task of the same
  account (milliseconds here); custom-task step checks/renames newly take that lock. No account-wide
  serialization; other tasks and accounts did not wait.
- Lock queue order (FIFO among waiters on the advisory lock) decides the queued orders; the tests
  assert where each request waits.
- No client behaviour change; no device, browser, screen reader or live model run.
