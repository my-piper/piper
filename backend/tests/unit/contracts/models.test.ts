import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { InputFlow } from "models/input-flow";
import {
  BooleanData,
  FloatData,
  ImageData,
  ImagesData,
  IntegerData,
  JsonData,
  Launch,
  LaunchData,
  LaunchState,
  StringData,
  VideoData,
} from "models/launch";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { Node, NodeInput } from "models/node";
import { Pipeline, PipelineInput } from "models/pipeline";
import { describe, expect, it } from "vitest";
import { launchRequestFixture, pipelineFixture } from "../../fixtures/pipeline";

describe("model storage contracts", () => {
  it("round trips a pipeline with typed nodes and nested input flows", () => {
    const source = pipelineFixture();

    const pipeline = toInstance(source, Pipeline);
    const restored = toInstance(
      JSON.parse(JSON.stringify(toPlain(pipeline))),
      Pipeline
    );

    expect(restored).toBeInstanceOf(Pipeline);
    expect(restored.inputs).toBeInstanceOf(Map);
    expect(restored.inputs.get("enabled")).toBeInstanceOf(PipelineInput);
    expect(
      restored.inputs.get("enabled").flows.get("enabled_flow")
    ).toBeInstanceOf(InputFlow);
    expect(restored.nodes.get("echo_node")).toBeInstanceOf(Node);
    expect(restored.nodes.get("echo_node").inputs.get("count")).toBeInstanceOf(
      NodeInput
    );
    expect(toPlain(restored)).toEqual(source);
  });

  it("round trips a launch request without losing falsy primitive map values", () => {
    const source = launchRequestFixture();

    const request = toInstance(source, LaunchRequest);
    const restored = toInstance(
      JSON.parse(JSON.stringify(toPlain(request))),
      LaunchRequest
    );

    expect(restored.inputs).toEqual(new Map(Object.entries(source.inputs)));
    expect(restored.nodes.get("echo_node")).toBeInstanceOf(NodeToLaunch);
    expect(restored.nodes.get("echo_node").inputs).toEqual(
      new Map(Object.entries(source.nodes.echo_node.inputs))
    );
    expect(toPlain(restored)).toEqual(source);
  });

  it("round trips nested launch models and dates through JSON storage", () => {
    const source = {
      _id: "test-launch",
      launchedAt: "2026-01-02T03:04:05.000Z",
      startedAt: "2026-01-02T03:04:06.000Z",
      pipeline: pipelineFixture(),
      launchRequest: launchRequestFixture(),
      environment: {
        scope: { enabled: "pipeline" },
        variables: { enabled: false, count: 0, text: "" },
      },
    };

    const launch = toInstance(source, Launch);
    const restored = toInstance(
      JSON.parse(JSON.stringify(toPlain(launch))),
      Launch
    );

    expect(restored.launchedAt).toEqual(new Date(source.launchedAt));
    expect(restored.startedAt).toEqual(new Date(source.startedAt));
    expect(restored.pipeline).toBeInstanceOf(Pipeline);
    expect(restored.launchRequest).toBeInstanceOf(LaunchRequest);
    expect(restored.environment).toBeInstanceOf(Environment);
    expect(restored.environment.scope).toEqual(
      new Map([["enabled", "pipeline"]])
    );
    expect(restored.environment.variables).toEqual(
      new Map(Object.entries(source.environment.variables))
    );
    expect(JSON.parse(JSON.stringify(toPlain(restored)))).toEqual(source);
  });

  it("excludes unexposed fields on reading and writing nested models", () => {
    const source = pipelineFixture();
    Object.assign(source, { internal: "private" });
    Object.assign(source.nodes.echo_node, { internal: "private" });

    const pipeline = toInstance(source, Pipeline);
    Object.assign(pipeline, { runtimeOnly: "private" });
    Object.assign(pipeline.nodes.get("echo_node"), { runtimeOnly: "private" });
    const plain = toPlain(pipeline);

    expect(pipeline).not.toHaveProperty("internal");
    expect(pipeline.nodes.get("echo_node")).not.toHaveProperty("internal");
    expect(plain).toEqual(pipelineFixture());
  });

  it.each([
    { type: "boolean", model: BooleanData, data: { value: false } },
    { type: "integer", model: IntegerData, data: { value: 0 } },
    { type: "float", model: FloatData, data: { value: 1.25 } },
    { type: "string", model: StringData, data: { value: "", length: 0 } },
    {
      type: "json",
      model: JsonData,
      data: { value: { items: [false, 0, ""] } },
    },
    {
      type: "image",
      model: ImageData,
      data: { url: "https://example.com/a.png", width: 10, height: 20 },
    },
    {
      type: "image[]",
      model: ImagesData,
      data: {
        images: [{ url: "https://example.com/a.png", width: 10 }],
        count: 1,
      },
    },
    {
      type: "video",
      model: VideoData,
      data: {
        url: "https://example.com/a.mp4",
        poster: "https://example.com/a.jpg",
      },
    },
  ])(
    "restores $type output data using its discriminator",
    ({ type, model, data }) => {
      const source = { outputs: { result: { type, ...data } } };

      const restored = toInstance(source, LaunchData);

      expect(restored.outputs.get("result")).toBeInstanceOf(model);
      expect(toPlain(restored)).toEqual(source);
    }
  );

  it("round trips launch state maps with typed results and null values", () => {
    const source = {
      outputs: { enabled: false, count: 0, text: "", empty: null },
      results: { enabled: { type: "boolean", value: false } },
    };

    const state = toInstance(source, LaunchState);
    const restored = toInstance(
      JSON.parse(JSON.stringify(toPlain(state))),
      LaunchState
    );

    expect(restored.outputs).toEqual(new Map(Object.entries(source.outputs)));
    expect(restored.results.get("enabled")).toBeInstanceOf(BooleanData);
    expect(toPlain(restored)).toEqual(source);
  });
});
