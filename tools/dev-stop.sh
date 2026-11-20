#!/usr/bin/env bash
# Stops the components `make dev` starts (server, worker, periodic, sockets,
# frontend) if they are already running, however they were started.
#   - backend processes of this checkout are found by command line
#     (node --import=tsx <name>.ts) and working directory (backend/)
#   - anything listening on the server, sockets or frontend port is stopped too
# Sends SIGTERM, waits up to 10s, then SIGKILLs what is left.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
backend_dir="$root/backend"
env_file="$backend_dir/.env"
grace_seconds=10

env_port() {
  local name="$1" fallback="$2" value=""
  if [[ -f "$env_file" ]]; then
    value="$(sed -n "s/^${name}=\([0-9]*\).*/\1/p" "$env_file" | tail -1)"
  fi
  echo "${value:-$fallback}"
}

server_port="$(env_port SERVER_PORT 8081)"
sockets_port="$(env_port SOCKETS_PORT 8082)"
frontend_port=4200

process_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'
}

# Prints "<pid> <label>" for every running component.
find_components() {
  local name pid
  for name in server worker periodic sockets; do
    for pid in $(pgrep -f "node .*--import=tsx.* ${name}\.ts" 2>/dev/null || true); do
      # The node check skips shells whose command text merely mentions the script.
      if [[ "$(ps -o comm= -p "$pid" 2>/dev/null)" == *node && "$(process_cwd "$pid")" == "$backend_dir" ]]; then
        echo "$pid $name"
      fi
    done
  done
  local entry port label
  for entry in "$server_port:server" "$sockets_port:sockets" "$frontend_port:frontend"; do
    port="${entry%%:*}"
    label="${entry#*:}"
    for pid in $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true); do
      echo "$pid $label (:$port)"
    done
  done
}

components="$(find_components | sort -u -k1,1n)"
if [[ -z "$components" ]]; then
  exit 0
fi

pids=()
while read -r pid label; do
  echo "stopping $label (pid $pid)"
  pids+=("$pid")
  kill "$pid" 2>/dev/null || true
done <<<"$components"

for ((elapsed = 0; elapsed < grace_seconds; elapsed++)); do
  alive=()
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      alive+=("$pid")
    fi
  done
  if [[ ${#alive[@]} -eq 0 ]]; then
    exit 0
  fi
  sleep 1
done

echo "force-killing pids still running after ${grace_seconds}s: ${alive[*]}"
kill -9 "${alive[@]}" 2>/dev/null || true
