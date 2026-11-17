#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): prettier on the edited file, recompile
# schemas when a source schema changes, and check that `npm ci` still accepts
# the lockfile after a package.json edit.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] || [ ! -f "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$file")" rev-parse --show-toplevel)}"

case "$file" in
  "$root"/backend/core-kit/* | */node_modules/*) exit 0 ;;
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
  "$root"/backend/package.json | "$root"/frontend/package.json)
    if ! out=$("$root/tools/check-lockfile.sh" "$pkg" 2>&1); then
      echo "$out" >&2
      exit 2
    fi
    ;;
  "$root"/backend/schemas/compiled.json) ;;
  "$root"/backend/schemas/*.json)
    required=$(cut -d. -f1 "$root/.nvmrc" | tr -d '[:space:]')
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    if [ "$major" != "$required" ]; then
      echo "Schema changed but compiled.json was NOT regenerated: backend needs Node $required from .nvmrc (found $(node -v 2>/dev/null)). Run 'make schemas' on Node $required before committing." >&2
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
