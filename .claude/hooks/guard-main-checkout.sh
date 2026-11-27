#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit): the main checkout only tracks main; every
# issue is developed in its own worktree (#287, `make worktree`). Files outside
# any git checkout (memory, scratchpad) and inside worktrees pass.
# PIPER_ALLOW_MAIN=1 allows a deliberate edit in the main checkout.
set -euo pipefail

[ "${PIPER_ALLOW_MAIN:-}" = 1 ] && exit 0

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

# The file may not exist yet: ask git from the nearest existing directory.
dir=$(dirname "$file")
while [ ! -d "$dir" ]; do dir=$(dirname "$dir"); done

git_dir=$(git -C "$dir" rev-parse --absolute-git-dir 2>/dev/null) || exit 0
common_dir=$(cd "$dir" && cd "$(git rev-parse --git-common-dir)" && pwd -P)

# A linked worktree has its own git dir under <common>/worktrees/<name>.
[ "$(cd "$git_dir" && pwd -P)" != "$common_dir" ] && exit 0

# The main checkout of another repository (a sibling project) is not ours.
project="${CLAUDE_PROJECT_DIR:-$dir}"
project_common=$(cd "$project" && cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P) || exit 0
[ "$common_dir" = "$project_common" ] || exit 0

cat >&2 <<EOF
Refusing to edit $file in the main checkout: it only tracks main.
Develop the issue in its own worktree:
  make worktree ISSUE=<n> TYPE=<feat|fix|docs|chore> SLUG=<slug>
then edit under .claude/worktrees/<n>-<slug>/. For a deliberate edit here,
the user can restart the session with PIPER_ALLOW_MAIN=1.
EOF
exit 2
