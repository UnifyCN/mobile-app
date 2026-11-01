# Every unfinished retry review stays reachable (SPEC review r2 R2-SPEC-1)

Not an acceptance claim. Local disposable stack and jsdom/RNTL only.

Finding: the plans read returned only the newest revised retry review
(`companion_plan_view`, `order by created_at desc limit 1`), while
`companion_plan_retryable` refuses Retry for additions in every open review. Sequence:
phone and library-card additions fail; a phone task appears elsewhere; Retry opens a phone
review while the library card fails again; the city changes; Retry opens a separate
library-card review. After a restart only the library-card review was returned and
rendered. The phone review stayed open in storage with no control and no Retry. Both
clients read a singular `review` field. Requirement: ticket #364 (proposal references
"needed to resume after a new conversation or client restart") and SPEC:131 (a revised
proposal and new approval after a relevant change).

## What changed

- SQL, mobile authority `unify-front-end/supabase/migrations/20261027183338_companion_settlement_plan.sql`
  (pending, undeployed, identity kept, edited in place; web mirror byte-identical,
  sha256 `7fc13153d88cce5e…`). Only `companion_plan_view` changed: it now returns
  `reviews`, every `kind 'retry'` review of the plan with status `draft` or `applied`,
  oldest first (`created_at`, `id`). Closed reviews are not listed (their additions are
  back in Retry). The earlier `review` field (latest review, any status) is still returned
  unchanged, so a reader of the earlier shape behaves as before; it is documented as able
  to hide an older open review. Retry, approval, revise, Not now, Undo, status, identity,
  receipts and grants are unchanged. Rollback unchanged (sha256 `2416ca44970f7259…`, it
  already drops this function); no new function, no shared #360/#361/#363 function touched.
- Representation choice: a collection of separately identified reviews, not a merged
  review. Each review already has its own id, revision, items, context, Not now and
  approval path on the server; the defect was only that the read hid all but one. No
  review is approved, closed or reclassified on behalf of another, and no user has to
  settle one review to reach another.
- Clients (mobile `services/companionActions/planContract.ts`, web
  `lib/companionActions/planContract.ts`): `PlanView.review` becomes
  `reviews: PlanProposal[]`; the parser reads `reviews` and falls back to `[review]` only
  when `reviews` is absent. Saved plan (`PlanPanel.tsx` on both): one `RetryReview` per
  listed review, keyed by the review id (each keeps its own revision, request state,
  store phase and result); a superseded "needs review" retry line is hidden only when
  every review it named is approved. When more than one review is open, each heading
  names what it would add: new key `plans.retryReviewNamed` ("Review the remaining
  change: {{titles}}"), real text in ar, en, es, fr-CA, hi, pa, vi on both platforms
  (values equal across platforms). With one open review the heading is unchanged. Web
  keeps each section inside the shared `Reveal` with `aria-labelledby`, so each region has
  a distinct accessible name. Mobile section has `testID='plan-retry-review'`. Entry:
  "needs your review" while any review is open. Helper `reviewTitles` in `planText.ts`.
- Docs: `DOCS/companion-actions/364-plan.md` (contract and correction section).
  Privilege wording corrected in `evidence/364-retry-review-r1/README.md` (below).

## Test-first record (chronological)

| Step | Result | Log |
|---|---|---|
| Retained reviewer public-service file, unchanged, owned stack, unchanged candidate | exit 1; second case fails at "first unfinished review is absent from every saved-plan/draft entry"; preservation case passes | `red-retained-backend.log` |
| B1 binding (new `plan_multiple_reviews_test.ts`, two reviews, fresh read, independent approval, original identity) vs unchanged candidate | exit 1 at "an unfinished review is not reachable from the saved plan" (fixture assertions passed first) | `b1-red.log` |
| SQL change, B1 rerun | First attempt failed at my test's own wrong expectation: I revised the phone review (which re-reads context, correct behavior) and then expected its approval to need review. Not a product detection; log overwritten. Test corrected to approve the stale revision first (409 `needs_review`, Vancouver → Surrey), then choose the match. | — |
| B1 green | exit 0 | `b1-green.log` |
| Final B1 vs original migration (`ACTIONS_MIGRATION_364_FILE`) | exit 1 at the same reachability assertion | `b1-final-vs-original-migration.log` |
| B2-B4 written after B1 green (not red-first): Not now isolation + concurrent Retry; concurrent approvals of both reviews + same-id replays + status lookups + old Retry replay; account isolation + item Undo + reviewed plan Undo closing every review | First run: B4 failed with a test-code `ReferenceError` (local `undo` shadowed the helper), a test error, not evidence. Second run 5/5 | `b2-b4-first-run-test-error.log`, `b2-b4-green.log` |
| Mobile mounted binding case vs unchanged mobile client (corrected server) | First attempt: setup error (empty SQL `in ()` list), not evidence. Then exit 1 at `expect(queryByRole('checkbox', Add Set up phone service)).not.toBeNull()` after restart | `m-red.log` |
| Mobile client change | exit 0 | `m-green.log` |
| Web mounted binding case vs unchanged web client | exit 1, `AssertionError: the first unfinished review has no route after a reload` | `w-red.log` |
| Web client change | exit 0 | `w-green.log` |

Concurrency is real: `Promise.all` in one run, no delay between create and use (two
Retries at once open one review; two reviews approved at once with duplicate same-id
requests: 4 replies 200, 2 non-replayed, one task each with the original item operation
id; lookups find both).

Deliberate faults (product files untouched; mutated copies or temporary edits restored and
verified with `cmp`):
- Backend (`backend-faults.diff`, `backend-fault-*.log`), 5 of 5 red at assertions:
  m1 view lists only the latest review (B1 at the reachability assertion; B2/B4 also hit
  a TypeError on the absent review, not counted); m2 approving one review closes the
  others (B1 "approving one review changed the other", B3, B4); m3 Not now closes every
  review of the plan (B2); m4 Retry ignores open reviews (all four fail at the shared
  fixture's outcome assertion); m5 plan Undo leaves reviews open (B4).
- Mobile client: render only the latest (red), unnamed headings (red at the section-name
  assertion), parser ignores `reviews` (red). Shared key for all sections SURVIVED.
- Web client: same first three red (unnamed: `TestingLibraryElementError` for the named
  region, an accessible-name query failure); index keys SURVIVED.
  The surviving key faults are disclosed: the mounted cases close or approve a review
  whose position does not shift another, so they do not observe key identity. Stable id
  keys are kept by design, not proven by a failing test.

Retained reviewer reproductions after the fix:
- Public-service file: one adaptation, the `reachable` list also reads open `reviews`
  (`spec_r2_review_test.adaptation.diff`); the defect assertion is unchanged. 3/3 pass
  (`retained-backend-after.log`). Unadapted it would still read only the compatibility
  `review` field.
- Mounted web file, unchanged (only env): 9/9 pass, including both independent cases
  (`retained-web-after.log`). A first `-t independent:` attempt and a run on a freshly reset
  database failed on missing migrations (setup: the file has no migration hook; the
  mobile harness or `multiple-reviews-r2-scratch/prime.sh` applies them), not evidence.

## Gates on the final content

- Backend, owned stack, all 15 files: 104 passed, 0 failed, exit 0 (`backend-final.log`;
  99 earlier + 5 new).
- Mobile: plan + #361 local-stack suites with explicit owned containers: 2 suites, 9
  passed, exit 0 (`m-local-stack-final.log`). `npm run test:ci` without ACTIONS env,
  natural exit 0, no forceExit: main 134 passed + 1 skipped suites, 1413 passed + 11
  skipped; DST 13 passed (`m-test-ci-summary.log`). Typecheck 0. Changed-file eslint 0
  errors, 7 existing warnings in the test file. i18n parity OK (1864 keys).
  `expo export --platform ios --platform android` exit 0 (bundle only, not device proof).
- Web: `vitest run` 54 files, 633 passed + 8 skipped, exit 0. Mounted local-stack +
  motion files with the owned stack: 12 passed. `tsc --noEmit` 0 (after the motion
  fixture's `review: null` became `reviews: []`). Changed-file eslint 0. i18n parity OK
  (2542 keys). `npm run build` exit 0 once (Next 16.2.6; does not settle the separately
  owned font-loader question). Edge workflow steps locally: `deno check` of every
  entrypoint and `_shared` exit 0; `deno test supabase/functions/` 267 passed.
- Advisors (local, `advisors-summary.json`): no finding names `companion_plan_view`; the
  plan findings are the earlier ones (three immutable helpers without a pinned
  search_path; `companion_plan_proposals` RLS without policies, by design service-only).

## Privileges (corrected wording)

`function-privileges.txt` (local query after the migration): the plan functions are
security definer with `search_path=public, pg_temp`; `anon` and `authenticated` cannot
execute them; `service_role` CAN execute all of them, including the internal
`companion_plan_apply_review`. The migration has no explicit service grant for that
helper, but the local default privileges of `postgres` in `public` give `service_role`
EXECUTE on every new function and the migration revokes only from public/anon/
authenticated. "No explicit grant" therefore does not mean "no effective privilege". The
r1 evidence said "not granted to service_role"; it is corrected in place. service_role is
the trusted action-service role; no access policy was changed here. Hosted privileges were
not checked.

## Limits

Local disposable stack only; no hosted permission, data or deployment proof. jsdom/RNTL
only: no device, native screen reader, geometry, browser zoom or motion timing. Key
identity of review sections is not observed by a failing test (above). Translations are
not native-reviewed. Content and generation are fixtures; no live or paid model call.
Supabase CLI 2.118.0 (2.122.0 available, not upgraded); changelog, local CLI guide,
database-function guide and start/stop/reset/advisors help read before local writes.

## Resources and cleanup

Owned project `unify-actions-364-multiple-reviews-r2`, ports 61151-61154, content port
3144 unused; Docker labels (`com.supabase.cli.project`, workdir
`/private/tmp/unify-merge-361-web/supabase/tests/companion-actions`) checked before
writes; every enabled mobile run set `ACTIONS_DB_CONTAINER` and `ACTIONS_REST_CONTAINER`
to the owned containers, web runs the owned DB container. Cleanup is recorded in the
handoff.
