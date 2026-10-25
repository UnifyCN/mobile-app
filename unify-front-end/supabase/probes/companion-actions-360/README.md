# Companion actions compatibility probe (#360)

Disposable. Proves the shared task contract against a local Supabase stack that copies the hosted checklist schema. It is not production code and not applied anywhere. Decision record: `DOCS/companion-actions/360-compatibility-decision.md`.

## What runs

A separate local stack (`project_id unify-companion-probe-360`, ports 55320-55322): Postgres 17, GoTrue, PostgREST, Kong, edge runtime. The tests refuse any non-`127.0.0.1` URL.

| Path | Purpose |
|---|---|
| `supabase/migrations/20260101000000_hosted_baseline.sql` | Hosted shape of the checklist, conversation and message tables, copied from the read-only evidence in `DOCS/companion-actions/evidence/hosted-read-2026-10-25.md`. |
| `candidate/up.sql`, `candidate/down.sql` | The additive migration and its rollback. Applied by the tests, not by `supabase start`, so the baseline can be tested first. |
| `supabase/functions/companion-actions/index.ts` | Stand-in action service: JWT -> gate -> SQL transaction. Has one local-only fault hook (`x-probe-drop-response`). |
| `migration_test.ts` | Legacy client calls give identical results before, after `up`, after `down`, after `up` again; pre-existing rows survive; function privileges. |
| `actions_test.ts` | Public-boundary tests: round trips, isolation, concurrency, lost response, pending lookup, conflicts, approval binding, atomic groups, reminders, removal, gating, account deletion. |
| `regressions_test.ts` | Review round 1: one proposal consumed once across operation ids, request validation before any write (missing/null state, malformed numbers), canonical task references. |
| `rollback_test.ts` | Review round 1: receipts, approvals, reminders, removal and rich state survive down + up; every pre-rollback revision is stale afterwards. Spec round 2: a delete made by an old client while rolled back drops its plan references. Rollback reminder policy (Spec round 3): a full rollback stops every pending reminder, the restore restarts none (also from an older archive), old schedules only replay, a new approved schedule works, a gate-only toggle stops nothing. |
| `historical/historical_test.ts` | Released mobile JavaScript (v1.6.0, shipped OTA) run unmodified by its own Jest through all four phases. Needs a prepared checkout (below). |
| `historical/web_consumer_test.ts` | The web app's `services/checklist.ts` at a fixed commit, run by its own Vitest under jsdom through all four phases. |
| `historical/harness.ts`, `historical/harness_test.ts` | Stages a harness in a released checkout under a new `__probe360__-<run id>/` directory and removes only that file and directory. The test (no stack) proves unrelated untracked files and a file at the old fixed path survive a passing and a failing runner, for both callers. |
| `historical/simulator_fixture.sql`, `historical/simulator-flows/` | Hosted-shape `users` / `user_onboarding_profiles` columns and the Maestro flows used for the dev-shell simulator run (decision record section 4). |
| `../../../__tests__/checklist/companionActionsLegacyCompat.probe.test.ts` | The real mobile checklist services against the migrated stack (skipped unless `PROBE_JEST=1`). |
| `mutation_check.py` | Breaks one mechanism at a time in `up.sql` (or `down.sql`, for mutations marked so); the matching tests must fail with an assertion. A timeout, a stack failure or a non-assertion error is UNRESOLVED and exits nonzero. On a timeout it stops only its own process group. |
| `mutation_check_test.py` | Tests of that classification and of the process-group stop (no Docker needed). |

## Run

Needs docker, the Supabase CLI and deno.

```
cd unify-front-end/supabase/probes/companion-actions-360
./run.sh                       # starts the stack if needed, resets it, runs both Deno files
PROBE_STOP=1 ./run.sh          # same, then stops the stack

# the real mobile services (after run.sh, the candidate is applied)
eval "$(supabase status --workdir . -o env | sed 's/^/export PROBE_/')"
cd ../../.. && PROBE_JEST=1 npx jest __tests__/checklist/companionActionsLegacyCompat.probe.test.ts --watchAll=false

./mutation_check.py            # about 10 minutes; every line must say RED, exit 0
python3 -I mutation_check_test.py
deno test --no-check --node-modules-dir=none --allow-read --allow-write --allow-run --allow-env historical/harness_test.ts

# released clients (each checkout: `git worktree add --detach <dir> <sha>`, then `npm ci` in it;
# web also `npm install --no-save jsdom@25` so no tracked file changes)
PROBE_HISTORICAL="v1.6.0=<dir>=dc2ea1a7dc04b927b51e47abf5bd50fbb292f304" ./run.sh historical/historical_test.ts
PROBE_HISTORICAL="ota=<dir>=33135ac252e2f1700f15c846e0737555358bb388" ./run.sh historical/historical_test.ts
PROBE_HISTORICAL="web=<dir>=8c9ecbf857cca30d27f70bf3b8d4eb871fab670f" ./run.sh historical/web_consumer_test.ts
supabase stop --workdir . --no-backup
```

Dev-shell simulator run (what was done for the decision record): reset the stack, apply `historical/simulator_fixture.sql`, create one synthetic account with an onboarding profile (persona, stage, `arrival_date`), create a new simulator and install the existing Debug dev build, start Metro in the released checkout with `EXPO_PUBLIC_SUPABASE_*` set to the local stack, the public Sanity project and dataset, and PostHog pointed at a local sink, open `myapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8360`, then drive `historical/simulator-flows/*.yaml` with `maestro --device <udid> test`. Apply `candidate/up.sql` / `down.sql` with `psql -1` between phases and read `user_tasks` after each tap. Delete the simulator afterwards.

Keys and URLs come from `supabase status` at run time. Nothing is committed.

## What it does not prove

Hosted behavior (gateway, schema cache, hosted accounts), the App Store binary or a physical device (the simulator run uses a Debug dev build), reminder delivery. See section 9 of the decision record.
