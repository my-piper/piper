import { Pipeline } from "src/models/pipeline";
import { frameAround, groupMembers } from "src/utils/groups";
import { toInstance } from "src/utils/models";

function pipeline(nodes: Record<string, { x: number; y: number; w?: number }>) {
  return toInstance(
    {
      nodes: Object.fromEntries(
        Object.entries(nodes).map(([id, arrange]) => [
          id,
          { _id: id, title: id, arrange, inputs: {}, outputs: {} },
        ]),
      ),
    },
    Pipeline,
  );
}

describe("groupMembers", () => {
  const frame = { title: "G", x: 100, y: 100, w: 400, h: 200 };

  it("holds the nodes whose title bar centre is inside the frame", () => {
    const p = pipeline({
      inside: { x: 120, y: 140 },
      edge: { x: -10, y: 120 },
      wideEdge: { x: -10, y: 120, w: 300 },
      below: { x: 120, y: 290 },
      outside: { x: 600, y: 140 },
    });

    const members = groupMembers(p, frame);

    // edge: centre 100 (on the line); wideEdge: centre 140; below: 303.
    expect(members).toEqual(["inside", "edge", "wideEdge"]);
  });

  it("holds nothing in an empty pipeline", () => {
    const members = groupMembers(toInstance({}, Pipeline), frame);

    expect(members).toEqual([]);
  });
});

describe("frameAround", () => {
  it("wraps boxes with padding and room for the bar", () => {
    const frame = frameAround([
      { x: 100, y: 100, w: 220, h: 80 },
      { x: 400, y: 160, w: 220, h: 120 },
    ]);

    expect(frame).toEqual({ x: 76, y: 48, w: 568, h: 256 });
  });

  it("keeps a frame at least 120 × 80 and wraps nothing as null", () => {
    const small = frameAround([{ x: 200, y: 200, w: 10, h: 10 }]);
    const none = frameAround([]);

    expect(small).toEqual({ x: 176, y: 148, w: 120, h: 86 });
    expect(none).toBeNull();
  });

  it("cuts a frame at the canvas origin, keeping its far edges", () => {
    const frame = frameAround([{ x: 20, y: 40, w: 220, h: 60 }]);

    // Unclamped it would be x -4, y -12; right 264, bottom 124 stay.
    expect(frame).toEqual({ x: 0, y: 0, w: 264, h: 124 });
  });
});
