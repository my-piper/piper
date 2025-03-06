import { Pipe, PipeTransform } from "@angular/core";
import { Node } from "src/models/node";
import { Pipeline } from "src/models/pipeline";

@Pipe({ name: "node" })
export class NodePipe implements PipeTransform {
  transform(pipeline: Pipeline, id: string): Node {
    const node = pipeline.nodes.get(id);
    if (!node) {
      throw new Error(`Node ${id} not found`);
    }
    return node;
  }
}

@Pipe({ name: "inputIndex" })
export class InputIndexOfPipe implements PipeTransform {
  transform(node: Node, name: string): number {
    const keys = [];
    for (const g of node.render.inputs) {
      for (const i of g.group.inputs) {
        keys.push(i.id);
      }
    }
    return keys.indexOf(name);
  }
}

@Pipe({ name: "outputIndex" })
export class OutputIndexOfPipe implements PipeTransform {
  transform(node: Node, name: string): number {
    const keys = [];
    for (const [key, output] of node.outputs) {
      keys.push(key);
    }
    keys.sort();
    return keys.indexOf(name);
  }
}
