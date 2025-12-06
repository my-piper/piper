import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import { BehaviorSubject, filter, Subject, takeUntil } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";
import {
  getPipelineEnvironment,
  PipelineEnvironment,
} from "src/utils/pipeline";

@Pipe({ name: "pipelineEnvironment" })
export class PipelineEnvironmentPipe implements PipeTransform, OnDestroy {
  value: BehaviorSubject<PipelineEnvironment> | null = null;

  destroyed$ = new Subject<void>();

  constructor(private projectManager: ProjectManager) {}

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  transform(pipeline: Pipeline): BehaviorSubject<PipelineEnvironment> {
    const update = () => {
      this.value.next(getPipelineEnvironment(pipeline));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<PipelineEnvironment>(null);
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
