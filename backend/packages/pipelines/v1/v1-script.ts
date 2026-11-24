/**
 * Piper v1 ran Node scripts with globals the current runtime doesn't provide
 * (`DEFINITIONS`, `httpClient`, `download`, `nested`, `Buffer`, `env`,
 * `message`, `require`). A v1 script imported as a Script Node keeps its code
 * and gets a prelude defining them. What only works once the script is
 * rewritten is a warning; what keeps it from running at all is a problem.
 */

const V1_GLOBALS =
  /\bDEFINITIONS\b|\bnested\.(?:run|state)\s*\(|(?<![.\w])httpClient\s*\(|(?<![.\w])download\s*\(/;

const V1_REQUIRE = /(?<![.\w])require\s*\(\s*["'`]([^"'`]+)["'`]/g;
const V1_ENV = /(?<![.\w])env\.(?:variables|scope)\b/;
const V1_ENV_NAMES =
  /(?<![.\w])env\.variables\??\.get\s*\(\s*["'`]([^"'`]+)["'`]/g;
const V1_MESSAGE = /(?<![.\w])message\s*\(/;

const V1_RUN = /export\s+(async\s+)?function\s+run\s*\(/;

/** The first capture group of every match, each once, in order. */
function uniqueMatches(script: string, pattern: RegExp) {
  return [...new Set([...script.matchAll(pattern)].map(([, found]) => found))];
}

function requiredModules(script: string) {
  return uniqueMatches(script, V1_REQUIRE);
}

/** Why a v1 script can't run as a Script Node at all; empty when it can. */
export function v1ScriptProblems(script: string): string[] {
  if (isV1Script(script) && !V1_RUN.test(script)) {
    return ["has no exported run function"];
  }
  return [];
}

/**
 * What of a v1 script won't work as a Script Node until it is rewritten. The
 * Environment warning names the Variables the script reads by name and those
 * its Node declared (`declared`), as all of them come back empty.
 */
export function v1ScriptWarnings(
  script: string,
  declared: string[] = []
): string[] {
  const warnings = requiredModules(script).map(
    (module) =>
      `uses require('${module}'), which scripts can't load: rewrite the Node before it runs`
  );
  if (V1_ENV.test(script)) {
    const names = [
      ...new Set([...uniqueMatches(script, V1_ENV_NAMES), ...declared]),
    ];
    const empty =
      names.length === 0
        ? "it comes back empty"
        : `${names.join(", ")} ${names.length === 1 ? "comes" : "come"} back empty`;
    warnings.push(`reads the Environment, which a Script Node can't: ${empty}`);
  }
  if (V1_MESSAGE.test(script)) {
    warnings.push(
      "calls message(), which only writes to the Node's log now: rewrite it if users must see the message"
    );
  }
  return warnings;
}

/** Whether a script uses anything of v1 the prelude stands in for. */
export function isV1Script(script: string) {
  return (
    V1_GLOBALS.test(script) ||
    requiredModules(script).length > 0 ||
    V1_ENV.test(script) ||
    V1_MESSAGE.test(script)
  );
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

/**
 * Stand-ins for v1 globals, each added only when the script doesn't declare
 * that name itself: a second declaration would keep the module from loading.
 */
const STAND_INS: Record<string, string> = {
  env: `// Script Nodes never read an Environment: every Variable comes back empty
const env = { variables: new Map(), scope: new Map() };
`,
  message: `function message(text, type = "info") {
  console.log(\`[\${type}] \${text}\`);
}
`,
  require: `function require(module) {
  throw new DEFINITIONS.FatalError(
    \`require('\${module}') isn't available any more: rewrite this Node with an import\`
  );
}
`,
};

const PRELUDE_END = "// End of Piper v1 compatibility.";

function declares(script: string, name: string) {
  return new RegExp(
    `(?<![.\\w$])(?:function\\*?|const|let|var|class)\\s+${name}\\b`
  ).test(script);
}

/**
 * The v1 script with the prelude, its own `run` renamed `v1Run`. A script that
 * requires a module starts with a note naming it, as it can't run until then.
 */
export function fromV1Script(script: string) {
  const rewrite = requiredModules(script)
    .map(
      (module) =>
        `// Rewrite this Node: require('${module}') can't be loaded; import a module that runs in Deno instead.\n`
    )
    .join("");
  const bufferImport = /\bBuffer\b/.test(script)
    ? 'import { Buffer } from "node:buffer";\n'
    : "";
  const standIns = Object.entries(STAND_INS)
    .filter(([name]) => !declares(script, name))
    .map(([, code]) => `${code}\n`)
    .join("");
  return (
    rewrite +
    bufferImport +
    PRELUDE.replace(PRELUDE_END, `${standIns}${PRELUDE_END}`) +
    script.replace(V1_RUN, (_, async = "") => `${async}function v1Run(`)
  );
}
