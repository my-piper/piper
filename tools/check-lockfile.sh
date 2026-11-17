#!/usr/bin/env bash
# Fails when `npm ci` would reject a package's lockfile. `npm install`, `npm ls`
# and the tests can all pass on a lockfile that `npm ci` (CI, Docker) refuses.
# Usage: tools/check-lockfile.sh [package-dir ...] (default: backend frontend)
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
[ $# -gt 0 ] || set -- "$root/backend" "$root/frontend"
status=0

for dir in "$@"; do
  if ! out=$(cd "$dir" && npm ci --dry-run --ignore-scripts --no-audit --no-fund 2>&1); then
    echo "npm ci would fail in $(basename "$dir"):" >&2
    # Keep npm's reason, drop the usage text it appends.
    echo "$out" | grep '^npm error .*[^ ]' | sed '/Clean install a project/,$d' >&2
    echo "Run 'npm install' in $(basename "$dir") and commit package.json with package-lock.json." >&2
    status=1
  fi
done

exit $status
