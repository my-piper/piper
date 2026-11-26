import env from "core-kit/env";
import { join } from "node:path";

// Where Deno loads Package Registry files from: an internal address only.
export const REGISTRY_URL = (
  env["REGISTRY_URL"] || "http://registry:8085"
).replace(/\/+$/, "");
// Optional bearer token; empty disables auth. Deno sends it through DENO_AUTH_TOKENS.
export const REGISTRY_TOKEN = env["REGISTRY_TOKEN"] || "";
export const REGISTRY_PORT = parseInt(env["REGISTRY_PORT"] || "8085");
// Kept apart from public media: the registry holds private package code.
export const REGISTRY_BUCKET_NAME = env["REGISTRY_BUCKET_NAME"] || "registry";
// Packages shipped with Piper (`<package>/<version>/<path>`), served before
// the bucket and never uploaded: every installation has them.
export const BUILTIN_PACKAGES_PATH = join(process.cwd(), "builtin-packages");
export const BUILTIN_PACKAGES = new Set(["core"]);
