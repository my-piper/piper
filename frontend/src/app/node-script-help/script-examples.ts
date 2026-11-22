export type ScriptExample = {
  id: string;
  title: string;
  description: string;
  code: string;
  // shown instead when the node is a Script Node
  scriptNode?: { description: string; code: string };
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
    description: $localize`:@@message.script_example_environment:A node declares each Variable it needs and reads its value from env.variables.`,
    code: `export async function run({ inputs, env }) {
  const { API_KEY } = env.variables;
  // env.scope.API_KEY tells where the value came from:
  // "pipeline", "user" or "global"

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
    scriptNode: {
      description: $localize`:@@message.script_example_environment_script_node:A Script Node never reads an Environment: add an input for the value and fill it in the Pipeline.`,
      code: `// "apiKey" is an input of this node
export async function run({ inputs }) {
  const response = await fetch("https://api.example.com/v1/answer", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${inputs.apiKey}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: inputs.question }),
  });
  const { answer } = await response.json();

  return { __type: "next", outputs: { answer } };
}
`,
    },
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
    id: "repeat",
    title: $localize`:@@label.script_example_repeat:Long tasks`,
    description: $localize`:@@message.script_example_repeat:Return repeat to run the node again later. The state you return comes back on the next run, and progress is shown on the node.`,
    code: `const API = "https://api.example.com/v1/tasks";
const MAX_CHECKS = 20;

export async function run({ inputs, state }) {
  // state is empty on the first run
  if (!state) {
    const response = await fetch(API, {
      method: "POST",
      body: JSON.stringify({ prompt: inputs.prompt }),
    });
    const { id } = await response.json();
    return { __type: "repeat", state: { id, checks: 0 }, delay: 5000 };
  }

  const task = await (await fetch(\`\${API}/\${state.id}\`)).json();
  if (task.done) {
    return { __type: "next", outputs: { image: task.url } };
  }

  const checks = state.checks + 1;
  return {
    __type: "repeat",
    state: { ...state, checks },
    progress: { total: MAX_CHECKS, processed: checks },
    delay: 5000,
  };
}
`,
  },
  {
    id: "errors",
    title: $localize`:@@label.script_example_errors:Errors and logs`,
    description: $localize`:@@message.script_example_errors:Console messages appear in the node's logs. A thrown error is retried; an error with the code FATAL_ERROR fails the node at once.`,
    code: `function fatal(message) {
  return Object.assign(new Error(message), { code: "FATAL_ERROR" });
}

export async function run({ inputs }) {
  console.info("Checking", inputs.url);

  if (!inputs.url?.startsWith("https://")) {
    // retrying can't fix a bad input
    throw fatal("url must start with https://");
  }

  const response = await fetch(inputs.url);
  if (!response.ok) {
    // a plain error is retried
    throw new Error(\`Download failed: \${response.status}\`);
  }

  return { __type: "next", outputs: { page: await response.text() } };
}
`,
  },
];
