// Piper's built-in `core` package, version 1. Served by the Package Registry
// from the Piper image, so every installation has it: a script imports it as
// "registry:core@1/node.js". A released version never changes (ADR 0003);
// put changes in a new version folder.
import { Buffer } from "node:buffer";

export function next(obj) {
  return { __type: "next", ...obj };
}

export function repeat(obj) {
  return { __type: "repeat", ...obj };
}

export class DataError extends Error {
  code = "DATA_ERROR";
  constructor(message, details = {}) {
    super(message);
    this.details = details;
  }
}

export class FatalError extends Error {
  code = "FATAL_ERROR";
}

export class TimeoutError extends Error {
  code = "TIMEOUT_ERROR";
}

export const throwError = {
  data: (message, details = {}) => {
    throw new DataError(message, details);
  },
  fatal: (message) => {
    throw new FatalError(message);
  },
  timeout: (message) => {
    throw new TimeoutError(message);
  },
};

/**
 * v1's `nested.run`/`nested.state` as Child Launch instructions (ADR 0001).
 * A child's key is the order of its `run` call, so a script makes the same
 * calls on every run until its children exist; return `launches` as a
 * `{ __type: "launch" }` result while any are new.
 */
export function createNested(children = {}) {
  const launches = [];
  let calls = 0;
  return {
    launches,
    nested: {
      async run(slug, { inputs } = {}) {
        if (!slug) throw new FatalError("A child Deploy slug is required");
        const key = `nested_${++calls}`;
        if (!children[key])
          launches.push({ key, deploy: { slug }, inputs: inputs ?? {} });
        return { _id: key };
      },
      async state(key) {
        const child = children[key];
        const finished = child?.status === "finished";
        return {
          outputs: new Map(
            Object.entries(finished ? (child.outputs ?? {}) : {})
          ),
          errors: [],
        };
      },
    },
  };
}

const REQUEST_TIMEOUT = 30_000;

// Bodies fetch sends as they are; anything else (an object, an array, a
// number) goes as JSON.
function isRawBody(data) {
  return (
    typeof data === "string" ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    data instanceof Blob ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data)
  );
}

/**
 * An HTTP call over `fetch`, shaped like v1's axios instance: called with a
 * config, or as `httpClient.get(url, config)`, `.post(url, data, config)` and
 * the other method shortcuts. `params` and `headers` leave out undefined
 * values and repeat arrays as `name[]`; `data` goes as JSON unless fetch can
 * send it as it is, and never with GET or HEAD; `auth` adds Basic
 * authentication. The answer is `{ status, headers, data }`, with JSON parsed
 * (text kept for `responseType: "text"` or when it isn't JSON) or bytes as a
 * Buffer for `responseType: "arraybuffer"`. A status `validateStatus`
 * refuses (by default any non-2xx) throws an Error with
 * `response: { status, data }`; `timeout` (ms) aborts the call.
 */
export async function httpClient({
  method = "get",
  url,
  headers = {},
  params,
  data,
  auth,
  timeout = REQUEST_TIMEOUT,
  responseType,
  validateStatus = (status) => status >= 200 && status < 300,
}) {
  const target = new URL(url);
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value))
      for (const item of value) target.searchParams.append(`${name}[]`, item);
    else target.searchParams.append(name, value);
  }
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(headers))
    if (value !== undefined && value !== null) requestHeaders.set(name, value);
  if (auth)
    requestHeaders.set(
      "Authorization",
      `Basic ${btoa(`${auth.username}:${auth.password}`)}`
    );
  const verb = method.toUpperCase();
  let body;
  if (
    data !== undefined &&
    data !== null &&
    verb !== "GET" &&
    verb !== "HEAD"
  ) {
    if (isRawBody(data)) body = data;
    else {
      body = JSON.stringify(data);
      if (!requestHeaders.has("Content-Type"))
        requestHeaders.set("Content-Type", "application/json");
    }
  }

  const response = await fetch(target, {
    method: verb,
    headers: requestHeaders,
    body,
    signal: AbortSignal.timeout(timeout),
  });
  let parsed;
  if (responseType === "arraybuffer")
    parsed = Buffer.from(await response.arrayBuffer());
  else {
    parsed = await response.text();
    if (responseType !== "text")
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // Not JSON: keep the text.
      }
  }
  if (!validateStatus(response.status))
    throw Object.assign(
      new Error(`Request failed with status code ${response.status}`),
      { response: { status: response.status, data: parsed } }
    );
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    data: parsed,
  };
}

for (const method of ["get", "delete", "head", "options"])
  httpClient[method] = (url, config = {}) =>
    httpClient({ ...config, method, url });
for (const method of ["post", "put", "patch"])
  httpClient[method] = (url, data, config = {}) =>
    httpClient({ ...config, method, url, data });

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Downloads `url` as v1's `download` did: uncached, with a browser
 * User-Agent, answering `{ mimeType, data }` with the bytes as a Buffer.
 */
export async function download(url, { timeout = REQUEST_TIMEOUT } = {}) {
  const { data, headers } = await httpClient({
    url,
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent": USER_AGENT,
    },
    responseType: "arraybuffer",
    timeout,
  });
  return { mimeType: headers["content-type"], data };
}
