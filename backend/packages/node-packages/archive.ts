import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { strFromU8, unzipSync } from "fflate";
import { Node } from "models/node";
import { posix } from "node:path";
import { NodePackage } from "models/node-package";
import { registryScript } from "packages/registry/reference";
import * as YAML from "yaml";
import { checkScriptUrl, PINNED, REMOTE_HOSTS } from "./script-url";

export const MANIFEST = "package.yaml";
const SCHEMA = "schema.yaml";
const SCRIPT = "script.js";
const APP = "app.html";

const PUBLISHED_EXTENSION = /\.(js|mjs|ts|json|html|yaml|yml|md)$/;
const TEST_FILE = /(^|[._-])test\.(js|mjs|ts)$/;
const SKIPPED_FOLDER = new Set(["node_modules", "__MACOSX"]);
const MAX_UNPACKED_MB = 20;
const MAX_UNPACKED_BYTES = MAX_UNPACKED_MB * 1024 * 1024;

export type PackageArchive = {
  nodePackage: NodePackage;
  files: Map<string, Buffer>;
  dropped: string[];
};

// Only package code reaches the registry: tests, dotfiles (such as .env with
// the author's keys) and anything that isn't code or config are left out.
function isPublished(path: string): boolean {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  // An empty part means an absolute path or `a//b`; `.`-parts cover `..`.
  const unsafe = (p: string) =>
    p === "" || p.startsWith(".") || SKIPPED_FOLDER.has(p);
  if (parts.some(unsafe)) {
    return false;
  }
  return PUBLISHED_EXTENSION.test(name) && !TEST_FILE.test(name);
}

function parseYaml(path: string, data: Uint8Array): object {
  try {
    return YAML.parse(strFromU8(data));
  } catch {
    throw new DataError(`Can't parse ${path}`);
  }
}

function unzip(data: Buffer): Record<string, Uint8Array> {
  let unpacked = 0;
  try {
    // Sizes are checked from the zip directory before anything is inflated.
    // fflate inflates each file into a buffer of its declared size, so a zip
    // that understates sizes yields truncated files, not more memory.
    return unzipSync(data, {
      filter: ({ originalSize }) => {
        unpacked += originalSize;
        if (unpacked > MAX_UNPACKED_BYTES) {
          throw new DataError(
            `Archive unpacks to more than ${MAX_UNPACKED_MB} MB`
          );
        }
        return true;
      },
    });
  } catch (e) {
    if (e instanceof DataError) {
      throw e;
    }
    throw new DataError("File is not a zip archive");
  }
}

// A package zipped together with its folder (`artworks/package.yaml`) is read
// from that folder, so both ways of zipping a package work.
function findRoot(paths: string[]): string {
  if (paths.includes(MANIFEST)) {
    return "";
  }
  const nested = paths.filter(
    (p) =>
      p.endsWith(`/${MANIFEST}`) && p.split("/").length === 2 && isPublished(p)
  );
  return nested.length === 1 ? nested[0].slice(0, -MANIFEST.length) : "";
}

export function readArchive(data: Buffer): PackageArchive {
  const entries = unzip(data);
  const root = findRoot(Object.keys(entries));

  const files = new Map<string, Buffer>();
  const dropped: string[] = [];
  for (const [entry, content] of Object.entries(entries)) {
    if (entry.endsWith("/")) {
      continue;
    }
    if (!entry.startsWith(root)) {
      dropped.push(entry);
      continue;
    }
    const path = entry.slice(root.length);
    if (!isPublished(path)) {
      dropped.push(entry);
      continue;
    }
    files.set(path, Buffer.from(content));
  }

  const manifest = files.get(MANIFEST);
  if (!manifest) {
    throw new DataError(`Archive has no ${MANIFEST}`);
  }

  const plain = parseYaml(MANIFEST, manifest) as { version?: unknown };
  // The version becomes part of every registry path, checked before the
  // model would turn "3" into 3.
  const { version } = plain;
  if (!Number.isInteger(version) || (version as number) < 1) {
    throw new DataError("Package version must be a positive integer");
  }
  const nodePackage = toInstance(plain, NodePackage);
  nodePackage.nodes = new Map<string, Node>();

  for (const [path, content] of files) {
    const [folder, file, ...rest] = path.split("/");
    if (file !== SCHEMA || rest.length > 0) {
      continue;
    }
    const schema = parseYaml(path, content) as Record<string, unknown>;
    if (Object.hasOwn(schema, "script")) {
      throw new DataError(
        "schema.yaml cannot contain script; use scriptUrl or script.js",
        [folder]
      );
    }
    const node = toInstance(schema, Node);
    node._id = folder;
    if (schema.scriptUrl !== undefined) {
      checkScriptUrl(schema.scriptUrl);
      node.script = schema.scriptUrl;
    } else {
      if (!files.has(`${folder}/${SCRIPT}`)) {
        throw new DataError(`Node has no ${SCRIPT}`, [folder]);
      }
      node.script = registryScript(
        nodePackage._id,
        nodePackage.version,
        `${folder}/${SCRIPT}`
      );
    }
    const app = files.get(`${folder}/${APP}`);
    if (app) {
      node.app = app.toString("utf-8");
    }
    nodePackage.nodes.set(folder, node);
  }

  if (nodePackage.nodes.size === 0) {
    throw new DataError("Archive has no nodes");
  }

  checkImports(files);

  return { nodePackage, files, dropped };
}

const CODE_FILE = /\.(js|mjs|ts)$/;
// Static imports and re-exports (`from "x"`, also on the last line of a
// multi-line import), side-effect imports and dynamic `import("x")`.
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)["']([^"']+)["']/g;

type Import = { file: string; line: number; specifier: string };

function findImports(files: Map<string, Buffer>): Import[] {
  const found: Import[] = [];
  for (const [file, content] of files) {
    if (!CODE_FILE.test(file)) {
      continue;
    }
    content
      .toString("utf-8")
      .split("\n")
      .forEach((text, i) => {
        for (const [, specifier] of text.matchAll(IMPORT)) {
          found.push({ file, line: i + 1, specifier });
        }
      });
  }
  return found;
}

function describeImport({ file, line, specifier }: Import) {
  return `${file}:${line}: ${specifier}`;
}

type ImportKind = "inside" | "outside" | "missing" | "unpinned" | "unloadable";

function classify(
  { file, specifier }: Import,
  files: Map<string, Buffer>
): ImportKind {
  if (specifier.startsWith(".")) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (target.startsWith("../")) {
      return "outside";
    }
    return files.has(target) ? "inside" : "missing";
  }

  if (/^(jsr|npm):/.test(specifier)) {
    return PINNED.test(specifier) ? "inside" : "unpinned";
  }

  let url: URL;
  try {
    url = new URL(specifier);
  } catch {
    return "unloadable";
  }
  if (url.protocol !== "https:" || !REMOTE_HOSTS.has(url.host)) {
    return "unloadable";
  }
  return PINNED.test(url.pathname) ? "inside" : "unpinned";
}

const REJECTIONS: Array<[ImportKind, string]> = [
  ["outside", "Archive imports files outside of it"],
  ["missing", "Archive imports files missing from it"],
  ["unloadable", "Archive imports modules Deno can't load"],
  ["unpinned", "Archive imports remote modules without a pinned version"],
];

// The registry serves each package version under its own path and never
// changes it, so every import must resolve to a file of the same archive or
// to remote code that can't change either.
function checkImports(files: Map<string, Buffer>) {
  const imports = findImports(files).map((i) => ({
    ...i,
    kind: classify(i, files),
  }));

  for (const [kind, message] of REJECTIONS) {
    const rejected = imports.filter((i) => i.kind === kind);
    if (rejected.length > 0) {
      throw new DataError(message, rejected.map(describeImport));
    }
  }
}
