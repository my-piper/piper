import { Node } from "src/models/node";

const DEFAULT_ORDER = 999;
/** The title of a group of nodes that have neither a Node Package nor a category. */
const OTHER_TITLE = "en=Other;ru=Другие";

/**
 * Nodes of one Node Package, or nodes that come without one (the Script
 * Node), grouped by their category.
 */
export type NodeGroup = {
  id: string;
  title: string;
  nodes: Node[];
};

/** Groups the node catalog: nodes without a Node Package first, then packages by title. */
export function groupNodes(nodes: Node[]): NodeGroup[] {
  const groups = new Map<string, NodeGroup & { order: number }>();
  for (const node of nodes) {
    const id = node.package ?? node.category?._id ?? "";
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        nodes: [],
        ...(node.package
          ? { title: node.packageTitle || node.package, order: Infinity }
          : {
              title: node.category?.title ?? OTHER_TITLE,
              order: node.category?.order ?? DEFAULT_ORDER,
            }),
      };
      groups.set(id, group);
    }
    group.nodes.push(node);
  }
  const byOrder = (a: Node, b: Node) =>
    (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER);
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map(({ id, title, nodes }) => ({
      id,
      title,
      nodes: [...nodes].sort(byOrder),
    }));
}
