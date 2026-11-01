#!/usr/bin/env bash
# Runs one command with the env of the owned local stack only (project
# unify-compose-details-370-r1, workdir = the web test dir). Refuses a missing or foreign
# stack. Never prints keys. Usage: owned.sh <command...>
set -euo pipefail
P=unify-compose-details-370-r1
WD=/private/tmp/unify-review-actions-361-web-r5-deno-base-9d05/supabase/tests/companion-actions
for c in db rest kong auth edge_runtime; do
  got=$(docker inspect "supabase_${c}_${P}" --format '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}' 2>/dev/null || true)
  [ "$got" = "$P|$WD" ] || { echo "owned.sh: supabase_${c}_${P} label mismatch: '$got'" >&2; exit 3; }
done
eval "$(supabase status --workdir "$WD" -o env 2>/dev/null | sed 's/^/export ACTIONS_/')"
[ "$ACTIONS_API_URL" = "http://127.0.0.1:61751" ] || { echo "owned.sh: not the owned API" >&2; exit 3; }
export ACTIONS_DB_CONTAINER=supabase_db_$P ACTIONS_REST_CONTAINER=supabase_rest_$P ACTIONS_CONTENT_PORT=3268
export ACTIONS_CONTENT_QUERY_URL="http://host.docker.internal:3268/content"
exec "$@"
