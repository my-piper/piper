import { Pipe, PipeTransform } from "@angular/core";
import { Node, NodeCategory } from "src/models/node";

@Pipe({ name: "groupNodes" })
export class GroupNodesPipe implements PipeTransform {
  transform(nodes: Node[]): { category: NodeCategory; nodes: Node[] }[] {
    const categories: {
      [key: string]: { category: NodeCategory; nodes: Node[] };
    } = {};
    for (const node of nodes) {
      const id = node.category?._id || "custom";
      if (!categories[id]) {
        categories[id] = { category: node.category, nodes: [] };
      }
      categories[id].nodes.push(node);
    }
    return Object.values(categories);
  }
}
