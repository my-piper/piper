import { Pipe, PipeTransform } from "@angular/core";
import { Node, NodeCategory } from "src/models/node";

const DEFAULT_ORDER = 999;

@Pipe({ name: "groupNodes" })
export class GroupNodesPipe implements PipeTransform {
  transform(nodes: Node[]): { category: NodeCategory; nodes: Node[] }[] {
    const categories: {
      [key: string]: { category: NodeCategory; nodes: Node[] };
    } = {};
    for (const node of nodes) {
      const id = node.category?._id ?? null;
      if (!categories[id]) {
        categories[id] = {
          category: node.category,
          nodes: [],
        };
      }
      categories[id].nodes.push(node);
    }
    return Object.values(categories)
      .map((group) => ({
        category: group.category,
        nodes: group.nodes.sort(
          (a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER)
        ),
      }))
      .sort(
        (a, b) =>
          (a.category?.order ?? DEFAULT_ORDER) -
          (b.category?.order ?? DEFAULT_ORDER)
      )
      .map(({ category, nodes }) => ({ category, nodes }));
  }
}
