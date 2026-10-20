#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit): block edits to generated, secret and lock files.
set -euo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

case "$file" in
  */schemas/compiled.json)
    echo "compiled.json is generated. Edit backend/schemas/*.json and run 'make schemas' instead." >&2
    exit 2
    ;;
  */.env | */.env.*)
    case "$file" in
      *.env.template) exit 0 ;;
    esac
    echo "Refusing to edit $file: it holds local secrets. Change .env.template or ask the user." >&2
    exit 2
    ;;
  */package-lock.json)
    echo "Do not edit package-lock.json by hand. Use npm install/uninstall in that package." >&2
    exit 2
    ;;
  */core-kit/* | */ui-kit/* | */translator/*)
    echo "$file is inside a git submodule. Changes there must be committed in the submodule's own repo; confirm with the user first." >&2
    exit 2
    ;;
esac

exit 0
