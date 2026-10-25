#!/usr/bin/env bash
# Operator script for the Qwen embedding rebuild (see the runbook of the same
# date). It calls the administrative interface of ingest-documents and stops on
# the first transport error, non-2xx status, malformed body, error field,
# invalid token, counter that does not add up or embed_batch receipt that is not
# exact. It never proves success from a missing field. Every embed_batch answer
# is checked before the next request is sent.
#
# Credentials: the service-role key is NOT read here. HEADERS_FILE names a file
# (mode 0600) holding the curl header lines; curl reads it with -H @file. The
# key never appears in an argument list or in output. The provider key stays in
# the function's own secrets.
#
# Environment:
#   FUNCTION_URL  https://<project>.supabase.co/functions/v1/ingest-documents
#   HEADERS_FILE  path of the header file
#   CURL          (optional) the curl binary; the dry run points it at a fake
#
# Usage: 20261025191600_qwen_embedding_rebuild.sh <command> [run_id] [worker_token]
#   status | begin | acquire <run> | batch <run> <token> | drain <run> <token>
#   activate <run> <token>
#   abort <run> | release_worker <run> [token] | enable_writers | rollback
#   return_to_qwen
# Exit 0 means every check of that command passed. Anything else means stop.
set -euo pipefail

CURL="${CURL:-curl}"
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
MAX_BATCHES=25 # 351 chunks need 18; more than this is a loop that is not finishing
BODY_FILE="$(mktemp)"
RESP=""

cleanup() { rm -f "$BODY_FILE"; }
trap cleanup EXIT
trap 'echo "INTERRUPTED: stop here. Check status, then follow Interruption recovery in the runbook. Do not go on to the next step." >&2; exit 130' INT TERM

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -n "${FUNCTION_URL:-}" ] || fail "FUNCTION_URL is not set"
case "$FUNCTION_URL" in https://*) ;; *) fail "FUNCTION_URL must start with https://" ;; esac
[ -n "${HEADERS_FILE:-}" ] && [ -r "$HEADERS_FILE" ] || fail "HEADERS_FILE is not set or not readable"

need_uuid() { # name value
  [[ "$2" =~ $UUID_RE ]] || fail "$1 must be a valid UUID"
}

# admin <json payload>: sets RESP to the validated body; exits on any problem.
admin() {
  local payload="$1" code rc=0
  # The payload goes on stdin, not in the argument list.
  code="$(printf '%s' "$payload" | "$CURL" -sS -o "$BODY_FILE" -w '%{http_code}' \
    -X POST "$FUNCTION_URL" -H @"$HEADERS_FILE" --max-time 120 --data @-)" || rc=$?
  if [ "$rc" -eq 130 ] || [ "$rc" -eq 143 ]; then
    echo "INTERRUPTED: curl was stopped by a signal. The batch may or may not have been staged. Check status; follow Interruption recovery in the runbook." >&2
    exit 130
  fi
  [ "$rc" -eq 0 ] || fail "transport error (curl exit $rc); the batch may or may not have been staged, check status"
  if ! [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    local why
    why="$(jq -r '.error // empty' "$BODY_FILE" 2>/dev/null | tr -d '\000-\037' | head -c 200 || true)"
    fail "HTTP $code${why:+: $why}"
  fi
  jq -e 'type == "object"' "$BODY_FILE" >/dev/null 2>&1 || fail "response is not a JSON object"
  if jq -e 'has("error")' "$BODY_FILE" >/dev/null 2>&1; then
    fail "error in response: $(jq -r '.error | tostring' "$BODY_FILE" | tr -d '\000-\037' | head -c 200)"
  fi
  RESP="$(cat "$BODY_FILE")"
}

payload() { # operation [run_id] [worker_token]
  local op="$1" run="${2:-}" token="${3:-}"
  jq -nc --arg op "$op" --arg run "$run" --arg token "$token" '
    {action: "embedding_rebuild", operation: $op}
    + (if $run != "" then {run_id: $run} else {} end)
    + (if $token != "" then {worker_token: $token} else {} end)'
}

# jq filters that must be true for the body of each command.
is_count='(type == "number" and . == floor and . >= 0)'

cmd_status() {
  admin "$(payload status)"
  jq -e '.status | type == "object" and (.phase | type == "string")' <<<"$RESP" >/dev/null ||
    fail "status body has no phase"
  jq -c '.status' <<<"$RESP"
}

cmd_begin() {
  admin "$(payload begin)"
  jq -e '(.run_id | type == "string") and (.chunks | '"$is_count"')' <<<"$RESP" >/dev/null ||
    fail "begin body has no run_id and chunk counts"
  need_uuid run_id "$(jq -r .run_id <<<"$RESP")"
  jq -c . <<<"$RESP"
}

cmd_acquire() {
  need_uuid run_id "${1:-}"
  admin "$(payload acquire_worker "$1")"
  local token
  token="$(jq -r '.worker_token // empty' <<<"$RESP")"
  need_uuid worker_token "$token"
  printf '%s\n' "$token"
}

# The receipt contract of a positive embed_batch answer (runbook "Receipt gate").
MODEL="qwen/qwen3-embedding-8b"
CONTRACT="qwen3-8b-prefix1536-l2-v1"
# An exact whole number as written in the body: 20.0, 2E+1 or "20" is not one.
JQ_INT='def int: type == "number" and (tojson | test("^(0|[1-9][0-9]{0,8})$"));'

# read_status <run>: sets ROWS and MISSING from the database, or exits. Absent
# counts are refused, never read as zero.
ROWS=""
MISSING=""
read_status() {
  admin "$(payload status)"
  local why
  why="$(jq -r --arg run "$1" "$JQ_INT"'
    if (.status | type) != "object" then "status body has no status object"
    elif .status.run_id != $run then "status run_id is not this run"
    elif .status.phase != "rebuilding" then "status phase is not rebuilding"
    elif (.status.run_rows | int | not) or .status.run_rows < 1 then "status run_rows is not a positive whole number"
    elif (.status.run_missing | int | not) then "status run_missing is not a whole number"
    elif .status.run_missing > .status.run_rows then "status run_missing is more than run_rows"
    else "ok" end' <<<"$RESP")"
  [ "$why" = ok ] || fail "$why (check run_id, phase, run_rows, run_missing)"
  ROWS="$(jq -r .status.run_rows <<<"$RESP")"
  MISSING="$(jq -r .status.run_missing <<<"$RESP")"
}

# send_batch <run> <token> <missing before>: ONE embed_batch request. Sets SENT
# and REMAINING, or exits before any other request. A positive answer must carry
# the exact receipt; the empty answer must carry none. Used by batch and drain.
SENT=""
REMAINING=""
send_batch() {
  admin "$(payload embed_batch "$1" "$2")"
  local why
  why="$(jq -r --argjson prev "$3" --arg model "$MODEL" --arg contract "$CONTRACT" "$JQ_INT"'
    if (.sent | int | not) or (.staged | int | not) or (.remaining | int | not) then
      "response lacks valid counters (sent, staged and remaining must be whole numbers)"
    elif .sent == 0 then
      if (keys != ["remaining", "sent", "staged"]) then "the empty answer (sent 0) must hold only sent, staged and remaining, and no receipt"
      elif .staged != 0 or .remaining != 0 then "sent 0 with staged \(.staged) and remaining \(.remaining) is not completion"
      elif $prev != 0 then "sent 0 while \($prev) chunks are missing is not completion"
      else "ok" end
    elif .sent > 20 then "sent \(.sent) is more than 20 chunks"
    elif .sent > $prev then "sent \(.sent) is more than the \($prev) missing chunks"
    elif .staged != .sent then "staged \(.staged) differs from sent \(.sent)"
    elif .remaining != $prev - .sent then "remaining \(.remaining) is not \($prev) missing minus sent \(.sent)"
    elif (has("receipt") | not) then "a positive batch has no receipt"
    elif (keys != ["receipt", "remaining", "sent", "staged"]) then "the answer holds fields other than sent, staged, remaining and receipt"
    elif (.receipt | type) != "object" then "the receipt is not an object"
    elif (.receipt | keys) != ["checked", "contract", "identity", "model", "native_dimensions", "stored_dimensions"] then
      "the receipt fields are not exactly model, contract, identity, checked, native_dimensions and stored_dimensions"
    elif .receipt.model != $model then "receipt model is not \($model)"
    elif .receipt.contract != $contract then "receipt contract is not \($contract)"
    elif .receipt.identity != "canonical" and .receipt.identity != "catalog_hf" then "receipt identity is not canonical or catalog_hf"
    elif (.receipt.native_dimensions | int | not) or .receipt.native_dimensions != 4096 then "receipt native_dimensions is not 4096"
    elif (.receipt.stored_dimensions | int | not) or .receipt.stored_dimensions != 1536 then "receipt stored_dimensions is not 1536"
    elif (.receipt.checked | int | not) or .receipt.checked != .sent then "receipt checked is not equal to sent"
    else "ok" end' <<<"$RESP" 2>/dev/null || echo "response could not be checked")"
  [ "$why" = ok ] || fail "$why. Stop: send no other batch. Read Receipt gate and Interruption recovery in the runbook."
  SENT="$(jq -r .sent <<<"$RESP")"
  REMAINING="$(jq -r .remaining <<<"$RESP")"
}

receipt_line() {
  jq -r '.receipt | "receipt: model \(.model), contract \(.contract), identity \(.identity), checked \(.checked), native_dimensions \(.native_dimensions), stored_dimensions \(.stored_dimensions)"' <<<"$RESP"
}

# Completion is what the database says, not what the loop saw.
confirm_complete() { # run rows sent-in-this-call
  read_status "$1"
  [ "$ROWS" -eq "$2" ] || fail "status run_rows went from $2 to $ROWS during this call"
  [ "$MISSING" -eq 0 ] || fail "run_missing is $MISSING of $ROWS; not every chunk has a vector"
  echo "complete: all chunks have vectors (run_rows $ROWS, run_missing 0, sent in this call $3)"
  echo "NEXT: run the SQL coverage check of the runbook (step 4) before deploying the query."
}

# batch <run> <token>: exactly one embed_batch, checked against the receipt and
# the database, then a stop. The first batch of a run goes through here.
cmd_batch() {
  need_uuid run_id "${1:-}"
  need_uuid worker_token "${2:-}"
  local run="$1" token="$2" rows before
  read_status "$run"
  rows="$ROWS"
  before="$MISSING"
  send_batch "$run" "$token" "$before"
  echo "batch: sent $SENT, staged $SENT, remaining $REMAINING (missing before $before)"
  if [ "$SENT" -eq 0 ]; then
    confirm_complete "$run" "$rows" 0
    return
  fi
  receipt_line
  read_status "$run"
  [ "$ROWS" -eq "$rows" ] || fail "status run_rows went from $rows to $ROWS during the batch"
  [ "$MISSING" -eq "$REMAINING" ] || fail "the database shows run_missing $MISSING, expected $REMAINING ($before missing minus sent $SENT)"
  echo "database: run_rows $ROWS, run_missing $MISSING (down by $SENT)"
  echo "STOP: one batch was sent and its receipt passed. Send nothing else yet. Run block 5 of the preflight for this run and expect missing $MISSING, wrong_dimensions 0, not_frozen 0, run_rows $ROWS. Run drain only when all four agree."
}

# drain <run> <token>: the remaining batches, one request at a time, every
# positive answer checked like a single batch. It refuses to start while no
# chunk of the run has a vector: the first batch must go through batch.
cmd_drain() {
  need_uuid run_id "${1:-}"
  need_uuid worker_token "${2:-}"
  local run="$1" token="$2" i=0 rows missing total=0
  read_status "$run"
  rows="$ROWS"
  missing="$MISSING"
  [ "$missing" -lt "$rows" ] ||
    fail "no chunk of this run has a vector yet ($missing of $rows missing). Send the first batch with 'batch', pass its receipt gate, then drain."
  while :; do
    i=$((i + 1))
    [ "$i" -le "$MAX_BATCHES" ] || fail "more than $MAX_BATCHES batches; the run is not finishing"
    send_batch "$run" "$token" "$missing"
    echo "batch $i: sent $SENT, staged $SENT, remaining $REMAINING"
    [ "$SENT" -eq 0 ] && break
    receipt_line
    missing="$REMAINING"
    total=$((total + SENT))
  done
  confirm_complete "$run" "$rows" "$total"
}

cmd_activate() {
  need_uuid run_id "${1:-}"
  need_uuid worker_token "${2:-}"
  admin "$(payload activate "$1" "$2")"
  jq -e '(.chunks | '"$is_count"' and . > 0) and (.documents | '"$is_count"' and . > 0)' <<<"$RESP" >/dev/null ||
    fail "activate body has no chunk and document counts"
  echo "activated: chunks $(jq -r .chunks <<<"$RESP"), documents $(jq -r .documents <<<"$RESP")"
}

cmd_simple() { # operation required-jq-filter message [run] [token]
  admin "$(payload "$1" "${4:-}" "${5:-}")"
  jq -e "$2" <<<"$RESP" >/dev/null || fail "$1: the body does not confirm it ($3)"
  echo "$1: $(jq -c . <<<"$RESP")"
}

command="${1:-}"
[ -n "$command" ] || fail "usage: see the header of this file"
shift
case "$command" in
  status) cmd_status ;;
  begin) cmd_begin ;;
  acquire) cmd_acquire "$@" ;;
  batch) cmd_batch "$@" ;;
  drain) cmd_drain "$@" ;;
  activate) cmd_activate "$@" ;;
  abort)
    need_uuid run_id "${1:-}"
    cmd_simple abort '.aborted == true' 'aborted true' "$1"
    echo "Writers stay PAUSED. Follow Abort in the runbook before enable_writers." ;;
  release_worker)
    [ "$#" -le 2 ] || fail "release_worker takes <run_id> [worker_token]; got $# arguments"
    need_uuid run_id "${1:-}"
    # Presence, not content: an omitted token is the forced release; a token that
    # is supplied but empty or malformed must stop before any request.
    if [ "$#" -ge 2 ]; then need_uuid worker_token "$2"; fi
    cmd_simple release_worker '.released == true' 'released true' "$1" "${2:-}" ;;
  enable_writers)
    admin "$(payload enable_writers)"
    jq -e '.writers_paused == false' <<<"$RESP" >/dev/null || fail "enable_writers: writers_paused is not false"
    echo "writers resumed" ;;
  rollback)
    cmd_simple rollback '(.snapshot_chunks | '"$is_count"')' 'snapshot_chunks' ;;
  return_to_qwen)
    cmd_simple return_to_qwen '.returned == true' 'returned true' ;;
  *) fail "unknown command: $command" ;;
esac
