#!/usr/bin/env bash
# Fails when a Node.js version pin disagrees with the root .nvmrc, the single
# source of truth for the supported Node major.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
major=$(cut -d. -f1 "$root/.nvmrc" | tr -d '[:space:]')
status=0

fail() {
  echo "Node version drift: $1 (expected Node $major from .nvmrc)" >&2
  status=1
}

for pkg in backend frontend; do
  link="$root/$pkg/.nvmrc"
  [ -L "$link" ] && [ "$(readlink "$link")" = "../.nvmrc" ] ||
    fail "$pkg/.nvmrc must be a symlink to ../.nvmrc"

  engines=$(node -p "require('$root/$pkg/package.json').engines?.node ?? ''")
  [ "$engines" = ">=$major <$((major + 1))" ] ||
    fail "$pkg/package.json engines.node is '$engines'"
done

dockerfile="$root/devops/docker/Dockerfile"
grep -qx "ARG NODE_VERSION=$major" "$dockerfile" ||
  fail "devops/docker/Dockerfile ARG NODE_VERSION default"

exit $status
