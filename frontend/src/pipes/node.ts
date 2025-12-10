import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import {
  BehaviorSubject,
  distinctUntilChanged,
  filter,
  skip,
  Subject,
  takeUntil,
} from "rxjs";
import { InputFlow } from "src/models/input-flow";
import { Node } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";

@Pipe({ name: "node" })
export class NodePipe implements PipeTransform, OnDestroy {
  value: BehaviorSubject<Node> | null = null;

  destroyed$ = new Subject<void>();

  constructor(private projectManager: ProjectManager) {}

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

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
      this.projectManager.status
        .pipe(
          takeUntil(this.destroyed$),
          skip(1),
          distinctUntilChanged(),
          filter((status) => status === "dirty")
        )
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}

@Pipe({ name: "inputIndex" })
export class InputIndexOfPipe implements PipeTransform, OnDestroy {
  value: BehaviorSubject<number> | null = null;

  destroyed$ = new Subject<void>();

  constructor(private projectManager: ProjectManager) {}

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

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
      this.projectManager.status
        .pipe(
          takeUntil(this.destroyed$),
          skip(1),
          distinctUntilChanged(),
          filter((status) => status === "dirty")
        )
        .subscribe(() => update());
    }

    update();
    return this.value;
  }
}

type Flow = InputFlow | NodeFlow;

@Pipe({ name: "inputFlows" })
export class InputFlowsPipe implements PipeTransform, OnDestroy {
  value: BehaviorSubject<Flow[]> | null = null;

  destroyed$ = new Subject<void>();

  constructor(private projectManager: ProjectManager) {}

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  transform(
    pipeline: Pipeline,
    node: string,
    input: string
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
      this.projectManager.status
        .pipe(
          takeUntil(this.destroyed$),
          skip(1),
          distinctUntilChanged(),
          filter((status) => status === "dirty")
        )
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}

@Pipe({ name: "outputIndex" })
export class OutputIndexPipe implements PipeTransform {
  transform(node: Node, name: string): number {
    const keys = [];
    for (const [key, output] of node.outputs) {
      keys.push(key);
    }
    keys.sort();
    return keys.indexOf(name);
  }
}
