import { DestroyRef, Pipe, PipeTransform } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BehaviorSubject } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";
import { DeclaredVariables, getDeclaredVariables } from "src/utils/pipeline";

@Pipe({
  name: "declaredVariables",
  standalone: false,
})
export class DeclaredVariablesPipe implements PipeTransform {
  value: BehaviorSubject<DeclaredVariables> | null = null;

  constructor(
    private projectManager: ProjectManager,
    private destroyRef: DestroyRef,
  ) {}

  transform(pipeline: Pipeline): BehaviorSubject<DeclaredVariables> {
    const update = () => {
      this.value.next(getDeclaredVariables(pipeline));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<DeclaredVariables>(null);
      this.projectManager.updates
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}
