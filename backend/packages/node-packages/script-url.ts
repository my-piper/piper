import { DataError } from "core-kit/types/errors";

// Match the remote hosts supported by archive imports and Deno's allowlist.
export const REMOTE_HOSTS = new Set([
  "deno.land",
  "jsr.io",
  "esm.sh",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
]);
export const PINNED = /@v?\d[^/]*|\/[0-9a-f]{40}(\/|$)/;

const VERSION = "(?:v?\\d[^/]*|[0-9a-f]{40})";
const PINNED_PATHS: Record<string, RegExp> = {
  "cdn.jsdelivr.net": new RegExp(
    `^/(?:gh/[^/]+/[^/@]+|npm/(?:@[^/]+/)?[^/@]+)@${VERSION}(?:/|$)`
  ),
  "raw.githubusercontent.com": new RegExp(`^/[^/]+/[^/]+/${VERSION}/`),
  "gist.githubusercontent.com": /^\/[^/]+\/[^/]+\/raw\/[0-9a-f]{40}\//,
  "deno.land": new RegExp(`^/(?:x/[^/@]+|std)@${VERSION}/`),
  "esm.sh": new RegExp(`^/(?:v\\d+/)?(?:@[^/]+/)?[^/@]+@${VERSION}(?:/|$)`),
  "jsr.io": new RegExp(`^/@[^/]+/[^/]+/${VERSION}(?:/|$)`),
};

export function checkScriptUrl(value: unknown): asserts value is string {
  let url: URL;
  try {
    url = new URL(typeof value === "string" ? value : "");
  } catch {
    throw new DataError(
      "scriptUrl must be a pinned HTTPS URL supported by Deno"
    );
  }
  if (
    url.protocol !== "https:" ||
    !REMOTE_HOSTS.has(url.host) ||
    url.username ||
    url.password ||
    !PINNED_PATHS[url.host]?.test(url.pathname)
  ) {
    throw new DataError(
      "scriptUrl must be a pinned HTTPS URL supported by Deno"
    );
  }
}
