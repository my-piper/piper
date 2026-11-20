import { REGISTRY_URL } from "consts/registry";

// A script stored as `registry:<package>@<version>/<path>` is loaded from the
// Package Registry. The registry host is not stored, so it can differ per
// environment; it is added when the script is sent to Deno.
const PREFIX = "registry:";
const REFERENCE = /^registry:([a-z0-9_]+)@(\d+)\/(.+)$/;

export function registryScript(
  nodePackage: string,
  version: number,
  path: string
): string {
  return `${PREFIX}${nodePackage}@${version}/${path}`;
}

export function resolveScript(script: string): string {
  if (!script?.startsWith(PREFIX)) {
    return script;
  }
  const match = REFERENCE.exec(script);
  if (!match) {
    throw new Error(`Wrong registry script ${script}`);
  }
  const [, nodePackage, version, path] = match;
  return `${REGISTRY_URL}/${nodePackage}/${version}/${path}`;
}
