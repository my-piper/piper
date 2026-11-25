import { validatePreparedPipeline } from "../../../tools/validate-prepared-pipelines";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { pipelineFixture } from "../../fixtures/pipeline";

const SCRIPT = `export async function run({ env }) {
  return { __type: "next", outputs: { result: env.variables.ARTWORKS_PASSWORD } };
}`;

function preparedFixture(script = SCRIPT) {
  const pipeline = pipelineFixture();
  const node = pipeline.nodes.echo_node;
  const { _id: _catalogId, ...inline } = node;
  return {
    ...pipeline,
    layout: { left: 200, top: 200, zoom: 1 },
    nodes: {
      echo_node: {
        ...inline,
        source: "script",
        script,
        environment: { ARTWORKS_PASSWORD: { type: "string" } },
        inputs: {
          enabled: { ...node.inputs.enabled, featured: true },
          count: { ...node.inputs.count, featured: true },
          text: { ...node.inputs.text, featured: true },
        },
      },
    },
  };
}

/** The fixture's node as a v1_pipelines package node; its version is the node's own. */
function packageFixture() {
  const pipeline = preparedFixture();
  Object.assign(pipeline.nodes.echo_node, {
    source: "node",
    package: "v1_pipelines",
    version: 1,
    script: "registry:v1_pipelines@2/echo_node/script.js",
  });
  return pipeline;
}

function check(pipeline: ReturnType<typeof preparedFixture>) {
  return validatePreparedPipeline(stringify(pipeline));
}

/** Checks `pipeline` against a catalog holding `files` (path → text). */
function checkPackages(
  pipeline: ReturnType<typeof preparedFixture>,
  files: Record<string, string>
) {
  const nodesDir = mkdtempSync(join(tmpdir(), "piper-nodes-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(nodesDir, path)), { recursive: true });
    writeFileSync(join(nodesDir, path), text);
  }
  return validatePreparedPipeline(stringify(pipeline), { nodesDir });
}

describe("prepared pipeline guard", () => {
  it("accepts inline runtime code, retained Environment and all connected ports", () => {
    const pipeline = preparedFixture();

    const result = check(pipeline);

    expect(result).toEqual({ errors: [], nodes: 1, links: 4 });
  });

  it("rejects an omitted layout before the editor creates a zoom-only object", () => {
    const pipeline = preparedFixture();
    delete pipeline.layout;

    const result = check(pipeline);

    expect(result.errors).toContain(
      "layout must explicitly include numeric left and top before the first editor save"
    );
    expect(result.errors).toContain(
      "pipeline becomes schema-invalid after model conversion and an editor zoom update"
    );
  });

  it("reports the exact missing-left schema error for a zoom-only layout", () => {
    const pipeline = preparedFixture();
    Object.assign(pipeline, { layout: { zoom: 1 } });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "/layout: must have required property 'left'"
    );
  });

  it("accepts a package node whose catalog script passes the script checks", () => {
    const pipeline = packageFixture();

    const result = checkPackages(pipeline, {
      "v1_pipelines/echo_node/script.js": `import { next } from "../../../utils/node.js";
${SCRIPT}`,
    });

    expect(result.errors).toEqual([]);
  });

  it("checks a package node's catalog script like an inline script", () => {
    const pipeline = packageFixture();

    const result = checkPackages(pipeline, {
      "v1_pipelines/echo_node/script.js": `const axios = require("axios");
${SCRIPT}`,
    });

    expect(result.errors).toContain(
      "Node echo_node: require() needs rewriting"
    );
  });

  it("rejects a package node whose catalog script is missing", () => {
    const pipeline = packageFixture();

    const result = checkPackages(pipeline, {});

    expect(result.errors).toContain(
      "Node echo_node: v1_pipelines/echo_node/script.js is missing from the catalog"
    );
  });

  it("rejects a package node whose script is not its package's registry file", () => {
    const pipeline = packageFixture();
    pipeline.nodes.echo_node.script = "registry:artworks@2/echo_node/script.js";

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: a package node's script must be registry:v1_pipelines@<package version>/<node>/script.js"
    );
  });

  it("rejects a package node with an inline script", () => {
    const pipeline = packageFixture();
    pipeline.nodes.echo_node.script = SCRIPT;

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: a package node's script must be registry:v1_pipelines@<package version>/<node>/script.js"
    );
  });

  it("rejects an inline Script Node that keeps a package", () => {
    const pipeline = packageFixture();
    pipeline.nodes.echo_node.source = "script";

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: a package node needs source: node"
    );
  });

  it("rejects a package node with process isolation", () => {
    const pipeline = packageFixture();
    Object.assign(pipeline.nodes.echo_node, { isolated: true });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: a registry script can't run with isolated: true"
    );
  });

  it("rejects a node input default that keeps an enum option's label", () => {
    const pipeline = preparedFixture();
    Object.assign(pipeline.nodes.echo_node.inputs.text, {
      default: "qwen3-vl:8b-instruct|Qwen3-VL 8b (Vision)",
      enum: ["qwen3-vl:8b-instruct|Qwen3-VL 8b (Vision)"],
    });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: input text default must be the enum value qwen3-vl:8b-instruct, not the whole option"
    );
  });

  it("rejects a pipeline input default that keeps an enum option's label", () => {
    const pipeline = preparedFixture();
    const [name] = Object.keys(pipeline.inputs);
    Object.assign(pipeline.inputs[name], {
      type: "string",
      default: "auto|Auto",
      enum: ["auto|Auto", "enhancer|Enhance"],
    });

    const result = check(pipeline);

    expect(result.errors).toContain(
      `Pipeline input ${name}: default must be the enum value auto, not the whole option`
    );
  });

  it("accepts an enum default given as the bare value", () => {
    const pipeline = preparedFixture();
    Object.assign(pipeline.nodes.echo_node.inputs.text, {
      default: "auto",
      enum: ["auto|Auto", "enhancer|Enhance"],
    });

    const result = check(pipeline);

    expect(result.errors).toEqual([]);
  });

  it("rejects a pipeline-input link the editor would remove", () => {
    const pipeline = preparedFixture();
    pipeline.nodes.echo_node.inputs.text.featured = false;

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Connected input echo_node.text must exist and have featured: true; the editor removes its links"
    );
  });

  it("rejects a node-to-node link the editor would remove", () => {
    const pipeline = preparedFixture();
    pipeline.inputs = {} as typeof pipeline.inputs;
    pipeline.nodes.echo_node.inputs.text.featured = false;
    Object.assign(pipeline.flows, {
      linked: {
        from: "echo_node",
        output: "result",
        to: "echo_node",
        input: "text",
      },
    });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Connected input echo_node.text must exist and have featured: true; the editor removes its links"
    );
  });

  it("rejects a missing output endpoint", () => {
    const pipeline = preparedFixture();
    pipeline.outputs.result.flows.result_flow.output = "removed";

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Connected output echo_node.removed does not exist"
    );
  });

  it.each([
    {
      script: "export function run() { require('openai'); }",
      problem: "require() needs rewriting",
    },
    {
      script: "export function run() { const name = 'sharp'; require(name); }",
      problem: "require() needs rewriting",
    },
    {
      script: "export function run() { message('notice'); }",
      problem: "message() needs rewriting",
    },
    {
      script:
        "export function run({ env }) { return env?.variables?.get('ARTWORKS_PASSWORD'); }",
      problem: "Environment reads must use plain object properties",
    },
    {
      script:
        "export function run({ env }) { return env.scope.get('ARTWORKS_PASSWORD'); }",
      problem: "Environment reads must use plain object properties",
    },
    {
      script:
        "export function run({ env }) { return env.variables.OPEN_PAAS_PASSWORD; }",
      problem: "legacy Environment name OPEN_PAAS_PASSWORD",
    },
    {
      script: "export function run({ env }) { return env.variables.HIVE_KEY; }",
      problem: "Environment Variable HIVE_KEY is not declared",
    },
    {
      script:
        "export function run({ env }) { return env.variables['HIVE_KEY']; }",
      problem: "Environment Variable HIVE_KEY is not declared",
    },
    {
      script: "import { run } from './helper.js'; export { run };",
      problem:
        "imports must be pinned supported HTTPS URLs or node: builtins; use a package node for shared helpers",
    },
    {
      script:
        "export async function run() { return import('https://deno.land/x/imagescript/mod.ts'); }",
      problem:
        "imports must be pinned supported HTTPS URLs or node: builtins; use a package node for shared helpers",
    },
    {
      script:
        "export function run() { return 'https://n8n.artworks.ai/webhook/blocked-images'; }",
      problem: "obsolete n8n endpoint needs removal",
    },
    {
      script: "function run() { return {}; }",
      problem: "script must export run",
    },
    {
      script: "export function run( {",
      problem: "script has invalid JavaScript syntax",
    },
  ])("rejects $problem in actual script code", ({ script, problem }) => {
    const pipeline = preparedFixture(script);

    const result = check(pipeline);

    expect(result.errors).toContain(`Node echo_node: ${problem}`);
  });

  it("checks JavaScript syntax rather than flagging require in a comment", () => {
    const pipeline = preparedFixture(
      `// require('openai') was replaced by fetch.\n${SCRIPT}`
    );

    const result = check(pipeline);

    expect(result.errors).toEqual([]);
  });

  it("accepts bundled named exports and pinned image imports without fetching", () => {
    const pipeline =
      preparedFixture(`import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
async function run() { return { outputs: { result: Image.RESIZE_AUTO } }; }
export { run };`);

    const result = check(pipeline);

    expect(result.errors).toEqual([]);
  });

  it("rejects stale Environment declarations even when the script no longer reads them", () => {
    const pipeline = preparedFixture();
    Object.assign(pipeline.nodes.echo_node.environment, {
      OPEN_PAAS_PASSWORD: { type: "string" },
    });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: legacy Environment declaration OPEN_PAAS_PASSWORD"
    );
  });

  it("rejects catalog dependencies in the deliverable", () => {
    const pipeline = preparedFixture();
    Object.assign(pipeline.nodes.echo_node, { source: "catalog" });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: expected an inline Script Node or a package node without catalog identity"
    );
  });

  it("reports invalid YAML without echoing source values", () => {
    const result = validatePreparedPipeline(
      "name: [\n  secret: fixture-password"
    );

    expect(result.errors).toEqual(["Invalid pipeline YAML"]);
  });
});
