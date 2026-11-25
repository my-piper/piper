import { isScriptReference } from "packages/nodes/script-node";
import { isRegistryScript, registryScript } from "./reference";

// Edited package scripts used to be saved with their imports resolved to the
// registry URL of the environment they were edited in. They now keep host-free
// `registry:` references, which `resolveScript` resolves when Deno runs them.

function hostPattern(host: string) {
  return host.replace(/\/+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewrites quoted URLs under any of `hosts` to `registry:` references. */
export function toRegistryImports(script: string, hosts: string[]): string {
  return hosts.reduce(
    (text, host) =>
      text.replace(
        new RegExp(
          `(["'])${hostPattern(host)}/([a-z0-9_]+)/(\\d+)/([^"'\\s]+)\\1`,
          "g"
        ),
        (match, quote: string, nodePackage: string, version, path) => {
          const reference = registryScript(nodePackage, Number(version), path);
          // a URL that no reference can express keeps working as it is
          return isRegistryScript(reference)
            ? `${quote}${reference}${quote}`
            : match;
        }
      ),
    script
  );
}

/**
 * The migrated script of each node whose inline script changes, by node key.
 * Registry and remote script references are left alone.
 */
export function nodesWithRegistryImports(
  nodes: Record<string, { script?: string }>,
  hosts: string[]
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const [key, { script }] of Object.entries(nodes ?? {})) {
    if (!script || isScriptReference(script)) continue;
    const migrated = toRegistryImports(script, hosts);
    if (migrated !== script) changed[key] = migrated;
  }
  return changed;
}
