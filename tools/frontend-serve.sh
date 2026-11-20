#!/usr/bin/env bash
# Starts a fresh frontend dev server (ng serve on :4200), then exits.
# Used as the build step of the Zed "frontend: chrome" debug session, which
# waits for the build step to finish before launching Chrome.
#   tools/frontend-serve.sh        stop any running server, start a new one in the background, wait until ready
#   tools/frontend-serve.sh stop   stop the server, whoever started it
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
port=4200
log_file="$root/tmp/frontend-serve.log"
pid_file="$root/tmp/frontend-serve.pid"
timeout_seconds=180

is_ready() {
  curl -s -o /dev/null "http://localhost:$port/"
}

# Stops the server started by this script (its whole process group) and
# anything else still listening on the port, e.g. an ng serve started by hand.
stop_server() {
  if [[ -f "$pid_file" ]]; then
    kill -- "-$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  fi
  local pids
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
  for ((elapsed = 0; elapsed < 10; elapsed++)); do
    if [[ -z "$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)" ]]; then
      return 0
    fi
    sleep 1
  done
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill -9 $pids 2>/dev/null || true
  fi
}

if [[ "${1:-}" == "stop" ]]; then
  stop_server
  echo "frontend dev server stopped"
  exit 0
fi

if is_ready || lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "stopping the frontend dev server already running on :$port"
  stop_server
fi

mkdir -p "$root/tmp"
cd "$root/frontend"
# Job control puts the server in its own process group, so it outlives this
# script and "stop" can kill npm, ng and esbuild together.
set -m
nohup npm start >"$log_file" 2>&1 </dev/null &
set +m
server_pid=$!
echo "$server_pid" >"$pid_file"
echo "starting frontend dev server (pid $server_pid, log $log_file)"

for ((elapsed = 0; elapsed < timeout_seconds; elapsed += 2)); do
  if is_ready; then
    echo "frontend dev server ready on :$port"
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "frontend dev server exited:" >&2
    tail -20 "$log_file" >&2
    rm -f "$pid_file"
    exit 1
  fi
  sleep 2
done

echo "frontend dev server not ready after ${timeout_seconds}s, see $log_file" >&2
exit 1
