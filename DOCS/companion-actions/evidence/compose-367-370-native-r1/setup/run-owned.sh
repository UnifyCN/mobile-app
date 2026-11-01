#!/usr/bin/env bash
# Runs the Companion task actions tests (mobile-app#361, #363) against a disposable
# local Supabase stack: Postgres 17, GoTrue, PostgREST, Kong and the edge runtime
# serving the real supabase/functions/companion-actions source (and the rag-query
# context module it imports, #365).
#
# Usage: run.sh [test files...]      default: every *_test.ts here
#        ACTIONS_STOP=1 run.sh       stop the stack afterwards
#        ACTIONS_KEEP=1 run.sh       start, reset and print the env, run no tests
# Needs docker, the Supabase CLI and deno. Refuses anything but 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")"
here=$(pwd)
# ACTIONS_FUNCTIONS_SRC substitutes a deliberately broken copy (mutation_check.py).
functions_src="${ACTIONS_FUNCTIONS_SRC:-$here/../../functions}"

# The edge runtime serves supabase/functions of this workdir. Copy the real
# source (the function and the shared modules it imports) before every run.
project_id=$(sed -n 's/^project_id = "\(.*\)"$/\1/p' supabase/config.toml)
[ -n "$project_id" ] || { echo "no project_id in supabase/config.toml" >&2; exit 2; }

rm -rf supabase/functions
mkdir -p supabase/functions/rag-query
cp -R "$functions_src/companion-actions" supabase/functions/companion-actions
# The function reads the caller's Checklist through the rag-query context module (#365)
# and shares the profile-fact check with rag-query (its place and arrival lists, #370).
cp -R "$functions_src/rag-query/lib" supabase/functions/rag-query/lib

# The published-content read of the function goes to the tests' stand-in (#366).
export ACTIONS_CONTENT_PORT="${ACTIONS_CONTENT_PORT:-60675}"
export ACTIONS_CONTENT_QUERY_URL="http://host.docker.internal:${ACTIONS_CONTENT_PORT}/content"
if ! supabase status --workdir . >/dev/null 2>&1; then
  supabase start --workdir . >/dev/null
fi
python3 /Users/savargupta/.t3/worktrees/Unify/t3-c68f1368/DOCS/companion-actions/evidence/compose-367-370-native-r1/owned.py labels
# Back to the hosted-shape baseline. The tests apply the production migration.
supabase db reset --workdir . --local >/dev/null 2>&1 || { echo "db reset failed" >&2; exit 2; }
eval "$(supabase status --workdir . -o env 2>/dev/null | sed 's/^/export ACTIONS_/')"
case "$ACTIONS_API_URL" in http://127.0.0.1:*) ;; *) echo "refusing non-local API URL" >&2; exit 2;; esac
# A reset drops every database connection. PostgREST keeps dead pool connections and
# answers "Database client error" until it reconnects, so restart it after each reset
# and wait until several requests in a row succeed.
rest_ready() {
  docker restart supabase_rest_${project_id} >/dev/null
  local ok=0 code
  for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$ACTIONS_API_URL/rest/v1/user_tasks?select=user_task_id&limit=1" \
      -H "apikey: $ACTIONS_SERVICE_ROLE_KEY" -H "Authorization: Bearer $ACTIONS_SERVICE_ROLE_KEY" || true)
    if [ "$code" = "200" ]; then ok=$((ok + 1)); [ $ok -ge 5 ] && return 0; else ok=0; sleep 0.5; fi
  done
  echo "PostgREST never saw the reset schema" >&2
  exit 2
}
# Restart the edge runtime so it serves the copied source.
docker restart supabase_edge_runtime_${project_id} >/dev/null
rest_ready

if [ "${ACTIONS_KEEP:-0}" = "1" ]; then
  supabase status --workdir . -o env 2>/dev/null | sed 's/^/export ACTIONS_/' | grep -E 'API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL'
  exit 0
fi

files=("$@"); [ ${#files[@]} -eq 0 ] && files=(*_test.ts)
status=0
for f in "${files[@]}"; do
  supabase db reset --workdir . --local >/dev/null 2>&1 || { echo "db reset failed" >&2; exit 2; }
  rest_ready
  filter=(); [ -n "${ACTIONS_FILTER:-}" ] && filter=(--filter "$ACTIONS_FILTER")
  deno test --no-check --node-modules-dir=none --allow-net --allow-env --allow-read ${filter[@]+"${filter[@]}"} "$f" || status=$?
done
[ "${ACTIONS_STOP:-0}" = "1" ] && supabase stop --workdir . --no-backup >/dev/null 2>&1
exit $status
