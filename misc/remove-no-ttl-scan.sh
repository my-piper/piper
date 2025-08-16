#!/usr/bin/env bash
set -euo pipefail

# ---- Config ----
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-6379}"
DB="${DB:-0}"                  # you are using db0 per INFO
PATTERN="${PATTERN:-launch:*}" # key pattern to match
COUNT="${COUNT:-20000}"        # hint for SCAN (bigger = faster, more CPU)
BATCH="${BATCH:-10000}"        # keys per Lua call
DRY_RUN="${DRY_RUN:-0}"        # 1 = don't delete, just count
PASSWORD="${PASSWORD:-}"       # set if needed
USERNAME="${USERNAME:-}"       # set if needed
SOCKET="${SOCKET:-}"           # optional unix socket path
REDIS_URL="${REDIS_URL:-}"     # e.g. redis://:pass@host:6379/0

# ---- Build redis-cli base ----
rc=(redis-cli --no-auth-warning)
if [[ -n "$REDIS_URL" ]]; then
  rc+=(-u "$REDIS_URL")
else
  if [[ -n "$SOCKET" ]]; then
    rc+=(-s "$SOCKET")
  else
    rc+=(-h "$HOST" -p "$PORT")
  fi
  rc+=(-n "$DB")
  if [[ -n "$USERNAME" && -n "$PASSWORD" ]]; then
    rc+=(--user "$USERNAME" -a "$PASSWORD")
  elif [[ -n "$PASSWORD" ]]; then
    rc+=(-a "$PASSWORD")
  fi
fi

# Connectivity
if ! "${rc[@]}" PING >/dev/null 2>&1; then
  echo "Cannot connect to Redis (check HOST/PORT/URL/creds/socket)" >&2
  exit 2
fi

# Lua: delete only keys with no TTL; prefer UNLINK if available
LUA="$(cat <<'LUA'
local deleted = 0
local has_unlink = false
local info = redis.pcall('COMMAND','INFO','UNLINK')
if type(info) == 'table' and info[1] ~= nil then has_unlink = true end
for i=1,#KEYS do
  local k = KEYS[i]
  local ttl = redis.call('TTL', k)
  if ttl == -1 then
    if has_unlink then
      deleted = deleted + (redis.call('UNLINK', k) or 0)
    else
      deleted = deleted + (redis.call('DEL', k) or 0)
    end
  end
end
return deleted
LUA
)"
SCRIPT_SHA="$("${rc[@]}" SCRIPT LOAD "$LUA")"

echo "Pattern: $PATTERN | COUNT: $COUNT | BATCH: $BATCH | DRY_RUN: $DRY_RUN | DB: $DB"
echo "Lua SHA: $SCRIPT_SHA"
echo "Scanning and deleting…"

processed=0
deleted=0
declare -a batch=()

flush_batch () {
  local n=${#batch[@]}
  (( n == 0 )) && return
  local start=0
  while (( start < n )); do
    local chunk=$(( n - start ))
    (( chunk > BATCH )) && chunk=$BATCH
    local d
    d=$("${rc[@]}" EVALSHA "$SCRIPT_SHA" "$chunk" "${batch[@]:$start:$chunk}")
    deleted=$(( deleted + ${d:-0} ))
    start=$(( start + chunk ))
  done
  processed=$(( processed + n ))
  batch=()
}

# Stream keys using redis-cli's internal SCAN
# (It handles cursors internally and just prints keys)
i=0
# shellcheck disable=SC2046
while IFS= read -r k; do
  batch+=("$k")
  (( ++i % 50000 == 0 )) && echo "progress: seen=$i queued=${#batch[@]} processed≈$processed deleted=$deleted"
  (( ${#batch[@]} >= BATCH )) && flush_batch
done < <( "${rc[@]}" --scan --pattern "$PATTERN" --count "$COUNT" )

# flush remaining
flush_batch

echo "Done. Seen≈$i | Processed≈$processed | Deleted=$deleted (TTL==-1 only)"
