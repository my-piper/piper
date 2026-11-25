import { validatePreparedPipeline } from "../../../tools/validate-prepared-pipelines";
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

function check(pipeline: ReturnType<typeof preparedFixture>) {
  return validatePreparedPipeline(stringify(pipeline));
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
        "imports must be pinned supported HTTPS URLs or node: builtins; embed local helpers",
    },
    {
      script:
        "export async function run() { return import('https://deno.land/x/imagescript/mod.ts'); }",
      problem:
        "imports must be pinned supported HTTPS URLs or node: builtins; embed local helpers",
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

  it("rejects catalog dependencies in the inline deliverable", () => {
    const pipeline = preparedFixture();
    Object.assign(pipeline.nodes.echo_node, { package: "v1_pipelines" });

    const result = check(pipeline);

    expect(result.errors).toContain(
      "Node echo_node: expected an inline Script Node without catalog identity"
    );
  });

  it("reports invalid YAML without echoing source values", () => {
    const result = validatePreparedPipeline(
      "name: [\n  secret: fixture-password"
    );

    expect(result.errors).toEqual(["Invalid pipeline YAML"]);
  });
});
