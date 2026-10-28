# #364 + #366 integration reconciliation (r1)

Spec: UnifyCN/mobile-app#359. Tickets #364 (settlement plans) and #366 (task steps).
Date: 2026-10-27. Candidate for a fresh scoped review; not integrated, no ticket closed.

## Parents and candidates

| | Mobile | Web |
|---|---|---|
| Accepted #366 | `30fa639d` (tree `235008b4`) | `0f6b8209` (tree `1762030e`) |
| Approved #364 | `b15d7e4b` (tree `d6496c91`) | `a914019c` (tree `45d780c0`) |
| Merge commit | `d8b20c92` (first parent #366, second #364) | `ba8f38a` (first parent #364, second #366) |
| Composition test commit | `e6583164` | `8b2e793` |

The mobile primary already sat at accepted #366, which is not an ancestor-compatible
fast-forward to #364, so #364 was merged into it. The web secondary sat at approved #364;
#366 was merged into it. Both candidates contain both approved parents.

## Conflicts (written list: evidence `mobile-conflicts.txt.gz`, `web-conflicts.txt.gz`)

Mobile (11): `app/(tabs)/companion/index.tsx`, `components/companion/tasks/TaskActionsSheet.tsx`,
`hooks/companion/useTaskActions.ts`, `services/companionActions/analytics.ts`, seven locales.

Web (18): `app/(main)/companion/page.tsx`, `components/companion/tasks/TaskActionsDrawer.tsx`,
`hooks/useAccountScope.ts`, `hooks/useTaskActions.ts`, `lib/companionActions/analytics.ts`,
seven locales, `package.json`, `services/companion.ts`, `supabase/functions/rag-query/index.ts`,
`supabase/functions/rag-query/index_companion_context_test.ts`,
`supabase/functions/rag-query/lib/actions/proposals.ts`, `supabase/tests/companion-actions/support.ts`.

All resolutions are unions of both sides, except where noted:

- Sheet/drawer modes: `steps` and `plan` both kept; title order step review → plan → task
  draft → task; Back hidden for either. Plan task rows still open the task panel, which
  now carries the #366 step section.
- Invalidation and account scope: plan roots (#364) and step-draft root (#366) both
  refreshed after task writes and cancelled on account change.
- Analytics: `operation_type: OperationType | 'plan.save'`, both action/outcome unions.
- Locales: `taskSteps` and `plans` namespaces both kept. A per-leaf three-way check
  (base, #366, #364) has zero mismatches in all 7 locales on both platforms.
- `GeneratedReply` (web): #366's `actionProposal` union plus #364's `planProposal`.
- `package.json`: both verification scripts.

### Functional delta of the merge (beyond picking both sides)

1. **rag-query `extractActionProposal`** (web) — each parent rewrote the same function.
   Combined: every `[TASK]`, plan and `[STEP <id>]` line is stripped; plan lines give a
   plan (#364 rule, checked against the tasks read), else one task (#363 rule), else
   steps (#366 rule, checked against `readTaskRefs`). Signature gains a third parameter
   (`read`, `readTaskRefs`); `index.ts` passes both values each parent computed. Both
   regexes are byte-equal to the parents'. The test file keeps the #364 block and appends
   the #366 block unchanged. Each parent's own cases pass (226 rag-query tests).
2. **Web test support** (`support.ts`) — up order 361 → 363 → 364 → 366; down 366 →
   (364 via `migrate363`) → 363 → 361; `ready()` applies each missing migration.
   `waitForSchemaCache` keeps both `up364` and `up366` states; `migrate366('down')` now
   waits for `up364` when a #364 schema stays below (the #364 `up` state requires its
   absence, so the #366 standalone wait would never be satisfied). No product code.

No SQL changed. The #364 migration defines 28 plan-only functions and replaces none of
the shared functions; it calls `companion_apply_one`, which #366 replaces with the same
signature. All four companion migrations and rollbacks remain byte-identical across repos
(plan migration sha256 `7fc13153…`, steps `bac75f98…`).

## Tests added after the merge (not red-first)

- Mobile `planLocalStack.test.tsx`: new describe "Plan and task steps together"; its
  own `beforeAll` applies the #366 migration when missing (after #364). Existing cases
  and the existing `beforeAll` are unchanged.
- Web `PlanLocalStack.test.tsx`: new describe with the same case. A proxy `hook` sets
  the Checklist read fixture from the `plan_apply` reply (the real read would list the
  added task). Existing cases unchanged.

Path: approve a suggested plan that adds the phone task → open that task from the plan
entry → add and check one step → task stays Not started and plan items stay
`not_started` ×3 (server read) → "Mark task complete" → task `completed`, step kept done,
plan items `not_started, not_started, completed`, entry shows `1 of 3 done`. These were not
run on the standalone parents (no checkout of them was owned); no claim of a prior break.

## Evidence (`evidence/364-366-integration-r1/`, gz + `manifest.json` raw size/sha256)

Local project `unify-integration-364-366-r1` (API 61311, DB 61312, shadow 61313,
inspector 61314, content stub 3184) via a temporary edit of the web
`supabase/tests/companion-actions/supabase/config.toml`, restored byte-identical
(sha256 `08a3f04c…`). Supabase CLI 2.118.0; current changelog and start/stop help read.

| Check | Result |
|---|---|
| Web service suite `run.sh` (19 files, real GoTrue/PostgREST/Postgres 17/edge runtime) | 154 passed, 0 failed, exit 0 |
| rag-query `deno test supabase/functions/rag-query/` | 226 passed, exit 0 |
| Mobile mounted local stack (plan + companionActions files, explicit DB/REST containers) | 13 passed (incl. composition), exit 0 |
| Web mounted local stack `PlanLocalStack.test.tsx` | 9 passed (incl. composition), exit 0 |
| Mobile `npm run test:ci` | main 1451 passed, 15 skipped (local-stack cases without env); DST 13 passed; exit 0 |
| Mobile `typecheck`, `check-i18n` | exit 0 |
| Mobile changed-file lint (31 paths vs `1597c2c5`) | exit 0, 0 errors, 55 warnings |
| Mobile `expo export` iOS + Android | exit 0 (bundles only, no device) |
| Web `npm test` (final) | 677 passed, 9 skipped, 57 files, exit 0 |
| Web `npm run build`, `tsc --noEmit --incremental false`, `check-i18n` | exit 0 (41 pages) |
| Web changed-file lint (33 paths vs `ca144e86`, excluding `supabase/`) | exit 0, no output |
| Web full lint | exit 1: 23 errors, 2 warnings (see below) |

Failed records kept: the first web `npm test` (pre-composition) failed 1 of 685:
#366's "suggested-step Undo confirmation uses shared reveal for click detail 1"
(opacity `0.0196…` instead of `0`). Six isolated reruns: 1 failure, 5 passes; the same
assertion is recorded as flaky in the #366 r7 review. Unchanged, not weakened.

Full web lint: #366's 21 errors plus one `no-explicit-any` each in
`plan_multiple_reviews_test.ts` and `plan_retry_review_test.ts` (#364 files, byte-equal to
`a914019c`). Both warnings are in the ignored `run.sh` function copy. No rule changed.

Limits: jsdom/RNTL rendering with real local service; no browser, simulator, device,
hosted, live-model or screen-reader run. Fonts, dependencies, CI and lint config untouched.
