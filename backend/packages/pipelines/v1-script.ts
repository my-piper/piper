/**
 * Piper v1 ran Node scripts with globals the current runtime doesn't provide
 * (`DEFINITIONS`, `httpClient`, `download`, `nested`, `Buffer`). A v1 script
 * imported as a Script Node keeps its code and gets a prelude defining them.
 * What can't be defined in a Script Node is reported as a problem instead.
 */

const V1_GLOBALS =
  /\bDEFINITIONS\b|\bnested\.(?:run|state)\s*\(|(?<![.\w])httpClient\s*\(|(?<![.\w])download\s*\(/;

const V1_RUN = /export\s+(async\s+)?function\s+run\s*\(/;

/** Why a v1 script can't run as a Script Node; empty when it can. */
export function v1ScriptProblems(script: string): string[] {
  const problems: string[] = [];
  for (const [, module] of script.matchAll(
    /(?<![.\w])require\s*\(\s*["'`]([^"'`]+)["'`]/g
  )) {
    problems.push(
      `uses require('${module}'), which scripts can't load any more`
    );
  }
  if (/\benv\.(?:variables|scope)\b/.test(script)) {
    problems.push("reads the Environment, which a Script Node can't");
  }
  if (/(?<![.\w])message\s*\(/.test(script)) {
    problems.push("calls message(), which scripts can't any more");
  }
  if (V1_GLOBALS.test(script) && !V1_RUN.test(script)) {
    problems.push("has no exported run function");
  }
  return problems;
}

export function isV1Script(script: string) {
  return V1_GLOBALS.test(script);
}

/**
 * The v1 helpers, written for the current runtime. `nested.run` asks for a
 * Child Launch under a key counted per run, so a re-run finds the child it
 * already started; `nested.state` reads it from the run's `children`. Its
 * bindings are module state: a Script Node runs in its own process.
 */
const PRELUDE = `// Piper v1 compatibility, added when this Pipeline was imported from Piper v1.
const DEFINITIONS = (() => {
  const result = (type) => ({ from: (obj) => ({ __type: type, ...obj }) });
  const failure = (errorCode) =>
    class extends Error {
      code = errorCode;
    };
  return {
    NextNode: result("next"),
    RepeatNode: result("repeat"),
    DataError: failure("DATA_ERROR"),
    FatalError: failure("FATAL_ERROR"),
    TimeoutError: failure("TIMEOUT_ERROR"),
  };
})();

async function httpClient({ method = "get", url, headers = {}, params, data }) {
  const query = params ? \`?\${new URLSearchParams(params)}\` : "";
  const body =
    data === undefined || typeof data === "string" ? data : JSON.stringify(data);
  const response = await fetch(url + query, {
    method: method.toUpperCase(),
    headers,
    body,
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // not JSON: keep the text
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(\`Request failed with status code \${response.status}\`),
      { response: { status: response.status, data: parsed } }
    );
  }
  return { status: response.status, headers: response.headers, data: parsed };
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`Download of \${url} failed with status \${response.status}\`);
  }
  return { data: new Uint8Array(await response.arrayBuffer()) };
}

let v1Children = {};
let v1Launches = [];
let v1NestedCalls = 0;

const nested = {
  async run(endpoint, { inputs } = {}) {
    v1NestedCalls += 1;
    const key = \`nested_\${v1NestedCalls}\`;
    if (!v1Children[key]) {
      v1Launches.push({ key, deploy: { slug: endpoint }, inputs: inputs ?? {} });
    }
    return { _id: key };
  },
  async state(key) {
    // v1 answered a child's outputs once it finished
    const child = v1Children[key];
    const finished = child?.status === "finished";
    return {
      outputs: new Map(Object.entries(finished ? child.outputs : {})),
      errors: [],
    };
  },
};

export async function run(payload) {
  v1Children = payload.children ?? {};
  v1Launches = [];
  v1NestedCalls = 0;
  const result = await v1Run(payload);
  if (v1Launches.length > 0) {
    return { __type: "launch", launches: v1Launches, delay: result?.delay };
  }
  return result;
}
// End of Piper v1 compatibility.

`;

/** The v1 script with the prelude, its own `run` renamed `v1Run`. */
export function fromV1Script(script: string) {
  const bufferImport = /\bBuffer\b/.test(script)
    ? 'import { Buffer } from "node:buffer";\n'
    : "";
  return (
    bufferImport +
    PRELUDE +
    script.replace(V1_RUN, (_, async = "") => `${async}function v1Run(`)
  );
}
