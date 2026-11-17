import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import { BehaviorSubject, takeUntil } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";
import { UntilDestroyed } from "src/utils/until-destroyed";
import { DeclaredVariables, getDeclaredVariables } from "src/utils/pipeline";

@Pipe({
  name: "declaredVariables",
  standalone: false,
})
export class DeclaredVariablesPipe
  extends UntilDestroyed
  implements PipeTransform, OnDestroy
{
  value: BehaviorSubject<DeclaredVariables> | null = null;

  constructor(private projectManager: ProjectManager) {
    super();
  }

  transform(pipeline: Pipeline): BehaviorSubject<DeclaredVariables> {
    const update = () => {
      this.value.next(getDeclaredVariables(pipeline));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<DeclaredVariables>(null);
      this.projectManager.updates
        .pipe(takeUntil(this.destroyed$))
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}
