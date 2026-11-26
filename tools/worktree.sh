#!/usr/bin/env bash
# Creates a sibling checkout for a parallel session: ../piper-<name> on a new
# branch from origin/main, with its own core-kit submodule and node_modules
# installed by `npm ci` under the Node in .nvmrc. Sharing the main checkout's
# node_modules (a symlink) breaks as soon as the lockfiles differ.
#
# Usage: tools/worktree.sh <name> [branch]   (branch defaults to <name>)
# Remove with: git worktree remove ../piper-<name>
set -euo pipefail

name="${1:?usage: tools/worktree.sh <name> [branch]}"
branch="${2:-$name}"
root="$(git rev-parse --show-toplevel)"
dir="$(dirname "$root")/piper-$name"

if [ -e "$dir" ]; then
  echo "$dir already exists" >&2
  exit 1
fi

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm is required: https://github.com/nvm-sh/nvm" >&2
  exit 1
fi

git -C "$root" fetch --quiet origin main
git -C "$root" worktree add --quiet -b "$branch" "$dir" origin/main
git -C "$dir" submodule update --init --quiet

cd "$dir"
export NVM_DIR
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh" --no-use
nvm install >/dev/null
npm --prefix ./backend ci --no-audit --no-fund --loglevel=error
npm --prefix ./frontend ci --no-audit --no-fund --loglevel=error

echo "Worktree ready: $dir (branch $branch, Node $(node -v))"
