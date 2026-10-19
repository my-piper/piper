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
