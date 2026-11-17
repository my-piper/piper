#!/usr/bin/env node
// Fails when package-lock.json still resolves a test dependency the project
// removed. Dropping a package from package.json can leave it in the lockfile
// (e.g. as a stale optional peer), so `npm ci` keeps installing it while lint,
// typecheck and tests all pass.
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

// Karma/Jasmine were replaced by Vitest (#95).
const DENIED = [/^karma(-.*)?$/, /^jasmine(-.*)?$/, /^@types\/jasmine.*$/];

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

const found = new Map();
for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  const name = path.slice(path.lastIndexOf("node_modules/") + 13);
  if (path && DENIED.some((re) => re.test(name))) {
    found.set(`${name}@${meta.version}`, path);
  }
}

if (found.size > 0) {
  const lines = [...found].map(([pkg, path]) => `  ${pkg} (${path})`);
  process.stderr.write(
    [
      "package-lock.json resolves removed test dependencies:",
      ...lines,
      "Remove them from package.json, delete the stale lockfile entries and run `npm install`.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
