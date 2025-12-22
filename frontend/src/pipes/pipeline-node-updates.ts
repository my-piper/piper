import { Pipe, PipeTransform } from "@angular/core";
import { plainToInstance } from "class-transformer";
import {
  BehaviorSubject,
  debounceTime,
  map,
  Observable,
  takeUntil,
} from "rxjs";
import { PipelineNodeUpdates } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";

const CHECK_DELAY = 2000;

@Pipe({ name: "pipelineNodeUpdates" })
export class PipelineNodeUpdatesPipe
  extends UntilDestroyed
  implements PipeTransform
{
  last: BehaviorSubject<PipelineNodeUpdates | null>;

  constructor(
    private projectManager: ProjectManager,
    private http: HttpService
  ) {
    super();
  }

  transform(project: string): Observable<PipelineNodeUpdates | null> {
    const load = () => {
      this.http
        .get(`projects/${project}/check-node-updates`)
        .pipe(
          map((json) =>
            !!json ? plainToInstance(PipelineNodeUpdates, json) : null
          )
        )
        .subscribe((updates) => {
          this.last.next(updates);
        });
    };

    if (!this.last) {
      this.last = new BehaviorSubject<PipelineNodeUpdates>(null);

      this.projectManager.updates
        .pipe(takeUntil(this.destroyed$), debounceTime(CHECK_DELAY))
        .subscribe(() => load());
    }

    load();

    return this.last;
  }
}
