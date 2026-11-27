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
