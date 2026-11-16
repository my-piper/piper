#!/usr/bin/env bash
# Strict template type check (unknown elements and properties, binding and pipe
# argument types) that `ng build` skips because tsconfig.json sets
# fullTemplateTypeCheck: false. src/ui-kit is a submodule with its own repo,
# so its errors are left to it, as with lint.
set -uo pipefail

raw=$(npx --no-install ngc -p tsconfig.templates.json --noEmit 2>&1)
status=$?
errors=$(printf '%s\n' "$raw" | sed $'s/\x1b\\[[0-9;]*m//g' | grep -E '^src/.+ - error ' || true)
out=$(printf '%s\n' "$errors" | grep -v '^src/ui-kit/' || true)

# ngc failed without any template error to show: it crashed or is misconfigured
if [ "$status" -ne 0 ] && [ -z "$errors" ]; then
  printf '%s\n' "$raw" >&2
  exit "$status"
fi

if [ -n "$out" ]; then
  printf '%s\n' "$out"
  exit 1
fi
echo "Templates OK"
