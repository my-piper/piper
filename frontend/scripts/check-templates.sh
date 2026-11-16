#!/usr/bin/env bash
# Strict template type check (unknown properties, bindings, pipe arguments) that
# `ng build` skips because tsconfig.json sets fullTemplateTypeCheck: false.
# Existing templates still carry errors, so by default only errors in files
# changed against HEAD (plus untracked files) are reported; pass --all for every
# error.
set -uo pipefail

raw=$(npx --no-install ngc -p tsconfig.templates.json --noEmit 2>&1)
status=$?
out=$(printf '%s\n' "$raw" | sed $'s/\x1b\\[[0-9;]*m//g' | grep -E '^src/.+ - error ' || true)

# ngc failed without any template error to show: it crashed or is misconfigured
if [ "$status" -ne 0 ] && [ -z "$out" ]; then
  printf '%s\n' "$raw" >&2
  exit "$status"
fi

if [ "${1:-}" != "--all" ]; then
  changed=$( (git diff --name-only --relative HEAD; git ls-files --others --exclude-standard) | grep '^src/' | sed 's/\.[a-z]*$//' | sort -u)
  out=$(printf '%s\n' "$out" | while IFS= read -r line; do
    base=${line%%:*}
    base=${base%.*}
    if printf '%s\n' "$changed" | grep -qxF "$base"; then
      printf '%s\n' "$line"
    fi
  done)
fi

if [ -n "$out" ]; then
  printf '%s\n' "$out"
  exit 1
fi
echo "Templates OK"
