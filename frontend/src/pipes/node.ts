import { DestroyRef, Pipe, PipeTransform } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BehaviorSubject } from "rxjs";
import { InputFlow } from "src/models/input-flow";
import { Node } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";

@Pipe({
  name: "node",
  standalone: false,
})
export class NodePipe implements PipeTransform {
  value: BehaviorSubject<Node> | null = null;

  constructor(
    private projectManager: ProjectManager,
    private destroyRef: DestroyRef,
  ) {}

  transform(pipeline: Pipeline, id: string): BehaviorSubject<Node> {
    const update = () => {
      const node = pipeline.nodes.get(id);
      if (!node) {
        throw new Error(`Node ${id} not found`);
      }
      this.value.next(node);
    };

    if (!this.value) {
      this.value = new BehaviorSubject<Node>(null);
      this.projectManager.updates
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}

@Pipe({
  name: "inputIndex",
  standalone: false,
})
export class InputIndexOfPipe implements PipeTransform {
  value: BehaviorSubject<number> | null = null;

  constructor(
    private projectManager: ProjectManager,
    private destroyRef: DestroyRef,
  ) {}

  transform(node: Node, name: string): BehaviorSubject<number> {
    const update = () => {
      const keys = [];
      for (const g of node.render.inputs) {
        for (const i of g.group.inputs) {
          if (!i.input.featured) {
            continue;
          }
          keys.push(i.id);
        }
      }
      this.value.next(keys.indexOf(name));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<number>(0);
      this.projectManager.updates
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => update());
    }

    update();
    return this.value;
  }
}

type Flow = InputFlow | NodeFlow;

@Pipe({
  name: "inputFlows",
  standalone: false,
})
export class InputFlowsPipe implements PipeTransform {
  value: BehaviorSubject<Flow[]> | null = null;

  constructor(
    private projectManager: ProjectManager,
    private destroyRef: DestroyRef,
  ) {}

  transform(
    pipeline: Pipeline,
    node: string,
    input: string,
  ): BehaviorSubject<Flow[]> {
    const update = () => {
      const flows: Flow[] = [];
      for (const [, i] of pipeline.inputs) {
        for (const [, flow] of i.flows) {
          if (flow.to === node && flow.input === input) {
            flows.push(flow);
          }
        }
      }

      for (const [, flow] of pipeline.flows) {
        if (flow.to === node && flow.input === input) {
          flows.push(flow);
        }
      }
      this.value.next(flows);
    };

    if (!this.value) {
      this.value = new BehaviorSubject<Flow[]>([]);
      this.projectManager.updates
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}

@Pipe({
  name: "outputIndex",
  standalone: false,
})
export class OutputIndexPipe implements PipeTransform {
  transform(node: Node, name: string): number {
    const keys = [];
    for (const [key] of node.outputs) {
      keys.push(key);
    }
    keys.sort();
    return keys.indexOf(name);
  }
}
