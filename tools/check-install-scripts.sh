#!/usr/bin/env bash
# Fails when a dependency's install script is not covered by allowScripts.
# npm 11 skips such scripts with only a warning, so a version bump of a pinned
# entry (e.g. sharp@0.32.6 -> 0.32.7) silently drops the native build.
# Usage: tools/check-install-scripts.sh [package-dir ...] (default: backend frontend)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
[ $# -gt 0 ] || set -- "$root/backend" "$root/frontend"
status=0

for dir in "$@"; do
  pending=$(cd "$dir" && npm install-scripts ls --json |
    node -e 'const { allowScripts = [] } = JSON.parse(require("fs").readFileSync(0, "utf8"));
      for (const { changes } of allowScripts) for (const { key } of changes) console.log(key);')
  if [ -n "$pending" ]; then
    echo "Unreviewed install scripts in $(basename "$dir") (npm would skip them):" >&2
    echo "$pending" | sed 's/^/  /' >&2
    echo "Review each package, then run 'npm install-scripts approve <pkg>' (or 'deny') in $(basename "$dir")." >&2
    status=1
  fi
done

exit $status
