const CONTENT_TYPES: Record<string, string> = {
  js: "application/javascript",
  mjs: "application/javascript",
  ts: "application/typescript",
  json: "application/json",
  html: "text/html",
  yaml: "application/yaml",
  yml: "application/yaml",
  md: "text/markdown",
};

// Deno picks how to load a remote module from its content type.
export function contentType(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
