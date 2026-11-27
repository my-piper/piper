import { UI } from "src/consts/ui";
import { Node, NodeInput } from "src/models/node";

/** The title bar's centre from the node's top (below its 1px border). */
const TITLE_CENTRE = 1 + UI.node.title / 2;

/** Widget rows a multi-line text input takes (#306). */
const MULTILINE_ROWS = 3;

export type WidgetKind = "number" | "text" | "choice" | "switch";

export type InputRow = {
  id: string;
  input: NodeInput;
  /** Centre of the input's socket, from the node's top edge. */
  y: number;
};

export type WidgetRow = InputRow & { kind: WidgetKind; rows: number };

export type NodeLayout = {
  /** Featured inputs drawn as socket rows, in order. */
  sockets: InputRow[];
  /** Featured inputs edited on the node body, under the socket rows. */
  widgets: WidgetRow[];
  /** The node's height down to the end of its widget rows. */
  height: number;
};

/** The widget an input gets on the node body, or null for a plain socket. */
export function widgetKind(input: NodeInput): WidgetKind | null {
  if (!input.featured) {
    return null;
  }
  if (input.enum?.length > 0) {
    return "choice";
  }
  switch (input.type) {
    case "integer":
    case "float":
      return "number";
    case "string":
      return "text";
    case "boolean":
      return "switch";
    default:
      return null;
  }
}

/**
 * Where a node's featured inputs sit (docs/design.md, #305): socket rows
 * first, as many as the larger of socket inputs and outputs, then one
 * widget row per widget input (a multi-line text takes three). Every row is
 * UI.node.input.height tall; offsets count the node's 1px border, its title
 * bar and the ports' padding, so wires meet the socket centres.
 */
export function nodeLayout(node: Node): NodeLayout {
  // Collapsed (#320): only the title bar; every socket sits at its centre.
  if (node.arrange?.collapsed) {
    return { sockets: [], widgets: [], height: TITLE_CENTRE * 2 };
  }
  const row = UI.node.input.height;
  const top = 1 + UI.node.title + UI.node.padding;
  const sockets: InputRow[] = [];
  const pending: Omit<WidgetRow, "y">[] = [];
  for (const g of node.render.inputs) {
    for (const { id, input } of g.group.inputs) {
      if (!input.featured) {
        continue;
      }
      const kind = widgetKind(input);
      if (kind) {
        const rows = kind === "text" && input.multiline ? MULTILINE_ROWS : 1;
        pending.push({ id, input, kind, rows });
      } else {
        sockets.push({ id, input, y: top + sockets.length * row + row / 2 });
      }
    }
  }
  const socketRows = Math.max(sockets.length, node.outputs?.size ?? 0);
  const widgetsTop = top + socketRows * row + UI.node.padding;
  let used = 0;
  const widgets = pending.map((w) => {
    const placed = { ...w, y: widgetsTop + used * row + row / 2 };
    used += w.rows;
    return placed;
  });
  const height =
    widgetsTop + used * row + (widgets.length > 0 ? UI.node.padding : 0);
  return { sockets, widgets, height };
}

/** The socket centre of `input` from the node's top, or of the title bar. */
export function inputOffset(node: Node, input: string): number {
  const { sockets, widgets } = nodeLayout(node);
  const found = [...sockets, ...widgets].find(({ id }) => id === input);
  return found?.y ?? TITLE_CENTRE;
}

/**
 * The socket centre of `output` from the node's top: outputs are socket rows
 * in key order; on a collapsed node, the title bar's centre.
 */
export function outputOffset(node: Node, output: string): number {
  const keys = [...(node.outputs?.keys() ?? [])].sort();
  const index = keys.indexOf(output);
  if (node.arrange?.collapsed || index < 0) {
    return TITLE_CENTRE;
  }
  const row = UI.node.input.height;
  return 1 + UI.node.title + UI.node.padding + index * row + row / 2;
}

/** Node widths (#321): 160 to 640 px, in steps of 20. */
export const NODE_WIDTH = { min: 160, max: 640, step: 20 };

/** A dragged width snapped to the step and held to the range. */
export function snapWidth(width: number): number {
  const { min, max, step } = NODE_WIDTH;
  return Math.min(max, Math.max(min, Math.round(width / step) * step));
}
