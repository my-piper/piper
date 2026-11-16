#!/usr/bin/env bash
# Fails when src/locale/en.json is out of date with the templates, or when two
# templates give the same i18n id different source text.
set -euo pipefail

log=$(mktemp)
trap 'rm -f "$log"' EXIT

npm run i18n >"$log" 2>&1 || { cat "$log"; exit 1; }

if grep -q "Duplicate messages" "$log"; then
  grep -A4 "Duplicate messages" "$log"
  echo "Give each i18n id one source text (whitespace counts)." >&2
  exit 1
fi

if ! git diff --exit-code --stat -- src/locale/en.json; then
  echo "src/locale/en.json is stale: run 'npm run i18n' and stage it." >&2
  exit 1
fi
