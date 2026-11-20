import env from "core-kit/env";

// Where Deno loads Package Registry files from: an internal address only.
export const REGISTRY_URL = (
  env["REGISTRY_URL"] || "http://registry:8085"
).replace(/\/+$/, "");
// Bearer token the registry requires; Deno sends it through DENO_AUTH_TOKENS.
export const REGISTRY_TOKEN = env["REGISTRY_TOKEN"] || "";
export const REGISTRY_PORT = parseInt(env["REGISTRY_PORT"] || "8085");
// Kept apart from public media: the registry holds private package code.
export const REGISTRY_BUCKET_NAME =
  env["REGISTRY_BUCKET_NAME"] || "piper-registry";
