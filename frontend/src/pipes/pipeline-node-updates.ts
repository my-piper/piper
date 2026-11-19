import { DestroyRef, Pipe, PipeTransform } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { plainToInstance } from "class-transformer";
import { BehaviorSubject, filter, map, Observable } from "rxjs";
import { PipelineNodeUpdates } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";

@Pipe({
  name: "pipelineNodeUpdates",
  standalone: false,
})
export class PipelineNodeUpdatesPipe implements PipeTransform {
  last: BehaviorSubject<PipelineNodeUpdates | null>;

  constructor(
    private projectManager: ProjectManager,
    private http: HttpService,
    private destroyRef: DestroyRef,
  ) {}

  transform(project: string): Observable<PipelineNodeUpdates | null> {
    const load = () => {
      this.http
        .get(`projects/${project}/check-node-updates`)
        .pipe(
          map((json) =>
            json ? plainToInstance(PipelineNodeUpdates, json) : null,
          ),
        )
        .subscribe((updates) => {
          this.last.next(updates);
        });
    };

    if (!this.last) {
      this.last = new BehaviorSubject<PipelineNodeUpdates>(null);

      this.projectManager.status
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          filter((status) => status === "saved"),
        )
        .subscribe(() => load());
    }

    load();

    return this.last;
  }
}
