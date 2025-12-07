import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import { plainToInstance } from "class-transformer";
import {
  BehaviorSubject,
  distinctUntilChanged,
  filter,
  map,
  Observable,
  skip,
  Subject,
  takeUntil,
} from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineCosts } from "src/models/pipeline";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";

@Pipe({ name: "pipelineCosts" })
export class PipelineCostsPipe implements PipeTransform, OnDestroy {
  value: BehaviorSubject<PipelineCosts> | null = null;

  destroyed$ = new Subject<void>();

  constructor(
    private http: HttpService,
    private projectManager: ProjectManager
  ) {}

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  transform(
    project: string,
    launchRequest: LaunchRequest | null = null
  ): Observable<PipelineCosts | null> {
    const update = () => {
      this.http
        .post(
          `projects/${project}/launch-costs`,
          !!launchRequest ? toPlain(launchRequest) : null
        )
        .pipe(
          map((json) => (!!json ? plainToInstance(PipelineCosts, json) : null))
        )
        .subscribe((costs) => this.value.next(costs));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<PipelineCosts>(null);
      this.projectManager.status
        .pipe(
          takeUntil(this.destroyed$),
          skip(1),
          distinctUntilChanged(),
          filter((status) => status === "saved")
        )
        .subscribe(() => update());
    }

    update();

    return this.value;
  }
}
