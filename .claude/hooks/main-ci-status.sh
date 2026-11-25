#!/usr/bin/env bash
# SessionStart: tell the agent when the last `build` run on main failed, so a
# red main gets fixed instead of being mistaken for a local or flaky failure.
set -uo pipefail

command -v gh >/dev/null || exit 0

limit=()
command -v timeout >/dev/null && limit=(timeout 10)
run=$("${limit[@]}" gh run list --workflow build.yml --branch main --event push \
  --limit 1 --json conclusion,status,headSha,displayTitle,url 2>/dev/null) || exit 0

conclusion=$(jq -r '.[0].conclusion // empty' <<<"$run")
[ "$conclusion" = "failure" ] || exit 0

jq -r '.[0] | "CI on main is red: the `build` run for \(.headSha[0:7]) (\(.displayTitle)) failed: \(.url). Fix it before other work, or tell the user; read the failing job with `gh run view <run-id> --log-failed`."' <<<"$run" |
  jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .}, systemMessage: .}'
