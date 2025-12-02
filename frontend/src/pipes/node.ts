import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import { BehaviorSubject, filter, Subject, takeUntil } from "rxjs";
import { Node } from "src/models/node";
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
          filter((status) => status === "dirty")
        )
        .subscribe(() => update());
    }

    update();
    return this.value;
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
