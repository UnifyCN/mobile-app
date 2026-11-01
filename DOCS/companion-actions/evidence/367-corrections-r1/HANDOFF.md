# #367 corrections r1 handoff (Claude Personal Opus)

Implementation of the #367 review r1 corrections only. Not ticket acceptance, integration or
release. Independent round 2 review must follow. Brief: `brief.md` here (copy of
`/tmp/unify-companion-359/correct-367-r1-brief.md`, READY marker line 1).

## Checkouts, pins and ancestry

| | Mobile primary (T3-created) | Web secondary (reassigned) |
|---|---|---|
| Path | `/Users/savargupta/.t3/worktrees/Unify/t3-2f6bd8b8` | `/tmp/unify-merge-361-web` |
| Branch | `t3/companion-367-corrections-r1` | `t3/companion-367-corrections-r1-web` (new branch in the same checkout) |
| Candidate HEAD | `76659748f24cb41a5b33b749ce3c68ca6483ad0c` (code; this file is in the evidence commit after it) | `c022bb48e61b5195ce3d22e5e9190b4d8b2920a9` |
| Candidate tree | `98041fceecc62c2806eb0909cb4f95288f6ac550` (code commit) | `404b70e4ff4d66eb615901ebabf04446921a3329` |
| Composition merge | `0f06c17b` = merge(68984d18, a429d337) | `9f85db4` = merge(9c48776, 21df0701) |
| Accepted integration (read at start and before return) | `68984d18c534cb870b1d2f41a8fe823625017976`, clean | `21df0701f12f99b5d1dd8af246fa4b5f8acb41ae`, clean |
| #367 source (unchanged) | `a429d337dd917a31e39a3053fa56a60faa4da2c1`, tree `4b6bef6f`, clean | branch `t3/companion-367-implementation-web` still at `9c48776abda3b46f468b8b4599602f43c5e07cc1` |

- `merge-base --is-ancestor`: 68984d18 and a429d337 are ancestors of the mobile HEAD;
  21df0701 and 9c48776 are ancestors of the web HEAD.
- Commits above the merges (first parent): mobile `76659748` (S1 SQL, S2 test, doc), web
  `c022bb4` (S1 SQL mirror, race test, rollback test, README).
- No #370 commit or file is imported. No reset, stash, push, PR, issue, watch, integration
  edit, hosted action, deploy, paid service, live model, child agent or instruction edit.
- Byte-identical mirrors (git blobs, both repos): #367 migration `1b846a02`, #367 rollback
  `44370abe`; #365 migration `6f284758`, #365 rollback `b1a09216` (unchanged).

## Composition with #365 (merge)

Timestamp order and actual apply order: #361 `20261025235536`, #363 `20261026165156`,
#364 `20261027183338`, #366 `20261027183644`, #365 `20261028001530`, #367 `20261028025026`.

- #365 and #367 both replace six shared functions (`validate_operations`,
  `check_authorization`, `apply_one`, `receipt_summary`, `undo_action`,
  `conversation_actions`). I 3-way merged each body (base = #366 body; both rollbacks hold
  the identical base). Four merged cleanly; `validate_operations` and
  `conversation_actions` had one conflict each (type allowlist and kind list), resolved to
  keep both. The #367 migration now carries #365 bodies plus the marked #367 lines.
  `prepare_proposal`/`recheck_proposal` keep #366 bodies (#365 did not replace them).
  #365's own `apply_actions` and `cancel_proposal` are not replaced by #367; I checked that
  `apply_actions` calls the #367 `recheck_proposal` and then `recheck_edit`.
- `companion_proposals_kind_check`: #367 now keeps `task_edit` and adds `task_remove`.
- #367 rollback restores the #365 bodies (six), #366 bodies (two), the #364 plan writer
  (S1) and the #365 kind list, so it runs before the #365 rollback.
- Test chains: web `support.ts` applies #365 before #367 (`migrate367('up')` applies #365
  first if missing) and rolls #367 back before #365 (`migrate365('down')` rolls #367 back
  first). Mobile `planLocalStack` #367 block applies #365 when missing and refuses #367
  without #365. Web `TaskRemovalLocalStack` chain includes #365 before #367.
- `remove_rollback_test` compares the live bodies after the #367 rollback with the #365,
  #366 and #364 sources, and checks that the S1 helpers are gone.
- `mutation_check.py` (#365): a #365 anchor inside one of the six shared functions is also
  edited in the #367 copy, because #367 is the running code. Otherwise those mutations would
  test dead code.
- Client conflicts (contract, client, analytics, store, cards, receipts, state panel,
  send hooks, edge commands/contract/handler, seven locales in both repos) resolved to keep
  both the #365 edit and #367 removal shapes. Clarify questions: `intent: 'remove'` first,
  then the #365 reason questions. Multi-line commands: all removals → removal question;
  any edit line → `multiple_changes`; else `multiple`.

## Finding ledger

| ID | Status in this candidate | Evidence |
|---|---|---|
| S1 [blocker] plan reference vs removal | Fixed (not accepted) | Red 3/3, green 3/3, full backend 204/204, reviewer probe outcome below |
| S2 [should] removal announcement | Root code verified on real local persistence; one test-isolation defect in the root assertions fixed | mobile real stack 14/14 twice-run history below; binding mutation RED |

### S1 fix

Shared/exclusive advisory lock per (account, task_ref), key `hashtextextended(user:ref, 367)`:

- `companion_plan_items_lock(user, items)` (new): shared lock for each distinct existing
  `task_ref` in the items, sorted. Called once in `companion_plan_apply` after the proposal
  checks and before the kind dispatch, so it covers the plan approval and the reviewed retry
  (`companion_plan_apply_review`); undo items take nothing.
- `companion_remove_lock` (removal, restore, removal Undo): exclusive lock after the #366
  parent lock and before the task row. Lock order: proposal row, parent lock,
  plan-reference lock, task row. Plan writers take no parent lock or task row lock, so no
  cycle.
- Both sides read in later statements (READ COMMITTED, new snapshot after the lock).
  Removal first: plan approval waits, then `409 needs_review` with the task unavailable.
  Plan first: removal waits, then `409 needs_review` whose new review names the plan.
- Not locked: plan Undo (it only removes a plan and tasks that plan added, whose rows are
  already ordered by the task row lock; any serialization yields a receipt naming a plan
  live at removal commit), plan retry of new items (new tasks only).
- No account-wide lock: tested that a plan for another task and another task's removal
  complete while the paused write holds its lock.

### S1 test order and raw results

1. Composition commit, stack reset, `remove_plan_race_test.ts` before the fix
   (`s1-red.log`, first line = web HEAD 9f85db4): **3 failed by AssertionError**, no crash.
   Plan-first schedule printed `middle: removed true, plans []` then `plan 200`, `removal
   200 plans []`: a plan saved for a removed task.
2. Fix applied to the mobile migration and mirrored: same file **3/3 green**
   (`s1-green-1.log`), each with `waiting: 1` and the expected blocker
   (`companion_apply_actions` or `companion_plan_apply`) from `pg_blocking_pids`.
3. Reviewer probe (`t3-457f38cc/.../review-367-r1/effect-race.test.ts`, run read-only):
   fails its fixed expectation (`reviewer-probe-after-fix.log`): removal `503
   operation_in_flight`, `persistedRemoved: false`, plan 200. Its fixture gate holds the
   removal (which now holds the plan-reference lock) while it awaits the plan approval, so
   the removal exceeds its 3 s lock timeout and rolls back. No removal committed with a
   stale plan list. I did not change that evidence.
4. Full backend (`backend-all-1.log`): **27 files, 204 passed, 0 failed**, exit 0. Every
   `*_test.ts` ran once (file list compared with the log).
5. `mutation_check.py` for the 11 shared #365 mutations (`mutation-365-shared.log`):
   **11 of 11 RED**.

### S2 verification order and raw results

1. Mobile whole file after a fresh reset (`mobile-planlocal-1-isolation-fail.log`): 13/14;
   the root's Cancel assertion received two `Saved. Task state: Completed.` calls. Trace:
   the react-native Jest preset defines `announceForAccessibility: jest.fn()`, so
   `jest.spyOn` returns that mock with calls from the previous test (a real completion in
   the steps block). Isolated, the case passed (stack already migrated). Fix: `mockClear()`
   after the spy is created. I also added a state positive control: after Undo, choosing
   In progress announces `Saved. Task state: In progress.` and persists `in_progress`.
2. Whole file after a fresh reset (`mobile-planlocal-2.log`): **14/14**. The removal case
   asserts no announcement at Cancel, then exactly `Removed from your Checklist: Get your
   SIN`, `Restored to your Checklist: Get your SIN`, `Saved. Task state: In progress.`.
3. Binding check: the announcement temporarily reverted to the state-only text. A
   filtered run was UNRESOLVED (`s2-mutation-state-only-1-unresolved.log`: filtered run on
   a fresh reset skips the blocks that apply #361-#366, so setup refused). Whole file
   (`s2-mutation-state-only-2.log`): **1 failed by assertion** with `Saved. Task state:
   Not started.` instead of the removal text; 13 passed. Source restored, `git diff` clean.
- Not a full root TDD cycle and not root green: the root did not run its assertions; this
  run found and fixed a test-isolation defect in them before they could pass reliably.

## Final gates (after the last code change; logs here)

| Gate | Result |
|---|---|
| Backend service suite (owned stack) | 27 files, 204 passed, 0 failed |
| Mobile real stack `planLocalStack` (fresh reset) | 14/14 |
| Mobile real stack `companionActionsLocalStack` (fresh reset) | 4/4 |
| Web real stack `TaskRemovalLocalStack` then `PlanLocalStack` (one reset, sequential) | 3/3, 9/9 (a first `PlanLocalStack` run after its own reset failed 9/9 in setup: that file does not apply migrations; r1 also ran it after the removal file) |
| Web Chromium `verify-companion-task-remove.mjs` | 12 passed, 0 failed, 0 errors |
| Mobile `tsc --noEmit` / `expo lint` / i18n | exit 0 / 0 errors, 85 warnings, none in a changed file / parity OK, 2004 keys |
| Mobile `npm run test:ci` | main 139 suites passed, 1 skipped; 1459 passed, 20 skipped; DST 13 passed; exit 0 |
| Web `tsc --noEmit` / i18n | exit 0 / parity OK, 2682 EN keys |
| Web `eslint` | 12 errors, all on lines present at accepted base 269a5b93 (context_rls_test 7, rollback_test 1, support.ts 4); none added |
| Web `npm test` | 60 files; 686 passed, 12 skipped |
| Web `npm run build` | exit 0 |
| Deno check of the edge functions | exit 0 (after the merge) |

Copied Deno function sources were removed before the web tsc, lint and build.

## Proof limits

- Real local Supabase (Postgres 17, PostgREST, GoTrue, edge runtime, RLS, real JWTs) on a
  disposable stack. Not hosted Supabase; no hosted permission or gateway is proven.
- The S1 tests use a test-installed trigger and advisory gate to pause one write; the
  product functions are unchanged by the fixture. Lock waits are observed in
  `pg_stat_activity`/`pg_blocking_pids`; commit order is not inferred from replies.
- Mobile mounted tests use the real client, store, contract, query cache, HTTP service and
  database; model stream, Sanity content and Checklist rows are stand-ins. The
  announcement checks spy on the React Native API. They are **not** VoiceOver/TalkBack,
  native focus, ordering or text-scaling proof. No simulator, device or native build ran.
- Chromium uses the real panel and drawer with a test proxy, not the full Next shell.
- The accepted #365 integration already has different `taskEdit.clarify` copy between
  mobile and web in `ar` and `es` (present at 68984d18/21df0701). I did not change it.
- Native exports were not run (bundling only, not in scope).

## Owned-resource cleanup

- Project `unify-remove-367-corrections-r1` (API 61711, DB 61712, shadow 61713, inspector
  61714, content 3260; 3210 unused). Labels checked before stop (`com.supabase.cli.workdir`
  = `/private/tmp/unify-merge-361-web/supabase/tests/companion-actions`). `supabase stop
  --project-id ... --no-backup`: 0 containers, 0 volumes. All six ports free.
- Test `supabase/config.toml` restored byte for byte (sha256 `08a3f04c...`, no git diff).
  Copied function sources removed. Other projects' containers (`unify-actions-361/363`)
  untouched.
- `scratch/` holds my merge tools, function splits, the local stack env (local demo keys)
  and traces; it is not committed. Mobile `node_modules` (npm ci) remains, ignored.

COMPANION_367_CORRECTIONS_R1_DONE
