#!/usr/bin/env bash
# Every companion-actions test file against this worker's stack, a db reset before each.
set -u
cd "$(dirname "$0")/../.."
R=build/s370c-stack/run_checks.py
python3 $R sync || exit 2
status=0
for f in supabase/tests/companion-actions/*_test.ts; do
  python3 $R reset || exit 2
  python3 $R deno test --no-check --node-modules-dir=none --allow-net --allow-env --allow-read "$f" || status=$?
done
exit $status
