import { Node } from "src/models/node";
import { toInstance } from "src/utils/models";
import { inputOffset, nodeLayout, widgetKind } from "src/utils/node-layout";

function node(inputs: object, outputs: object = {}) {
  return toInstance({ _id: "n", title: "N", inputs, outputs }, Node);
}

describe("node layout", () => {
  it("gives scalar and choice inputs a widget, others a socket", () => {
    const n = node({
      image: { order: 1, type: "image", featured: true },
      steps: { order: 2, type: "integer", featured: true },
      mode: { order: 3, type: "json", featured: true, enum: ["a", "b"] },
      hidden: { order: 4, type: "string" },
    });

    const kinds = [...n.inputs.values()].map(widgetKind);

    expect(kinds).toEqual([null, "number", "choice", null]);
  });

  it("puts socket rows first and widget rows after them", () => {
    const n = node(
      {
        image: { order: 1, type: "image", featured: true },
        prompt: { order: 2, type: "string", featured: true, multiline: true },
        steps: { order: 3, type: "integer", featured: true },
      },
      { a: { type: "image" }, b: { type: "json" } },
    );

    const layout = nodeLayout(n);

    // Same centre as the old (i + 1) × 22 + 20 for socket rows.
    expect(layout.sockets.map(({ id, y }) => [id, y])).toEqual([["image", 42]]);
    // Two socket rows (outputs), the ports' padding, then 3 + 1 widget rows.
    expect(layout.widgets.map(({ id, y, rows }) => [id, y, rows])).toEqual([
      ["prompt", 90, 3],
      ["steps", 156, 1],
    ]);
    expect(layout.height).toBe(171);
    expect(inputOffset(n, "steps")).toBe(156);
  });

  it("points a missing input at the title bar", () => {
    const offset = inputOffset(node({}), "gone");

    expect(offset).toBe(14);
  });
});
