import { LaunchRequest } from "src/models/launch-request";
import { NodeFlow } from "src/models/node-flow";
import { Pipeline } from "src/models/pipeline";
import {
  clipFromText,
  clipToText,
  copyNodes,
  pasteClip,
} from "src/utils/canvas-clipboard";
import { toInstance, toPlain } from "src/utils/models";

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

let counter = 0;
const nodeId = ({ _id }: { _id: string }) => `${_id}_${++counter}`;
const flowKey = ({ from, to }: NodeFlow) => `${from}_to_${to}`;

describe("canvas clipboard", () => {
  beforeEach(() => (counter = 0));

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

  it("pastes with new ids, remapped flows, moved positions and input values", () => {
    const source = pipeline();
    const request = launchRequest();
    const clip = copyNodes(source, request, ["a", "b"]);
    const flowsBefore = source.flows.size;

    const ids = pasteClip(
      clip,
      source,
      request,
      { x: 1000, y: 500 },
      nodeId,
      flowKey,
    );

    expect(ids).toEqual(["gen_1", "echo_2"]);
    expect(source.nodes.get("gen_1").arrange).toEqual(
      expect.objectContaining({ x: 1000, y: 500 }),
    );
    expect(source.nodes.get("echo_2").arrange).toEqual(
      expect.objectContaining({ x: 1300, y: 560 }),
    );
    expect(source.flows.size).toBe(flowsBefore + 1);
    expect(toPlain(source.flows.get("gen_1_to_echo_2"))).toEqual(
      expect.objectContaining({ from: "gen_1", to: "echo_2", input: "text" }),
    );
    expect(request.nodes.get("gen_1").inputs.get("text")).toBe("Cats");
    expect(source.nodes.get("a").arrange).toEqual(
      expect.objectContaining({ x: 100, y: 100 }),
    );
  });

  it("pastes twice without sharing objects between the copies", () => {
    const source = pipeline();
    const clip = copyNodes(source, null, ["a"]);

    const [first] = pasteClip(
      clip,
      source,
      null,
      { x: 0, y: 0 },
      nodeId,
      flowKey,
    );
    const [second] = pasteClip(
      clip,
      source,
      null,
      { x: 50, y: 50 },
      nodeId,
      flowKey,
    );

    expect(source.nodes.get(first)).not.toBe(source.nodes.get(second));
    expect(source.nodes.get(first).arrange.x).toBe(0);
    expect(source.nodes.get(second).arrange.x).toBe(50);
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
