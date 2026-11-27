import ajv from "app/ajv";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { LaunchRequest } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { launchRequestFixture, pipelineFixture } from "../../fixtures/pipeline";

const validatePipeline = ajv.compile(SCHEMAS.pipeline);
const validateRequest = ajv.compile(SCHEMAS.launchRequest);

describe("production pipeline schema", () => {
  it("accepts a representative pipeline before and after model transformation", () => {
    const pipeline = pipelineFixture();

    const valid = validatePipeline(pipeline);
    const restored = toPlain(toInstance(pipeline, Pipeline));

    expect(valid).toBe(true);
    expect(validatePipeline(restored)).toBe(true);
  });

  it.each(["name", "version", "start", "inputs", "outputs", "flows", "nodes"])(
    "rejects a pipeline missing %s",
    (key) => {
      const pipeline = { ...pipelineFixture() };
      delete pipeline[key];

      const valid = validatePipeline(pipeline);

      expect(valid).toBe(false);
      expect(validatePipeline.errors).toContainEqual(
        expect.objectContaining({
          keyword: "required",
          params: { missingProperty: key },
        })
      );
    }
  );

  it.each([
    {
      name: "unknown input type",
      patch: { inputs: { enabled: { type: "unknown" } } },
      keyword: "enum",
    },
    {
      name: "invalid nested node input",
      patch: {
        nodes: {
          echo_node: {
            ...pipelineFixture().nodes.echo_node,
            inputs: { enabled: { type: "boolean" } },
          },
        },
      },
      keyword: "required",
    },
    {
      name: "incomplete input flow",
      patch: {
        inputs: {
          enabled: { type: "boolean", flows: { flow: { to: "echo_node" } } },
        },
      },
      keyword: "required",
    },
    {
      name: "invalid node execution",
      patch: {
        nodes: {
          echo_node: {
            ...pipelineFixture().nodes.echo_node,
            execution: "unknown",
          },
        },
      },
      keyword: "enum",
    },
    {
      name: "unknown property",
      patch: { unexpected: true },
      keyword: "additionalProperties",
    },
  ])("rejects $name", ({ patch, keyword }) => {
    const pipeline = { ...pipelineFixture(), ...patch };

    const valid = validatePipeline(pipeline);

    expect(valid).toBe(false);
    expect(validatePipeline.errors).toContainEqual(
      expect.objectContaining({ keyword })
    );
  });
});

function withEchoNode(changes: Record<string, unknown>) {
  const pipeline = pipelineFixture();
  const { script: _script, ...node } = pipeline.nodes.echo_node;
  return {
    ...pipeline,
    nodes: { echo_node: { ...node, execution: undefined, ...changes } },
  };
}

describe("production pipeline schema for node layout", () => {
  function withArrange(arrange: object) {
    const pipeline = pipelineFixture();
    const node = pipeline.nodes.echo_node;
    return {
      ...pipeline,
      nodes: {
        echo_node: { ...node, arrange: { ...node.arrange, ...arrange } },
      },
    };
  }

  it("keeps a collapsed, resized node through model transformation", () => {
    const pipeline = withArrange({ collapsed: true, w: 320, color: "green" });

    const valid = validatePipeline(pipeline);
    const restored = toPlain(toInstance(pipeline, Pipeline)) as {
      nodes: Record<string, { arrange: object }>;
    };

    expect(valid).toBe(true);
    expect(validatePipeline(restored)).toBe(true);
    expect(restored.nodes.echo_node.arrange).toEqual(
      expect.objectContaining({ collapsed: true, w: 320, color: "green" })
    );
  });

  it.each([
    { w: 100, keyword: "minimum" },
    { w: 800, keyword: "maximum" },
  ])("rejects a node width of $w", ({ w, keyword }) => {
    const valid = validatePipeline(withArrange({ w }));

    expect(valid).toBe(false);
    expect(validatePipeline.errors).toContainEqual(
      expect.objectContaining({ keyword })
    );
  });

  it("rejects a node colour outside the palette", () => {
    const valid = validatePipeline(withArrange({ color: "pink" }));
    const keyword = "enum";

    expect(valid).toBe(false);
    expect(validatePipeline.errors).toContainEqual(
      expect.objectContaining({ keyword })
    );
  });
});

describe("production pipeline schema for groups", () => {
  function withGroups(groups: object) {
    const pipeline = pipelineFixture();
    return {
      ...pipeline,
      layout: { left: 0, top: 0, zoom: 1, groups },
    };
  }

  const group = { title: "Prepare", color: "blue", x: 0, y: 0, w: 560, h: 300 };

  it("keeps groups through model transformation", () => {
    const pipeline = withGroups({ prepare: group });

    const valid = validatePipeline(pipeline);
    const restored = toPlain(toInstance(pipeline, Pipeline)) as {
      layout: { groups: Record<string, object> };
    };

    expect(valid).toBe(true);
    expect(validatePipeline(restored)).toBe(true);
    expect(restored.layout.groups.prepare).toEqual(group);
  });

  it.each([
    { name: "an unknown colour", patch: { color: "pink" }, keyword: "enum" },
    { name: "a tiny frame", patch: { w: 40 }, keyword: "minimum" },
  ])("rejects a group with $name", ({ patch, keyword }) => {
    const valid = validatePipeline(withGroups({ g: { ...group, ...patch } }));

    expect(valid).toBe(false);
    expect(validatePipeline.errors).toContainEqual(
      expect.objectContaining({ keyword })
    );
  });
});

describe("production pipeline schema for deploy nodes", () => {
  it("accepts a node running a Deploy before and after model transformation", () => {
    const pipeline = withEchoNode({
      source: "deploy",
      deploy: { prefix: "user_1", slug: "summarizer" },
    });

    const valid = validatePipeline(JSON.parse(JSON.stringify(pipeline)));
    const restored = toPlain(toInstance(pipeline, Pipeline));

    expect(valid).toBe(true);
    expect(validatePipeline(restored)).toBe(true);
    expect(restored).toMatchObject({
      nodes: {
        echo_node: { deploy: { prefix: "user_1", slug: "summarizer" } },
      },
    });
  });

  it.each([
    {
      name: "a deploy node without its Deploy",
      changes: { source: "deploy" },
    },
    {
      name: "a deploy node with a script",
      changes: {
        source: "deploy",
        deploy: { slug: "summarizer" },
        script: "export function run() {}",
      },
    },
    {
      name: "a Deploy on a script node",
      changes: { source: "script", deploy: { slug: "summarizer" } },
    },
    {
      name: "a Deploy without a slug",
      changes: { source: "deploy", deploy: { prefix: "user_1" } },
    },
  ])("rejects $name", ({ changes }) => {
    const pipeline = JSON.parse(JSON.stringify(withEchoNode(changes)));

    const valid = validatePipeline(pipeline);

    expect(valid).toBe(false);
  });
});

describe("production launch request schema", () => {
  it("accepts falsy inputs before and after model transformation", () => {
    const request = launchRequestFixture();

    const valid = validateRequest(request);
    const restored = toPlain(toInstance(request, LaunchRequest));

    expect(valid).toBe(true);
    expect(validateRequest(restored)).toBe(true);
    expect(restored).toEqual(request);
  });

  it.each(["inputs", "nodes"])("rejects a request missing %s", (key) => {
    const request = { ...launchRequestFixture() };
    delete request[key];

    const valid = validateRequest(request);

    expect(valid).toBe(false);
    expect(validateRequest.errors).toContainEqual(
      expect.objectContaining({
        keyword: "required",
        params: { missingProperty: key },
      })
    );
  });

  it.each([
    { name: "null pipeline input", patch: { inputs: { enabled: null } } },
    { name: "object pipeline input", patch: { inputs: { enabled: {} } } },
    {
      name: "null node input",
      patch: { nodes: { echo_node: { inputs: { enabled: null } } } },
    },
    { name: "missing node inputs", patch: { nodes: { echo_node: {} } } },
    {
      name: "malformed inclusive selection",
      patch: { inclusive: { nodes: "echo_node" } },
    },
    { name: "unknown property", patch: { unexpected: true } },
  ])("rejects $name", ({ patch }) => {
    const request = { ...launchRequestFixture(), ...patch };

    const valid = validateRequest(request);

    expect(valid).toBe(false);
    expect(validateRequest.errors.length).toBeGreaterThan(0);
  });
});
