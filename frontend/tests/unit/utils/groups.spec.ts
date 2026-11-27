import { Pipeline } from "src/models/pipeline";
import { groupMembers } from "src/utils/groups";
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
