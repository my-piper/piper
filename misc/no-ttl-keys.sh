#!/usr/bin/env bash
set -euo pipefail

# Defaults (can be overridden by flags or env)
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-6379}"
DB="${DB:-0}"
OUTPUT="${OUTPUT:-redis_export.csv}"
PATTERN="${PATTERN:-*}"
COUNT="${COUNT:-1000}"
DELIM="${DELIM:-,}"
USERNAME="${USERNAME:-}"
PASSWORD="${PASSWORD:-}"
SOCKET="${SOCKET:-}"       # e.g. /var/run/redis/redis.sock
REDIS_URL="${REDIS_URL:-}" # e.g. redis://:pass@host:6379/0 or rediss://...

# Parse CLI flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2;;
    --port) PORT="$2"; shift 2;;
    --db) DB="$2"; shift 2;;
    --output) OUTPUT="$2"; shift 2;;
    --pattern) PATTERN="$2"; shift 2;;
    --count) COUNT="$2"; shift 2;;
    --delimiter|--delim) DELIM="$2"; shift 2;;
    --username) USERNAME="$2"; shift 2;;
    --password) PASSWORD="$2"; shift 2;;
    --socket) SOCKET="$2"; shift 2;;
    --url|--redis-url) REDIS_URL="$2"; shift 2;;
    -h|--help)
      cat <<EOF
Usage: $0 [--host HOST] [--port PORT] [--db N] [--output FILE]
          [--pattern KEYPATTERN] [--count N] [--username U] [--password P]
          [--socket /path/to/redis.sock] [--url redis://...]
Exports ONLY persistent keys (TTL == -1) as CSV with columns: key,type

Connection priority: --url > --socket > host/port.
EOF
      exit 0;;
    *)
      echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

# Build redis-cli base command
rcmd=(redis-cli --raw --no-auth-warning)
if [[ -n "$REDIS_URL" ]]; then
  rcmd+=(-u "$REDIS_URL")
else
  if [[ -n "$SOCKET" ]]; then
    rcmd+=(-s "$SOCKET")
  else
    rcmd+=(-h "$HOST" -p "$PORT")
  fi
  rcmd+=(-n "$DB")
  if [[ -n "$USERNAME" ]]; then
    # ACL-style auth
    rcmd+=(--user "$USERNAME" -a "$PASSWORD")
  elif [[ -n "$PASSWORD" ]]; then
    # Legacy/default user auth
    rcmd+=(-a "$PASSWORD")
  fi
fi

# Quick connectivity check
if ! "${rcmd[@]}" ping >/dev/null 2>&1; then
  echo "Cannot connect to Redis. Check connection params." >&2
  echo "Tried: ${rcmd[*]} (with secrets hidden)" >&2
  exit 2
fi

# Write header
echo "key${DELIM}type" > "$OUTPUT"

cursor="0"
while :; do
  # SCAN with MATCH/COUNT
  mapfile -t lines < <( "${rcmd[@]}" scan "$cursor" match "$PATTERN" count "$COUNT" )
  cursor="${lines[0]:-0}"

  # remaining lines are keys
  if (( ${#lines[@]} > 1 )); then
    for ((i=1; i<${#lines[@]}; i++)); do
      key="${lines[$i]}"

      # TYPE and TTL per key (skip quietly on transient errors)
      type="$("${rcmd[@]}" type "$key" 2>/dev/null || true)"
      ttl="$("${rcmd[@]}" ttl "$key" 2>/dev/null || echo -2)"

      # Only export keys without TTL (persistent)
      # TTL semantics: -2 = key doesn't exist, -1 = persistent, >=0 = expires in seconds
      if [[ "$ttl" -eq -1 ]]; then
        # CSV-escape the key if needed
        esc_key="$key"
        if [[ "$esc_key" == *"$DELIM"* || "$esc_key" == *'"'* || "$esc_key" == *$'\n'* || "$esc_key" == *$'\r'* ]]; then
          esc_key="${esc_key//\"/\"\"}"
          esc_key="\"$esc_key\""
        fi

        echo "${esc_key}${DELIM}${type}" >> "$OUTPUT"
      fi
    done
  fi

  [[ "$cursor" == "0" ]] && break
done

echo "Done. Wrote: $OUTPUT (persistent keys only)"
