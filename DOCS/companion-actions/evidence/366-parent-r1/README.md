# #366 F1 parent-ordering correction (r1): evidence

Scope: SPEC review F1 only (`/tmp/unify-companion-359/review-366-SPEC-r1.md`). F2 Retry and the
S366-1/S366-2 controls/motion findings are root's fixes; nothing here claims them. Design and rules:
`DOCS/companion-actions/366-steps.md`, section "Parent ordering (review F1, correction r1)".

Starting pins: mobile `26b7cb12` (tree `30070f00`) = reviewed candidate `68e97de4` + accepted `1597c2c5`;
web `52ba1242` (tree `13232c00`). Changed: the pending #366 migration and rollback (mobile authority,
web byte-identical mirror) and the new web test `supabase/tests/companion-actions/steps_parent_race_test.ts`.
No existing test, fixture, client, edge or locale file changed.

Stack: own project `unify-actions-366-parent-r1`, API 60931, DB 60932, shadow 60933, inspector 60934,
content stand-in 3098 (temporary `supabase/tests/companion-actions/supabase/config.toml` edit, not
committed). Postgres 17, real GoTrue/JWT/PostgREST/Kong/edge runtime, synthetic accounts, hosted-shape
baseline. Command (web repo): `cd supabase/tests/companion-actions && ACTIONS_CONTENT_PORT=3098 ./run.sh [file]`.
RED runs on unchanged SQL used `ACTIONS_MIGRATION_366_FILE`/`ACTIONS_ROLLBACK_366_FILE` pointing at the
`26b7cb12` copies of the migration/rollback (same test file, same stack).

## Test cases (steps_parent_race_test.ts, 11)

Every case runs the conflicting requests concurrently through the public action endpoint and PostgREST
with the user's JWT, holds locks from separate SQL connections (the parent lock key, and a SHARE lock on
`companion_task_steps` that stops a step write right after its parent check), and reads
`pg_stat_activity` to see where each request waits. A legacy write that legitimately waits is started
without being awaited, so a correct design cannot hang the test. Reply arrival order is never used as
commit order.

| Case | Falsifier / what it binds |
|---|---|
| absent row, completion / dismissal, step add first (2) | parent change committed and publicly read with no step, then the step saved. Fixed: the legacy write waits on the parent lock while the step (past its parent check) holds it; both intermediate reads show no change and no step; step 200 is history, parent revision 1 |
| absent row, completion / dismissal, legacy queued first (2) | legal other order: the legacy write commits first, the step add is refused 422 `task_completed`/`task_removed`, no step |
| absent row, completion / dismissal sent after the step passed its parent check (2) | the window between parent check and insert: the legacy write must wait for the step |
| absent row, step check (`step.set_done`) vs completion (1) | update path: no step changes after a completion was read |
| existing row, released upsert and plain UPDATE (`updateTaskCompletion`) (1) | control: either order is legal; asserts the legal one observed (upsert waits on the parent lock; plain UPDATE commits first and the step add is refused) |
| independent account / independent task under a held parent (1) | no wait behind an unrelated parent (5 s bound) |
| 8 accounts, unheld simultaneous step add + completion (1) | no 5xx/deadlock; each end state legal |
| rollback then re-apply (1) | after #366 down a legacy completion takes no step lock; after re-apply a dismissal waits again |

## Red/green chronology (honest order)

1. `r1-red-unchanged-sql.log` (exit 1): staged reviewer test with imports changed only
   (`review-race-adapted-imports-only.ts`): 1 passed, 2 assertion failures (the review's result
   reproduced on this stack); first draft of the new file: 4 passed, 4 failed. Three were the defect
   assertion; one was a test bug in the independence case (it raced an account's own step and completion).
2. Independence case fixed (writes on separate parents). `r2-red-unchanged-sql.log`: 5 passed, 3 failed,
   all three at the falsifier assertion ("a step was saved/checked after the completion/dismissal was
   committed and publicly read").
3. SQL fix. `g1-green-race.log`: 5 passed, 3 failed: each failure was my test's `reply order` assertion
   (PostgREST answers in fewer hops than the edge function, so the legacy reply arrived first although it
   committed second, as the lock waits showed). Replaced it with lock-point evidence (the legacy write
   still waits on `advisory` while the step holds the parent past its check). No product change.
4. `r3-red-unchanged-sql-final-test.log` 5/3 (assertion), `g2-green-race.log` 8/8.
5. Reviewer test with a sequencing correction only (`review-race-sequenced.ts`,
   `review-race-sequencing.diff`): the legacy upsert is started, not awaited, while the lock is held; the
   review's defect assertion applies when the intermediate read shows the change, otherwise the step must
   be saved as history. `r4-red-review-sequenced-unchanged-sql.log` 1 passed 2 failed at the review's own
   assertion; `g3-green-review-sequenced.log` 3/3. The staged copy was removed from the test directory.
6. Rollback case added: `g5` failed once on my expectation (an upsert onto an existing row answers 200,
   not 201); `g6` 9/9.
7. Mutation runs exposed that the step-first cases started the legacy write before the step held the
   parent, so M2/M3 were caught only by the lock-point assertion. Added the "sent after the step passed
   its parent check" cases. Final file on unchanged SQL: `r6-red-final-test-unchanged-sql.log` exit 1,
   5 passed, 6 failed, every failure an assertion (5 falsifier, 1 rollback "ordered again");
   `g7-green-race-final.log` 11/11 exit 0.
8. Advisors (`supabase db advisors --local`, CLI 2.118.0): one new finding, `function_search_path_mutable`
   on `companion_step_parent_lock`; fixed with `set search_path = public, pg_temp`. `advisors-final.json`:
   43 findings, none naming the new function or trigger (all pre-existing baseline/#361-#366
   items). `g9-green-race-search-path.log` 11/11 exit 0 after that change.

Backend suite with the fix: `g8-backend-all-final.log` 11 files, 87 passed (the accepted 76 + 11 new),
exit 0, before the search_path change. The post-merge combined run is recorded below.

## Deliberate faults (mutants/*.diff, applied through `ACTIONS_MIGRATION_366_FILE`)

Diffs are against the final file; they were generated before the search_path line, so each also shows
that one line. `void-filter-*.log`: a first attempt used a `--filter` regex that selected 0 tests; void,
not evidence.

| Fault | Final-file run | Killed by |
|---|---|---|
| M1 parent lock after the parent read | `mut2-m1-...log` 9/2 | legacy-queued-first cases: step 200 instead of 422 |
| M2 trigger never fires | `mut2-m2-...log` 5/6 | falsifier in the "sent after" cases; lock-point assertions |
| M3 trigger ignores dismissal | `mut2-m3-...log` 8/3 | dismissal falsifier; lock-point; rollback re-apply |
| M4 every UPDATE takes the parent lock | `mut2-m4-...log` 10/1 | legacy UPDATE 500 `40P01 deadlock detected` (lock-order inversion) |

## Proof limits

- Local disposable stack only. No hosted schema, lock, trigger or data test; no deploy; no real Sanity
  read (content stand-in). Prior #360 hosted-shape evidence is context only.
- Released request shapes covered: completion upsert, dismissal upsert, plain completion UPDATE, plain
  inserts. Writers that bypass triggers (replica role, COPY with triggers off) are not ordered.
- A legacy completion/dismissal may now wait for one in-flight step write of the same task of the same
  account (milliseconds). No timeout was observed; there is no global or per-account serialization.
- Pg lock-queue order (FIFO among conflicting waiters) decides the legacy-queued-first cases; either
  order is legal, the tests assert the one observed with the waits shown.
- No client code here; mobile/web client behaviour, native devices and browsers are not exercised by
  these runs.

## Combined candidate (after merging root's client corrections)

Merged root's exact commits (parent instruction `handoff-366-client-root-r1.md`): mobile `d5b6bd66`
(tree `8d4cd8f5`) into SQL commit `361487d4`; web `2a61bc4d` (tree `1f15a642`) into SQL commit `dc00e26`.
Both root checkouts were clean at those heads; both were children of the starting pins; merges had no
conflicts (disjoint files). Integration tips re-read: mobile `1597c2c5`, web `02377a33`, unchanged and
already ancestors. Root's F2/S366-1/S366-2 fixes are theirs; these runs only show the merge is green.

| Gate | Log | Result |
|---|---|---|
| Backend suite, own stack, merged web functions | `c1-combined-backend-all.log` | 11 files, 87 passed, exit 0 |
| Mobile real local stack (`companionActionsLocalStack.test.tsx`), `ACTIONS_DB_CONTAINER=supabase_db_unify-actions-366-parent-r1`, `ACTIONS_REST_CONTAINER=supabase_rest_unify-actions-366-parent-r1`, identities checked with `docker inspect` (project label, DB port 60932) | `c2-mobile-localstack.log` | 3 passed, natural exit 0, no `--forceExit` |
| Mobile `npm run test:ci` (local-stack suite skipped: no env) | `c3-mobile-test-ci-summary.log` | main 135 suites, 1428 passed, 5 skipped; DST 13 passed; natural exit 0 |
| Mobile `npm run typecheck` | `c4-mobile-typecheck.log` | exit 0 |
| Web `npm test` | `c5-web-npm-test-summary.log` | 53 files, 642 passed, exit 0 |
| Web `npm run build` (includes TypeScript) | `c6-web-build-summary.log` | exit 0 |
| Migration/rollback mirrors #361/#363/#366 | `c7-mirror-check.log` | byte-identical |
| Own stack stopped (`supabase stop --no-backup`) | `c9-stack-stop.log` | exit 0; no container/volume left; 60931-60934 and 3098 free |

Counts overlap with root's runs; they are separate runs, not summed. Mobile lint/i18n/export and web
lint/i18n were not rerun: no client, locale or lint-relevant source changed outside root's commits, which
root gated. Mobile `node_modules` was an APFS clone of root's installed tree (identical lockfile), kept
ignored. No browser, native-device, hosted or live-provider run.
