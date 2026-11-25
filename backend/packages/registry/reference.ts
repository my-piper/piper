import { REGISTRY_URL } from "consts/registry";
import { DataError } from "core-kit/types/errors";
import { posix } from "node:path";

// A script stored as `registry:<package>@<version>/<path>` is loaded from the
// Package Registry. The registry host is not stored, so it can differ per
// environment; it is added when the script is sent to Deno.
const PREFIX = "registry:";
const REFERENCE = /^registry:([a-z0-9_]+)@(\d+)\/(.+)$/;

export function parseRegistryScript(script: string) {
  const match = REFERENCE.exec(script);
  if (!match) {
    throw new DataError(`Wrong registry script ${script}`);
  }
  const [, nodePackage, version, path] = match;
  if (
    !Number.isSafeInteger(Number(version)) ||
    Number(version) < 1 ||
    posix.normalize(path) !== path ||
    path.split("/").some((p) => !p || p.startsWith(".") || /[%?#\\]/.test(p))
  ) {
    throw new DataError(`Wrong registry script ${script}`);
  }
  return { nodePackage, version: Number(version), path };
}

export function registryScript(
  nodePackage: string,
  version: number,
  path: string
): string {
  return `${PREFIX}${nodePackage}@${version}/${path}`;
}

// A quoted reference in inline code: an edited package script keeps its
// imports (and import.meta.url) as references, without the registry host.
const QUOTED_REFERENCE = /(["'])(registry:[a-z0-9_]+@\d+\/[^"'\s]+)\1/g;

/** Whether `script` is a well-formed registry reference. */
export function isRegistryScript(script: string) {
  try {
    parseRegistryScript(script);
    return true;
  } catch {
    return false;
  }
}

function registryUrl(script: string) {
  const { nodePackage, version, path } = parseRegistryScript(script);
  return `${REGISTRY_URL}/${nodePackage}/${version}/${path}`;
}

/**
 * The script as Deno loads it: a registry reference becomes its registry URL,
 * and so does each quoted reference inside inline code.
 */
export function resolveScript(script: string): string {
  if (!script?.startsWith(PREFIX)) {
    return script?.replace(
      QUOTED_REFERENCE,
      (match, quote: string, reference: string) =>
        // a string that only looks like a reference is data: leave it
        isRegistryScript(reference)
          ? `${quote}${registryUrl(reference)}${quote}`
          : match
    );
  }
  return registryUrl(script);
}
