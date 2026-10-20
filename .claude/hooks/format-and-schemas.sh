#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): prettier on the edited file, and recompile
# schemas when a source schema changes.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] || [ ! -f "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$file")" rev-parse --show-toplevel)}"

case "$file" in
  "$root"/backend/core-kit/* | "$root"/frontend/src/ui-kit/* | */node_modules/*) exit 0 ;;
  "$root"/backend/*) pkg="$root/backend" ;;
  "$root"/frontend/*) pkg="$root/frontend" ;;
  *) pkg="" ;;
esac

if [ -n "$pkg" ]; then
  case "$file" in
    *.ts | *.js | *.mjs | *.json | *.scss | *.html | *.yaml | *.yml)
      (cd "$pkg" && npx --no-install prettier --write --log-level warn "$file") >&2 || true
      ;;
  esac
fi

case "$file" in
  "$root"/backend/schemas/compiled.json) ;;
  "$root"/backend/schemas/*.json)
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    if [ "$major" -ge 25 ] || [ "$major" -lt 22 ]; then
      echo "Schema changed but compiled.json was NOT regenerated: backend needs Node 22 (found $(node -v 2>/dev/null)). Run 'make schemas' on Node 22 before committing." >&2
      exit 2
    fi
    if ! out=$(make -C "$root" schemas 2>&1); then
      echo "make schemas failed after editing $file:" >&2
      echo "$out" | tail -20 >&2
      exit 2
    fi
    ;;
esac

exit 0
