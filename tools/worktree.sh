#!/usr/bin/env bash
# One issue, one worktree (#287). Every issue is developed in its own checkout
# under .claude/worktrees/<issue>-<slug> on branch <type>/<issue>-<slug>, so
# parallel sessions never share source files or node_modules.
#
#   tools/worktree.sh new <type> <issue> <slug>   add the worktree from origin/main and set it up
#   tools/worktree.sh setup [dir]                 submodule, Node from .nvmrc, npm ci, .worktreeinclude files
#   tools/worktree.sh prune [--dry-run]           remove clean worktrees whose PR is merged
#
# node_modules are installed per worktree on purpose: a symlink to the main
# checkout's breaks as soon as the lockfiles differ.
set -euo pipefail

usage() {
  sed -n '6,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 1
}

# The main checkout is the first entry of `git worktree list`.
main_root() {
  git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}'
}

setup() {
  local dir main line
  dir="$(cd "${1:-.}" && git rev-parse --show-toplevel)"
  main="$(main_root)"

  git -C "$dir" submodule update --init --quiet

  # Gitignored files a checkout needs to run (secrets, local settings), copied
  # from the main checkout when present and not already in the worktree.
  if [ "$dir" != "$main" ] && [ -f "$dir/.worktreeinclude" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%%#*}"
      line="$(echo "$line" | xargs)"
      [ -z "$line" ] && continue
      if [ -f "$main/$line" ] && [ ! -e "$dir/$line" ]; then
        mkdir -p "$(dirname "$dir/$line")"
        cp "$main/$line" "$dir/$line"
        echo "Copied $line"
      fi
    done <"$dir/.worktreeinclude"
  fi

  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "nvm is required: https://github.com/nvm-sh/nvm" >&2
    exit 1
  fi
  export NVM_DIR
  cd "$dir"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" --no-use
  nvm install >/dev/null
  npm --prefix ./backend ci --no-audit --no-fund --loglevel=error
  npm --prefix ./frontend ci --no-audit --no-fund --loglevel=error

  echo "Worktree ready: $dir (branch $(git branch --show-current), Node $(node -v))"
}

new() {
  local type="${1:-}" issue="${2:-}" slug="${3:-}" main name dir branch
  [ -n "$type" ] && [ -n "$issue" ] && [ -n "$slug" ] || usage
  case "$issue" in *[!0-9]*) echo "issue must be a number: $issue" >&2; exit 1 ;; esac

  main="$(main_root)"
  name="$issue-$slug"
  dir="$main/.claude/worktrees/$name"
  branch="$type/$name"

  if [ -e "$dir" ]; then
    echo "$dir already exists" >&2
    exit 1
  fi

  git -C "$main" fetch --quiet origin main
  git -C "$main" worktree add --quiet -b "$branch" "$dir" origin/main
  setup "$dir"
}

# Removes worktrees under .claude/worktrees/ and the older ../piper-* checkouts
# whose branch has a merged PR and that hold no uncommitted changes.
prune() {
  local dry=0 main path branch state
  [ "${1:-}" = "--dry-run" ] && dry=1
  main="$(main_root)"

  git -C "$main" worktree list --porcelain | awk '
    /^worktree /{path = substr($0, 10)}
    /^branch /{print path "\t" substr($0, 19)}
  ' | while IFS=$'\t' read -r path branch; do
    [ "$path" = "$main" ] && continue
    case "$path" in
      "$main"/.claude/worktrees/* | "$(dirname "$main")"/piper-*) ;;
      *) continue ;;
    esac

    state="$(gh pr list --head "$branch" --state merged --json number --jq 'length' 2>/dev/null || echo 0)"
    if [ "$state" = 0 ]; then
      continue
    fi
    if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
      echo "Keeping $path: merged, but has uncommitted changes"
      continue
    fi

    if [ "$dry" = 1 ]; then
      echo "Would remove $path ($branch)"
    else
      git -C "$main" worktree remove "$path"
      git -C "$main" branch -D "$branch" >/dev/null
      echo "Removed $path ($branch)"
    fi
  done

  [ "$dry" = 1 ] || git -C "$main" worktree prune
}

cmd="${1:-}"
shift || true
case "$cmd" in
  new) new "$@" ;;
  setup) setup "$@" ;;
  prune) prune "$@" ;;
  *) usage ;;
esac
