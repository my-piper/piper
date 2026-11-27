import { UI } from "src/consts/ui";
import { LayoutGroup, Pipeline } from "src/models/pipeline";

/**
 * The nodes a group holds (#329): those whose title bar's centre is inside
 * the frame. Moving a node in or out changes its group; nothing is stored.
 */
export function groupMembers(pipeline: Pipeline, group: LayoutGroup): string[] {
  const members: string[] = [];
  for (const [id, node] of pipeline.nodes ?? new Map()) {
    const { x, y, w } = node.arrange ?? { x: 0, y: 0 };
    const cx = x + (w || UI.node.width) / 2;
    const cy = y + UI.node.title / 2;
    if (
      cx >= group.x &&
      cx <= group.x + group.w &&
      cy >= group.y &&
      cy <= group.y + group.h
    ) {
      members.push(id);
    }
  }
  return members;
}

/** A box on the canvas: top-left corner and size. */
export type Box = { x: number; y: number; w: number; h: number };

/** Room between a new frame and the nodes it wraps; its bar sits above. */
export const GROUP_PADDING = 24;
export const GROUP_BAR = 28;
export const GROUP_MIN = { w: 120, h: 80 };

/**
 * The frame that wraps `boxes` (#330): padded, with room for the bar. It
 * never starts above or left of the canvas (0, 0), where it couldn't be seen
 * or dragged: it is cut there, keeping its right and bottom edges.
 */
export function frameAround(boxes: Box[]): Box | null {
  if (boxes.length <= 0) {
    return null;
  }
  const left = Math.min(...boxes.map((b) => b.x)) - GROUP_PADDING;
  const top = Math.min(...boxes.map((b) => b.y)) - GROUP_PADDING - GROUP_BAR;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + GROUP_PADDING;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + GROUP_PADDING;
  const [x, y] = [Math.max(0, left), Math.max(0, top)];
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(GROUP_MIN.w, Math.round(right - x)),
    h: Math.max(GROUP_MIN.h, Math.round(bottom - y)),
  };
}
