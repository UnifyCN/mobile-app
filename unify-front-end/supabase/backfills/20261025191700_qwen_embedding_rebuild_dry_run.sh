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
# Runs on the macOS system Bash 3.2: no ${var^^}, no Bash 4 features.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${1:-$HERE/20261025191600_qwen_embedding_rebuild.sh}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# A shell error in this file (a bad substitution, a missing command) must never
# end in a success summary. Stderr of the harness goes to a file, and the
# summary refuses to pass when that file holds anything. Scenario output has its
# own file, so an intended failure of the script under test does not land here.
exec 3>&2 2>"$WORK/harness.err"
EXPECTED_ASSERTIONS=141

SENTINEL="SENTINEL-SERVICE-KEY-DO-NOT-PRINT"
RUN="11111111-2222-4333-8444-555555555555"
TOKEN="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
TOKEN_UPPER="AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"
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
MODEL="qwen/qwen3-embedding-8b"
CONTRACT="qwen3-8b-prefix1536-l2-v1"
# rcpt <checked> [identity]: a receipt as the deployed adapter returns it.
rcpt() {
  printf '{"model":"%s","contract":"%s","identity":"%s","checked":%s,"native_dimensions":4096,"stored_dimensions":1536}' \
    "$MODEL" "$CONTRACT" "${2:-canonical}" "$1"
}
# bat <sent> <remaining> [receipt]: a positive embed_batch answer.
bat() { printf '{"sent":%s,"staged":%s,"remaining":%s,"receipt":%s}' "$1" "$1" "$2" "${3:-$(rcpt "$1")}"; }
# st <run_missing> [run_rows] [phase] [run_id]: a status answer for the run.
st() {
  printf '{"status":{"phase":"%s","run_id":"%s","worker_live":true,"run_rows":%s,"run_missing":%s}}' \
    "${3:-rebuilding}" "${4:-$RUN}" "${2:-31}" "$1"
}
B0='{"sent":0,"staged":0,"remaining":0}'
# embeds <name> <n>: the last scenario sent exactly n embed_batch requests.
embeds() {
  local n=0 f
  for f in "$WORK/fake"/payload.*; do
    [ -e "$f" ] || continue
    if jq -e '.operation == "embed_batch"' "$f" >/dev/null 2>&1; then n=$((n + 1)); fi
  done
  if [ "$n" -eq "$2" ]; then pass=$((pass + 1)); echo "PASS  $1 (embed_batch requests: $n)"
  else failn=$((failn + 1)); echo "FAIL  $1: expected $2 embed_batch requests, saw $n"; fi
}

# drain starts after the first batch of the run passed the receipt gate: 20 of
# 31 chunks have vectors, 11 are missing.
FIXTURE="200${T}$(st 11)
200${T}$(bat 11 0)
200${T}${B0}
200${T}$(st 0)
"
scenario "drain: valid receipts and counters, then coverage proven" ok "all chunks have vectors" 4 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 25)
200${T}$(bat 20 5 "$(rcpt 20 catalog_hf)")
200${T}$(bat 5 0)
200${T}${B0}
200${T}$(st 0)
"
scenario "drain: a resumed partial run counts from its real missing figure" ok "sent in this call 25" 5 drain "$RUN" "$TOKEN"

# The runbook order that the review reproduced: acquire, then drain at once.
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 11)
"
scenario "drain: refused before any batch while no chunk of the run has a vector" fail "batch" 1 drain "$RUN" "$TOKEN"
embeds "drain: no embed_batch before the first-batch gate" 0

FIXTURE="200${T}$(st 11)
200${T}$(bat 11 0)
"
scenario "drain: a run that stops before its empty answer is not success" fail "-" 3 drain "$RUN" "$TOKEN"

FIXTURE="200${T}{\"status\":{\"phase\":\"rebuilding\",\"run_id\":\"$RUN\",\"run_rows\":31}}
"
scenario "drain: a starting status without run_missing is refused" fail "run_missing" 1 drain "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 11 31 rebuilding 99999999-2222-4333-8444-555555555555)
"
scenario "drain: a starting status of another run is refused" fail "run_id" 1 drain "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 11 31 legacy)
"
scenario "drain: a starting status outside phase rebuilding is refused" fail "phase" 1 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 25)
200${T}$(bat 20 5)
EXIT${T}28
"
scenario "drain: interrupted by a transport error is not success" fail "transport" 3 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 25)
200${T}$(bat 20 5)
TERM
"
scenario "drain: a termination signal is not success" fail "INTERRUPTED" 3 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 25)
200${T}$(bat 20 5)
EXIT${T}130
"
scenario "drain: curl killed by Ctrl-C is reported as interrupted" fail "INTERRUPTED" 3 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}<html>bad gateway</html>
"
scenario "drain: a non-JSON body is refused" fail "not a JSON object" 2 drain "$RUN" "$TOKEN"

B11="$(bat 11 0)"
FIXTURE="200${T}$(st 11)
200${T}${B11:0:20}
"
scenario "drain: a truncated body is refused" fail "not a JSON object" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}{}
"
scenario "drain: a body without counters is refused" fail "counters" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}{\"sent\":\"11\",\"staged\":11,\"remaining\":0,\"receipt\":$(rcpt 11)}
"
scenario "drain: a string counter is refused" fail "counters" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 30)
200${T}$(bat 21 9)
"
scenario "drain: more than 20 chunks in a batch is refused" fail "20" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}{\"sent\":11,\"staged\":10,\"remaining\":0,\"receipt\":$(rcpt 11)}
"
scenario "drain: staged different from sent is refused" fail "staged" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}{\"error\":\"Another worker holds this run\"}
"
scenario "drain: an error field in a 200 body is refused" fail "error" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
409${T}{\"error\":\"Worker lease lost\"}
"
scenario "drain: HTTP 409 lease lost stops the loop" fail "HTTP 409" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 25)
200${T}$(bat 20 5)
502${T}{\"error\":\"Invalid embedding response\",\"category\":\"response\",\"identity\":\"unrecognized_string\"}
"
scenario "drain: a later HTTP 502 contract error stops the loop" fail "HTTP 502" 3 drain "$RUN" "$TOKEN"
embeds "drain: no embed_batch after a 502 refusal" 2

FIXTURE="200${T}$(st 4)
200${T}${B0}
"
scenario "drain: sent 0 while chunks are missing is not completion" fail "missing" 2 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 25)
200${T}$(bat 20 11)
"
scenario "drain: remaining that is not the missing count minus sent stops the loop" fail "remaining" 2 drain "$RUN" "$TOKEN"
embeds "drain: no embed_batch after a wrong remaining" 1

FIXTURE="200${T}$(st 11)
200${T}$(bat 11 0)
200${T}${B0}
200${T}$(st 4)
"
scenario "drain: database coverage with missing vectors is not completion" fail "run_missing" 4 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}$(bat 11 0)
200${T}${B0}
200${T}$(st 0 31 qwen)
"
scenario "drain: a final status from the wrong phase is refused" fail "phase" 4 drain "$RUN" "$TOKEN"

FIXTURE="200${T}$(st 11)
200${T}$(bat 11 0)
200${T}${B0}
200${T}$(st 0 32)
"
scenario "drain: a final status whose run_rows changed is refused" fail "run_rows" 4 drain "$RUN" "$TOKEN"

# bad <sent> <remaining> <case>: a positive answer whose receipt breaks one rule.
bad() {
  local n="$1" r="$2" ok
  ok="\"model\":\"$MODEL\",\"contract\":\"$CONTRACT\",\"identity\":\"canonical\""
  case "$3" in
    absent) printf '{"sent":%s,"staged":%s,"remaining":%s}' "$n" "$n" "$r"; return ;;
    null) bat "$n" "$r" null; return ;;
    string) bat "$n" "$r" '"ok"'; return ;;
    list) bat "$n" "$r" '[]'; return ;;
    extra_top) printf '{"sent":%s,"staged":%s,"remaining":%s,"receipt":%s,"note":"x"}' "$n" "$n" "$r" "$(rcpt "$n")"; return ;;
    other_model) bat "$n" "$r" "{\"model\":\"openai/text-embedding-3-small\",\"contract\":\"$CONTRACT\",\"identity\":\"canonical\",\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    catalog_model) bat "$n" "$r" "{\"model\":\"Qwen/Qwen3-Embedding-8B\",\"contract\":\"$CONTRACT\",\"identity\":\"catalog_hf\",\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    contract) bat "$n" "$r" "{\"model\":\"$MODEL\",\"contract\":\"qwen3-8b-prefix1536-l2-v0\",\"identity\":\"canonical\",\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    identity) bat "$n" "$r" "{\"model\":\"$MODEL\",\"contract\":\"$CONTRACT\",\"identity\":\"unrecognized_string\",\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    no_identity) bat "$n" "$r" "{\"model\":\"$MODEL\",\"contract\":\"$CONTRACT\",\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    no_checked) bat "$n" "$r" "{$ok,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    extra_field) bat "$n" "$r" "{$ok,\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536,\"provider\":\"x\"}" ;;
    checked_less) bat "$n" "$r" "{$ok,\"checked\":$((n - 1)),\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    checked_string) bat "$n" "$r" "{$ok,\"checked\":\"$n\",\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    checked_float) bat "$n" "$r" "{$ok,\"checked\":$n.0,\"native_dimensions\":4096,\"stored_dimensions\":1536}" ;;
    native_1536) bat "$n" "$r" "{$ok,\"checked\":$n,\"native_dimensions\":1536,\"stored_dimensions\":1536}" ;;
    native_string) bat "$n" "$r" "{$ok,\"checked\":$n,\"native_dimensions\":\"4096\",\"stored_dimensions\":1536}" ;;
    stored_4096) bat "$n" "$r" "{$ok,\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":4096}" ;;
    stored_float) bat "$n" "$r" "{$ok,\"checked\":$n,\"native_dimensions\":4096,\"stored_dimensions\":1536.0}" ;;
  esac
}
RECEIPT_CASES="absent null string list extra_top other_model catalog_model contract identity no_identity no_checked extra_field checked_less checked_string checked_float native_1536 native_string stored_4096 stored_float"
for c in $RECEIPT_CASES; do
  FIXTURE="200${T}$(st 25)
200${T}$(bad 20 5 "$c")
200${T}$(bat 5 0)
"
  scenario "drain: first batch with receipt [$c] is refused" fail "Stop: send no other batch" 2 drain "$RUN" "$TOKEN"
  embeds "drain: no second embed_batch after receipt [$c]" 1
done
for c in absent other_model checked_less extra_field; do
  FIXTURE="200${T}$(st 25)
200${T}$(bat 20 5)
200${T}$(bad 5 0 "$c")
200${T}${B0}
"
  scenario "drain: later batch with receipt [$c] is refused" fail "Stop: send no other batch" 3 drain "$RUN" "$TOKEN"
  embeds "drain: no further embed_batch after a later receipt [$c]" 2
done
FIXTURE="200${T}$(st 0)
200${T}{\"sent\":0,\"staged\":0,\"remaining\":0,\"receipt\":$(rcpt 0)}
"
scenario "drain: an empty answer that carries a receipt is refused" fail "no receipt" 2 drain "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 11)
200${T}{\"staged\":11,\"remaining\":0,\"receipt\":$(rcpt 11)}
"
scenario "drain: an absent sent counter is not read as zero" fail "counters" 2 drain "$RUN" "$TOKEN"

# batch: the first batch of a fresh run (31 chunks, none with a vector yet).
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 11)
200${T}$(st 11)
"
scenario "batch: one checked batch, then a stop with the coverage figures" ok "expect missing 11, wrong_dimensions 0, not_frozen 0, run_rows 31" 3 batch "$RUN" "$TOKEN"
embeds "batch: exactly one embed_batch request" 1
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 11 "$(rcpt 20 catalog_hf)")
200${T}$(st 11)
"
scenario "batch: the catalog_hf identity class is accepted" ok "identity catalog_hf" 3 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 9)
200${T}$(bat 9 0)
200${T}$(st 0)
"
scenario "batch: a resumed partial run counts from its real missing figure" ok "missing before 9" 3 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 31)
200${T}$(bad 20 11 absent)
200${T}$(st 11)
"
scenario "batch: a positive answer without a receipt is refused" fail "no receipt" 2 batch "$RUN" "$TOKEN"
embeds "batch: nothing sent after a missing receipt" 1
FIXTURE="200${T}$(st 31)
200${T}$(bad 20 11 other_model)
200${T}$(st 11)
"
scenario "batch: a receipt naming another model is refused" fail "receipt model" 2 batch "$RUN" "$TOKEN"
embeds "batch: nothing sent after a wrong-model receipt" 1
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 11)
200${T}$(st 12)
"
scenario "batch: a database delta that differs from the answer is refused" fail "run_missing 12, expected 11" 3 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 11)
200${T}$(st 11 32)
"
scenario "batch: run_rows that change during the batch are refused" fail "run_rows" 3 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 11)
200${T}{\"status\":{\"phase\":\"rebuilding\",\"run_id\":\"$RUN\",\"run_rows\":31}}
"
scenario "batch: a later status without run_missing is not read as zero" fail "run_missing" 3 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 31 31 rebuilding 99999999-2222-4333-8444-555555555555)
200${T}$(bat 20 11)
"
scenario "batch: a starting status of another run is refused" fail "run_id" 1 batch "$RUN" "$TOKEN"
embeds "batch: no embed_batch after a wrong starting status" 0
FIXTURE="200${T}{\"status\":{\"phase\":\"rebuilding\",\"run_id\":\"$RUN\",\"run_missing\":31}}
"
scenario "batch: a starting status without run_rows is refused" fail "run_rows" 1 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 31)
502${T}{\"error\":\"Invalid embedding response\",\"category\":\"response\",\"identity\":\"missing\"}
200${T}$(st 31)
"
scenario "batch: HTTP 502 stops with nothing more sent" fail "HTTP 502" 2 batch "$RUN" "$TOKEN"
embeds "batch: one embed_batch for a refused first batch" 1
FIXTURE="200${T}$(st 31)
200${T}$(bat 20 12)
"
scenario "batch: remaining that is not missing minus sent is refused" fail "remaining 12 is not 31 missing minus sent 20" 2 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 5)
200${T}$(bat 20 0)
"
scenario "batch: more chunks sent than were missing is refused" fail "more than the 5 missing" 2 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 0)
200${T}${B0}
200${T}$(st 0)
"
scenario "batch: the empty answer with nothing missing is completion" ok "all chunks have vectors" 3 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 0)
200${T}{\"sent\":0,\"staged\":0,\"remaining\":0,\"receipt\":$(rcpt 0)}
"
scenario "batch: an empty answer that carries a receipt is refused" fail "no receipt" 2 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 4)
200${T}${B0}
"
scenario "batch: sent 0 while chunks are missing is not completion" fail "missing" 2 batch "$RUN" "$TOKEN"
FIXTURE="200${T}$(st 31)
EXIT${T}28
"
scenario "batch: a transport error is not success" fail "transport" 2 batch "$RUN" "$TOKEN"
FIXTURE=""
scenario "batch: an invalid run id is refused before any call" fail "run_id" 0 batch "not-a-uuid" "$TOKEN"
scenario "batch: an invalid worker token is refused before any call" fail "worker_token" 0 batch "$RUN" "mistyped-token"

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
scenario "release_worker: an uppercase valid token is sent" ok "released" 1 release_worker "$RUN" "$TOKEN_UPPER"
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
ran=$((pass + failn))
if [ -s "$WORK/harness.err" ]; then
  echo "harness shell errors:" >&3; cat "$WORK/harness.err" >&3
  echo "dry run: INVALID, the harness hit a shell error ($ran of $EXPECTED_ASSERTIONS assertions ran)"
  exit 1
fi
if [ "$ran" -ne "$EXPECTED_ASSERTIONS" ]; then
  echo "dry run: INVALID, $ran assertions ran, expected $EXPECTED_ASSERTIONS (a case was skipped or added)"
  exit 1
fi
echo "dry run: $pass passed, $failn failed"
[ "$failn" -eq 0 ]
