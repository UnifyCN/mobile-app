#!/usr/bin/env bash
# Dry run of the operator script 20261025191600_qwen_embedding_rebuild.sh.
#
# Why: the rebuild loop pays for provider calls, so it must stop on every error
# and must prove completion before the operator goes on. This runs the real
# script against a FAKE curl that answers from fixtures. It makes no network
# call, reads no secret and touches no database. The header file holds a
# sentinel, never a key.
# Scope guard: everything lives in one temporary directory, removed at exit.
# Revert: nothing to revert.
#
# Usage: bash 20261025191700_qwen_embedding_rebuild_dry_run.sh [script-path]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${1:-$HERE/20261025191600_qwen_embedding_rebuild.sh}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SENTINEL="SENTINEL-SERVICE-KEY-DO-NOT-PRINT"
RUN="11111111-2222-4333-8444-555555555555"
TOKEN="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
HEADERS="$WORK/headers"
umask 077
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$SENTINEL" > "$HEADERS"

# The fake curl. Each call takes the next line of $FAKE_DIR/script:
#   "<http code><TAB><body>"   answer with that status and body
#   "EXIT<TAB><n>"             fail like a transport error with curl exit n
#   "TERM"                     the script receives a termination signal (an
#                              interactive Ctrl-C cannot be sent to a
#                              background job; the trap handles INT and TERM)
cat > "$WORK/curl" <<'FAKE'
#!/usr/bin/env bash
out=""; fmt=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[$i]}" in
    -o) out="${args[$((i + 1))]}" ;;
    -w) fmt="${args[$((i + 1))]}" ;;
  esac
done
n=$(( $(cat "$FAKE_DIR/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAKE_DIR/count"
# A script that keeps calling after every fixture is spent is a runaway loop.
if [ "$n" -gt 30 ]; then sleep 1; exit 98; fi
printf '%s\n' "$*" >> "$FAKE_DIR/argv"
cat > "$FAKE_DIR/payload.$n"
line="$(sed -n "${n}p" "$FAKE_DIR/script")"
[ -n "$line" ] || { echo "fake curl: no fixture for call $n" >&2; exit 99; }
if [ "$line" = "TERM" ]; then kill -TERM "$(cat "$FAKE_DIR/target")"; sleep 1; exit 143; fi
kind="${line%%$'\t'*}"; rest="${line#*$'\t'}"
if [ "$kind" = "EXIT" ]; then exit "$rest"; fi
printf '%s' "$rest" > "$out"
[ "$fmt" = '%{http_code}' ] && printf '%s' "$kind"
exit 0
FAKE
chmod +x "$WORK/curl"

pass=0; failn=0
# scenario <name> <expected: ok|fail> <expected stderr/stdout text or -> <calls> <command...>
# Fixtures are read from the variable FIXTURE (lines).
scenario() {
  local name="$1" expect="$2" text="$3" calls="$4"
  shift 4
  export FAKE_DIR="$WORK/fake"
  rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"
  printf '%s' "$FIXTURE" > "$FAKE_DIR/script"
  local out rc=0 pid wd
  # A watchdog ends a script that never stops (the old loop did not).
  CURL="$WORK/curl" FUNCTION_URL="https://example.invalid/functions/v1/ingest-documents" \
    HEADERS_FILE="$HEADERS" bash -c 'echo $$ > "$FAKE_DIR/target"; exec bash "$@"' _ "$SCRIPT" "$@" > "$WORK/out" 2>&1 &
  pid=$!
  ( sleep 6; kill -KILL "$pid" 2>/dev/null ) 2>/dev/null &
  wd=$!
  wait "$pid" 2>/dev/null || rc=$?
  kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  out="$(head -c 4000 "$WORK/out")"
  local made; made="$(cat "$FAKE_DIR/count" 2>/dev/null || echo 0)"
  local ok=1 why=""
  if [ "$expect" = ok ] && [ "$rc" -ne 0 ]; then ok=0; why="expected exit 0, got $rc"; fi
  if [ "$expect" = fail ] && [ "$rc" -eq 0 ]; then ok=0; why="expected a nonzero exit, got 0"; fi
  if [ "$text" != "-" ] && ! printf '%s' "$out" | grep -qF -- "$text"; then ok=0; why="$why; output lacks '$text'"; fi
  if [ "$calls" != "-" ] && [ "$made" != "$calls" ]; then ok=0; why="$why; expected $calls curl calls, saw $made"; fi
  if printf '%s' "$out" | grep -qF "$SENTINEL"; then ok=0; why="$why; the secret was printed"; fi
  if grep -qF "$SENTINEL" "$FAKE_DIR/argv" 2>/dev/null; then ok=0; why="$why; the secret reached an argument list"; fi
  if [ "$expect" = fail ] && printf '%s' "$out" | grep -qiE "complete|all chunks have vectors"; then ok=0; why="$why; a failure said complete"; fi
  if [ "$made" -gt 30 ]; then ok=0; why="$why; runaway loop past the fixtures"; fi
  if [ "$ok" = 1 ]; then pass=$((pass + 1)); echo "PASS  $name (exit $rc, $made curl calls)"
  else failn=$((failn + 1)); echo "FAIL  $name: $why"; echo "      output: $(printf '%s' "$out" | head -c 300 | tr '\n' ' ')"; fi
}

T=$'\t'
STATUS_OK='{"status":{"phase":"rebuilding","run_id":"'$RUN'","run_rows":31,"run_missing":0}}'
B1='{"sent":20,"staged":20,"remaining":11}'
B2='{"sent":11,"staged":11,"remaining":0}'
B0='{"sent":0,"staged":0,"remaining":0}'

FIXTURE="200${T}${B1}
200${T}${B2}
200${T}${B0}
200${T}${STATUS_OK}
"
scenario "drain: valid counters, then coverage proven" ok "all chunks have vectors" 4 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B1}
EXIT${T}28
"
scenario "drain: interrupted by a transport error is not success" fail "transport" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B1}
TERM
"
scenario "drain: a termination signal is not success" fail "INTERRUPTED" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B1}
EXIT${T}130
"
scenario "drain: curl killed by Ctrl-C is reported as interrupted" fail "INTERRUPTED" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}<html>bad gateway</html>
"
scenario "drain: a non-JSON body is refused" fail "not a JSON object" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B1:0:20}
"
scenario "drain: a truncated body is refused" fail "not a JSON object" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{}
"
scenario "drain: a body without counters is refused" fail "counters" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{\"sent\":\"20\",\"staged\":20,\"remaining\":11}
"
scenario "drain: a string counter is refused" fail "counters" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{\"sent\":21,\"staged\":21,\"remaining\":3}
"
scenario "drain: more than 20 chunks in a batch is refused" fail "counters" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{\"sent\":20,\"staged\":19,\"remaining\":11}
"
scenario "drain: staged different from sent is refused" fail "staged" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{\"error\":\"Another worker holds this run\"}
"
scenario "drain: an error field in a 200 body is refused" fail "error" 1 drain "$RUN" "$TOKEN"

FIXTURE="409${T}{\"error\":\"Worker lease lost\"}
"
scenario "drain: HTTP 409 lease lost stops the loop" fail "HTTP 409" 1 drain "$RUN" "$TOKEN"

FIXTURE="502${T}{\"error\":\"Invalid embedding response\"}
"
scenario "drain: HTTP 502 contract error stops the loop" fail "HTTP 502" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{\"sent\":0,\"staged\":0,\"remaining\":4}
"
scenario "drain: sent 0 with chunks remaining is not completion" fail "remaining" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B1}
200${T}${B1}
"
scenario "drain: no progress between batches stops the loop" fail "progress" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B2}
200${T}${B0}
200${T}{\"status\":{\"phase\":\"rebuilding\",\"run_id\":\"$RUN\",\"run_rows\":31,\"run_missing\":4}}
"
scenario "drain: database coverage with missing vectors is not completion" fail "run_missing" 3 drain "$RUN" "$TOKEN"

FIXTURE="200${T}${B2}
200${T}${B0}
200${T}{\"status\":{\"phase\":\"qwen\",\"run_id\":\"$RUN\",\"run_rows\":31,\"run_missing\":0}}
"
scenario "drain: a status from the wrong phase is refused" fail "phase" 3 drain "$RUN" "$TOKEN"

FIXTURE=""
scenario "drain: an invalid run id is refused before any call" fail "run_id" 0 drain "not-a-uuid" "$TOKEN"
scenario "drain: an invalid worker token is refused before any call" fail "worker_token" 0 drain "$RUN" "mistyped-token"

FIXTURE="200${T}{\"worker_token\":\"$TOKEN\"}
"
scenario "acquire: a valid token is printed" ok "$TOKEN" 1 acquire "$RUN"
FIXTURE="200${T}{\"worker_token\":\"nope\"}
"
scenario "acquire: an invalid token is refused" fail "worker_token" 1 acquire "$RUN"
FIXTURE="200${T}{\"error\":\"partial\",\"worker_token\":\"$TOKEN\"}
"
scenario "acquire: an error field beside a valid token is refused" fail "error in response" 1 acquire "$RUN"
FIXTURE="409${T}{\"error\":\"Another worker holds this run\"}
"
scenario "acquire: HTTP 409 is refused" fail "HTTP 409" 1 acquire "$RUN"

FIXTURE="200${T}{\"chunks\":31,\"documents\":4}
"
scenario "activate: a counted cutover is accepted" ok "chunks 31" 1 activate "$RUN" "$TOKEN"
FIXTURE="409${T}{\"error\":\"The corpus changed\"}
"
scenario "activate: HTTP 409 corpus changed is refused" fail "HTTP 409" 1 activate "$RUN" "$TOKEN"
FIXTURE="200${T}{\"ok\":true}
"
scenario "activate: a body without counts is refused" fail "counts" 1 activate "$RUN" "$TOKEN"

FIXTURE="200${T}{\"writers_paused\":false}
"
scenario "enable_writers: confirmed by the body" ok "writers resumed" 1 enable_writers
FIXTURE="200${T}{\"writers_paused\":true}
"
scenario "enable_writers: a body that says paused is refused" fail "writers_paused" 1 enable_writers

FIXTURE="200${T}{\"released\":true}
"
scenario "release_worker: with a token" ok "released" 1 release_worker "$RUN" "$TOKEN"
scenario "release_worker: a malformed token is refused before any call" fail "worker_token" 0 release_worker "$RUN" "mistyped-token"

# release_worker: the token argument is either ABSENT (the operator's forced
# release) or a valid UUID. A supplied empty, blank or malformed token must
# fail before any request; "no payload" below is the count of admin calls.
# payload_has <name> <jq args...> <filter>: the first admin payload of the last scenario.
payload_has() {
  if jq -e "${@:2}" "$WORK/fake/payload.1" >/dev/null 2>&1; then
    pass=$((pass + 1)); echo "PASS  $1"
  else
    failn=$((failn + 1)); echo "FAIL  $1: payload was $(head -c 300 "$WORK/fake/payload.1" 2>/dev/null)"
  fi
}
REL="200${T}{\"released\":true}
"
FIXTURE="$REL"
scenario "release_worker: an omitted token is the forced release" ok "released" 1 release_worker "$RUN"
payload_has "release_worker: forced release sends run_id and no worker_token" \
  --arg run "$RUN" '. == {action: "embedding_rebuild", operation: "release_worker", run_id: $run}'
FIXTURE="$REL"
scenario "release_worker: a valid token is sent" ok "released" 1 release_worker "$RUN" "$TOKEN"
payload_has "release_worker: valid-token release sends the worker_token" \
  --arg run "$RUN" --arg tok "$TOKEN" '. == {action: "embedding_rebuild", operation: "release_worker", run_id: $run, worker_token: $tok}'
FIXTURE="$REL"
scenario "release_worker: an uppercase valid token is sent" ok "released" 1 release_worker "$RUN" "${TOKEN^^}"
for bad in "" " " "   " "$TOKEN " " $TOKEN" "${TOKEN}"$'\n' "null" "undefined" "${TOKEN:0:35}" "${TOKEN}0"; do
  FIXTURE="$REL"
  label="$(printf '%q' "$bad")"
  scenario "release_worker: supplied token [$label] is refused before any call" fail "worker_token" 0 release_worker "$RUN" "$bad"
  [ ! -e "$WORK/fake/payload.1" ] && { pass=$((pass + 1)); echo "PASS  release_worker: token [$label] sent no admin payload"; } ||
    { failn=$((failn + 1)); echo "FAIL  release_worker: token [$label] sent an admin payload"; }
done
FIXTURE="$REL"
scenario "release_worker: an extra argument is refused before any call" fail "arguments" 0 release_worker "$RUN" "$TOKEN" extra
FIXTURE="$REL"
scenario "release_worker: an extra argument after an empty token is refused" fail "arguments" 0 release_worker "$RUN" "" extra
FIXTURE="$REL"
scenario "release_worker: an extra argument after the run id is refused (forced form)" fail "arguments" 0 release_worker "$RUN" "$TOKEN" "" 
FIXTURE="$REL"
scenario "release_worker: no run id is refused before any call" fail "run_id" 0 release_worker

echo
echo "dry run: $pass passed, $failn failed"
[ "$failn" -eq 0 ]
