export type ScriptExample = {
  id: string;
  title: string;
  description: string;
  code: string;
  // shown instead when the node is a Script Node
};

// Each example follows the contract the backend applies to a node's `run`
// result (backend/jobs/process-node) and to Child Launches (ADR 0001).
export const SCRIPT_EXAMPLES: ScriptExample[] = [
  {
    id: "outputs",
    title: $localize`:@@label.script_example_outputs:Inputs and outputs`,
    description: $localize`:@@message.script_example_outputs:A node gets the values of its declared inputs and returns values for its declared outputs.`,
    code: `export async function run({ inputs }) {
  // inputs hold the values of the inputs declared on this node
  const { text, count = 1 } = inputs;

  // each key of outputs is an output declared on this node
  return {
    __type: "next",
    outputs: { result: text.repeat(count) },
  };
}
`,
  },
  {
    id: "branches",
    title: $localize`:@@label.script_example_branches:Different outputs`,
    description: $localize`:@@message.script_example_branches:Only the outputs you return are passed on, so the nodes connected to an output you leave out do not run.`,
    code: `export async function run({ inputs }) {
  const { score } = inputs;

  if (score >= 0.5) {
    // runs only the nodes connected to "approved"
    return { __type: "next", outputs: { approved: score } };
  }

  // runs only the nodes connected to "rejected"
  return { __type: "next", outputs: { rejected: score } };
}
`,
  },
  {
    id: "upstream",
    title: $localize`:@@label.script_example_upstream:Results of other nodes`,
    description: $localize`:@@message.script_example_upstream:Connect an output of another node to an input of this one: its result arrives in inputs under this node's input name. By default the node runs once every connected node has delivered its value.`,
    code: `// "summary" and "keywords" are inputs of this node, connected to the
// outputs of two other nodes
export async function run({ inputs }) {
  const { summary, keywords } = inputs;

  return {
    __type: "next",
    outputs: { report: \`\${summary}\\n\\nKeywords: \${keywords}\` },
  };
}
`,
  },
  {
    id: "environment",
    title: $localize`:@@label.script_example_environment:Environment Variables`,
    description: $localize`:@@message.script_example_environment:A node declares each Variable it needs and reads its value from env.variables. Stop at once when a required one is missing: retrying can't set it.`,
    code: `export async function run({ inputs, env }) {
  const { API_KEY } = env.variables;
  if (!API_KEY) {
    throw Object.assign(new Error("Set API_KEY in the Environment"), {
      code: "FATAL_ERROR",
    });
  }
  // env.scope.API_KEY tells where the value came from:
  // "pipeline" (the project's own value) or "global"

  const response = await fetch("https://api.example.com/v1/answer", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: inputs.question }),
  });
  const { answer } = await response.json();

  return { __type: "next", outputs: { answer } };
}
`,
  },
  {
    id: "images",
    title: $localize`:@@label.script_example_images:Images and files`,
    description: $localize`:@@message.script_example_images:Image, video and file values are URLs. Pass the URL to the service that needs the file, and return the URLs of the files it made.`,
    code: `// "image" is an image input, "image" and "variants" are an image
// and an image[] output of this node
export async function run({ inputs }) {
  const { image, scale = 2 } = inputs;

  // the service downloads the picture from its URL
  const response = await fetch("https://api.example.com/v1/upscale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, scale }),
  });
  const { results } = await response.json();

  // to work on the picture in the script, download its bytes:
  // const bytes = new Uint8Array(await (await fetch(image)).arrayBuffer());

  return {
    __type: "next",
    outputs: {
      image: results[0].url,
      variants: results.map(({ url }) => url),
    },
  };
}
`,
  },
  {
    id: "libraries",
    title: $localize`:@@label.script_example_libraries:Libraries`,
    description: $localize`:@@message.script_example_libraries:Import a library by its URL, for example from esm.sh, jsr.io, deno.land or cdn.jsdelivr.net. Imports from hosts that Piper does not allow are blocked.`,
    code: `// pin the version, so the node keeps working when the library changes
import slugify from "https://esm.sh/slugify@1.6.6";

export async function run({ inputs }) {
  return {
    __type: "next",
    outputs: { slug: slugify(inputs.title, { lower: true, strict: true }) },
  };
}
`,
  },
  {
    id: "repeat",
    title: $localize`:@@label.script_example_repeat:Long tasks`,
    description: $localize`:@@message.script_example_repeat:Return repeat to run the node again later: start a job on the first run, keep its id in state and check it on the next runs. The progress you return is shown on the node. Give up with TIMEOUT_ERROR when the job takes too long.`,
    code: `const API = "https://api.example.com/v1/jobs";
const CHECK_INTERVAL = 3000;
const MAX_ATTEMPTS = 20;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function run({ inputs, state }) {
  // state is empty on the first run: start the job
  if (!state) {
    const response = await fetch(API, {
      method: "POST",
      body: JSON.stringify({ prompt: inputs.prompt }),
    });
    const { id } = await response.json();
    return {
      __type: "repeat",
      state: { job: id, attempt: 0 },
      progress: { total: MAX_ATTEMPTS, processed: 0 },
      delay: CHECK_INTERVAL,
    };
  }

  // the next runs check the job
  const job = await (await fetch(\`\${API}/\${state.job}\`)).json();
  if (job.status === "completed") {
    return { __type: "next", outputs: { image: job.url } };
  }
  if (job.status === "failed") {
    throw failure("FATAL_ERROR", \`Job failed: \${job.error}\`);
  }

  const attempt = state.attempt + 1;
  if (attempt > MAX_ATTEMPTS) {
    throw failure("TIMEOUT_ERROR", \`Job \${state.job} took too long\`);
  }
  return {
    __type: "repeat",
    state: { ...state, attempt },
    progress: { total: MAX_ATTEMPTS, processed: attempt },
    delay: CHECK_INTERVAL,
  };
}
`,
  },
  {
    id: "children",
    title: $localize`:@@label.script_example_children:Child Launches`,
    description: $localize`:@@message.script_example_children:A node can launch a deployed pipeline and wait for it. The node runs again after each delay, and children holds the state of every child under the key you chose. A failed child fails this node. A node starts at most 10 children, children nest at most 3 levels deep, and the Deploy needs pipeline outputs and its own concurrency scope.`,
    code: `export async function run({ inputs, children }) {
  const child = children?.summary;

  if (child?.status === "finished") {
    // child.outputs hold the outputs of the deployed pipeline
    return { __type: "next", outputs: { summary: child.outputs.result } };
  }

  // asking again for a key that has a child never starts a second one
  return {
    __type: "launch",
    launches: [
      {
        key: "summary",
        // the prefix and slug of the Deploy's API URL
        deploy: { prefix: "my-prefix", slug: "summarize" },
        // inputs of the deployed pipeline
        inputs: { text: inputs.text },
      },
    ],
    // ms until this node checks its children again
    delay: 3000,
  };
}
`,
  },
  {
    id: "errors",
    title: $localize`:@@label.script_example_errors:Errors and logs`,
    description: $localize`:@@message.script_example_errors:Console messages appear in the node's logs. A thrown error is retried; an error with the code FATAL_ERROR or TIMEOUT_ERROR fails the node at once.`,
    code: `// The next(), repeat() and throwError helpers of the node catalog
// (piper-nodes utils/node.js) build these same results and errors.
function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function run({ inputs }) {
  console.info("Downloading", inputs.url);

  if (!inputs.url?.startsWith("https://")) {
    // retrying can't fix a bad input
    throw failure("FATAL_ERROR", "url must start with https://");
  }

  const response = await fetch(inputs.url);
  if (response.status >= 500) {
    // a plain error is retried: the server may recover
    throw new Error(\`Server error: \${response.status}\`);
  }
  if (!response.ok) {
    // the API says what is wrong with the request; sending it again won't help
    const body = await response.json().catch(() => ({}));
    const error = body.error ?? \`Request rejected: \${response.status}\`;
    console.error("Rejected:", error);
    throw failure("FATAL_ERROR", error);
  }

  return { __type: "next", outputs: { page: await response.text() } };
}
`,
  },
];
