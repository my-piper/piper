#!/usr/bin/env node
// Catches template changes that break a Playwright workflow in tests/browser,
// which take over a minute to run, so this cheap check runs on every commit:
// - a data-testid the workflows select that leaves its template fails it;
// - a CSS class they select that leaves its template is a warning, since
//   generic classes (`.errors`, `.title`) often belong to other templates and
//   a locator chain hides which; piper-invariants-reviewer judges those.
//
// A selector counts as dropped when it leaves the template it was removed
// from: classes like `.card` live in many templates, so "still used somewhere"
// would miss a workflow aimed at this one. A selector string that names other
// components' hosts (`app-launches .card`) is not aimed at this template.
//
// Usage: scripts/check-browser-selectors.mjs [<rev> [<rev>]]
//   no rev: the staged changes (pre-commit); one rev: the working tree
//   against it; two revs: the change between them.
import { execFileSync } from "node:child_process";
import console from "node:console";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const diffArgs = args.length > 0 ? args : ["--cached"];

const git = (...a) =>
  execFileSync("git", a, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 26,
    stdio: ["ignore", "pipe", "ignore"],
  });

/** The template after the change, or "" when the change deletes it. */
function after(file) {
  if (args.length === 1) {
    const path = join(root, file);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  }
  try {
    // no rev: the staged blob; two revs: the blob at the second one
    return git("show", `${args[1] ?? ""}:./${file}`);
  } catch {
    return "";
  }
}

function classesOf(html) {
  const names = new Set();
  for (const [, list] of html.matchAll(/\bclass="([^"{}]*)"/g)) {
    list
      .split(/\s+/)
      .filter(Boolean)
      .forEach((n) => names.add(n));
  }
  for (const [, name] of html.matchAll(/\[class\.([\w-]+)\]/g)) {
    names.add(name);
  }
  return names;
}

function testIdsOf(html) {
  return new Set(
    [...html.matchAll(/data-testid="([\w-]+)"/g)].map((m) => m[1]),
  );
}

/** Every string literal of every workflow file, with its location. */
function literals() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".ts")) {
        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, i) => {
            for (const [, , text] of line.matchAll(
              /(["'`])((?:(?!\1).)*)\1/g,
            )) {
              found.push({
                where: `${path.slice(root.length)}:${i + 1}`,
                text,
              });
            }
          });
      }
    }
  };
  walk(join(root, "tests/browser"));
  return found;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The component host a template belongs to: x.component.html → app-x. */
const hostOf = (file) =>
  `app-${basename(file).replace(/\.component\.html$/, "")}`;

function aimedAt(text, host) {
  const hosts = text.match(/\bapp-[a-z0-9-]+/g);
  return !hosts || hosts.includes(host);
}

const files = git(
  "diff",
  "--name-only",
  "--relative",
  ...diffArgs,
  "--",
  "src/*.html",
)
  .split("\n")
  .filter(Boolean);
if (files.length === 0) {
  process.exit(0);
}

const strings = literals();
const errors = [];
const warnings = [];

for (const file of files) {
  const removed = git("diff", "-U0", ...diffArgs, "--", file)
    .split("\n")
    .filter((l) => l.startsWith("-") && !l.startsWith("---"))
    .join("\n");
  if (!removed) {
    continue;
  }
  const now = after(file);
  const host = hostOf(file);
  const keptClasses = classesOf(now);
  const keptIds = testIdsOf(now);

  for (const name of classesOf(removed)) {
    if (keptClasses.has(name)) {
      continue;
    }
    const selector = new RegExp(`(^|[\\s>+~(,])\\.${escape(name)}(?![\\w-])`);
    const hits = strings.filter(
      ({ text }) => selector.test(text) && aimedAt(text, host),
    );
    if (hits.length > 0) {
      warnings.push({ what: `class .${name}`, file, hits });
    }
  }
  for (const id of testIdsOf(removed)) {
    if (keptIds.has(id)) {
      continue;
    }
    const hits = strings.filter(({ text }) => text === id);
    if (hits.length > 0) {
      errors.push({ what: `data-testid "${id}"`, file, hits });
    }
  }
}

function print(label, findings) {
  for (const { what, file, hits } of findings) {
    console.error(`${label}: ${what} left ${file}; tests/browser selects it:`);
    hits.forEach(({ where, text }) => console.error(`  ${where}: "${text}"`));
  }
}

print("warning", warnings);
print("error", errors);
if (warnings.length > 0 || errors.length > 0) {
  console.error(
    "Update the workflows aiming at this template to the new markup and run " +
      "them ('npm run test:browser -- <spec>').",
  );
}
if (errors.length > 0) {
  process.exit(1);
}
