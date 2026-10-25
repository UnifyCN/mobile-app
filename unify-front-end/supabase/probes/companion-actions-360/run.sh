#!/usr/bin/env bash
# Runs the Companion actions compatibility probe (#360) against a disposable
# local Supabase stack (Postgres 17, GoTrue, PostgREST, edge runtime, Kong).
# Usage: run.sh [test files...]     default: migration_test.ts, actions_test.ts, rejected_designs_test.ts
#        PROBE_STOP=1 run.sh        stop the stack afterwards
# Needs: docker, supabase CLI, deno. Refuses to touch anything but 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")"
if ! supabase status --workdir . >/dev/null 2>&1; then
  supabase start --workdir . >/dev/null
fi
# Back to the baseline-only schema (the candidate migration is applied by the tests).
supabase db reset --workdir . --local >/dev/null 2>&1 || { echo "db reset failed" >&2; exit 2; }
# PostgREST must pick up the reset schema before any request.
eval "$(supabase status --workdir . -o env 2>/dev/null | sed 's/^/export PROBE_/')"
for _ in $(seq 1 30); do
  docker kill --signal=SIGUSR1 supabase_rest_unify-companion-probe-360 >/dev/null 2>&1 || true
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PROBE_API_URL/rest/v1/user_tasks?select=user_task_id&limit=1" \
    -H "apikey: $PROBE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $PROBE_SERVICE_ROLE_KEY" || true)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] || { echo "PostgREST never saw the reset schema" >&2; exit 2; }
files=("$@"); [ ${#files[@]} -eq 0 ] && files=(migration_test.ts actions_test.ts regressions_test.ts rejected_designs_test.ts rollback_test.ts)
status=0
for f in "${files[@]}"; do
  extra=(); case "$f" in historical/*) extra=(--allow-run --allow-write);; esac   # runs a snapshot's Jest
  deno test --no-check --node-modules-dir=none --allow-net --allow-env --allow-read ${extra[@]+"${extra[@]}"} "$f" || status=$?
done
[ "${PROBE_STOP:-0}" = "1" ] && supabase stop --workdir . --no-backup >/dev/null 2>&1
exit $status
