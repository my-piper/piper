import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import { BehaviorSubject, takeUntil } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import {
  getPipelineEnvironment,
  PipelineEnvironment,
} from "src/utils/pipeline";

@Pipe({ name: "pipelineEnvironment" })
export class PipelineEnvironmentPipe
  extends UntilDestroyed
  implements PipeTransform, OnDestroy
{
  value: BehaviorSubject<PipelineEnvironment> | null = null;

  constructor(private projectManager: ProjectManager) {
    super();
  }

  transform(pipeline: Pipeline): BehaviorSubject<PipelineEnvironment> {
    const update = () => {
      this.value.next(getPipelineEnvironment(pipeline));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<PipelineEnvironment>(null);
      this.projectManager.updates
        .pipe(takeUntil(this.destroyed$))
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}
