#!/usr/bin/env bash
# Operator script for the Qwen embedding rebuild (see the runbook of the same
# date). It calls the administrative interface of ingest-documents and stops on
# the first transport error, non-2xx status, malformed body, error field,
# invalid token or counter that does not add up. It never proves success from
# a missing field.
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
#   status | begin | acquire <run> | drain <run> <token> | activate <run> <token>
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

cmd_drain() {
  need_uuid run_id "${1:-}"
  need_uuid worker_token "${2:-}"
  local run="$1" token="$2" i=0 sent staged remaining prev="" total=0
  while :; do
    i=$((i + 1))
    [ "$i" -le "$MAX_BATCHES" ] || fail "more than $MAX_BATCHES batches; the run is not finishing"
    admin "$(payload embed_batch "$run" "$token")"
    jq -e '(.sent | '"$is_count"' and . <= 20) and (.staged | '"$is_count"' and . <= 20) and (.remaining | '"$is_count"')' \
      <<<"$RESP" >/dev/null || fail "response lacks valid counters (sent 0..20, staged, remaining): $(jq -c . <<<"$RESP" | head -c 200)"
    sent="$(jq -r .sent <<<"$RESP")"
    staged="$(jq -r .staged <<<"$RESP")"
    remaining="$(jq -r .remaining <<<"$RESP")"
    [ "$staged" -eq "$sent" ] || fail "staged $staged differs from sent $sent"
    echo "batch $i: sent $sent, staged $staged, remaining $remaining"
    if [ "$sent" -eq 0 ]; then
      [ "$remaining" -eq 0 ] || fail "sent 0 but $remaining chunks remaining; this is not completion"
      break
    fi
    if [ -n "$prev" ] && [ "$remaining" -ge "$prev" ]; then
      fail "no progress: remaining went from $prev to $remaining"
    fi
    prev="$remaining"
    total=$((total + sent))
  done
  # Completion is what the database says, not what the loop saw.
  admin "$(payload status)"
  jq -e --arg run "$run" '
    .status | (.run_id == $run) and (.phase == "rebuilding")
    and (.run_rows | '"$is_count"' and . > 0)
    and (.run_missing | '"$is_count"')' <<<"$RESP" >/dev/null ||
    fail "status does not show this run in phase rebuilding (check run_id, phase, run_rows, run_missing)"
  local missing rows
  missing="$(jq -r .status.run_missing <<<"$RESP")"
  rows="$(jq -r .status.run_rows <<<"$RESP")"
  [ "$missing" -eq 0 ] || fail "run_missing is $missing of $rows; not every chunk has a vector"
  echo "complete: all chunks have vectors (run_rows $rows, run_missing 0, sent in this call $total)"
  echo "NEXT: run the SQL coverage check of the runbook (step 4) before deploying the query."
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
