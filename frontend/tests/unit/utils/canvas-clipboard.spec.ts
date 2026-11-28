import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import {
  clipFromText,
  clipToText,
  copyNodes,
} from "src/utils/canvas-clipboard";
import { toInstance } from "src/utils/models";

function node(_id: string, x: number, y: number) {
  return {
    _id,
    title: _id,
    execution: "rapid",
    arrange: { x, y },
    inputs: { text: { title: "Text", type: "string" } },
    outputs: { text: { title: "Text", type: "string" } },
  };
}

function pipeline() {
  return toInstance(
    {
      start: { nodes: ["a"] },
      nodes: {
        a: node("gen", 100, 100),
        b: node("echo", 400, 160),
        c: node("echo", 700, 100),
      },
      flows: {
        a_to_b: { from: "a", output: "text", to: "b", input: "text" },
        b_to_c: { from: "b", output: "text", to: "c", input: "text" },
      },
    },
    Pipeline,
  );
}

function launchRequest() {
  return toInstance(
    { nodes: { a: { inputs: { text: "Cats" } }, c: { inputs: {} } } },
    LaunchRequest,
  );
}

describe("canvas clipboard", () => {
  it("copies the nodes, only the flows between them and their input values", () => {
    const source = pipeline();

    const clip = copyNodes(source, launchRequest(), ["a", "b", "missing"]);

    expect(clip.nodes.map(([id]) => id)).toEqual(["a", "b"]);
    expect(clip.flows).toEqual([
      expect.objectContaining({ from: "a", to: "b" }),
    ]);
    expect(clip.inputs).toEqual([["a", { inputs: { text: "Cats" } }]]);
  });

  it("copies nothing when no node is picked", () => {
    const clip = copyNodes(pipeline(), null, ["missing"]);

    expect(clip).toBeNull();
  });

  it("round-trips a clip through clipboard text and ignores other text", () => {
    const clip = copyNodes(pipeline(), launchRequest(), ["a", "b"]);

    const text = clipToText(clip);
    const others = [
      "kind: node\ntitle: Echo",
      '{"nodes": []}',
      '{"piper/canvas-clip": 2, "nodes": []}',
      "piper/canvas-clip {broken",
      null,
    ].map(clipFromText);

    expect(clipFromText(text)).toEqual(clip);
    expect(others).toEqual([null, null, null, null, null]);
  });
});
