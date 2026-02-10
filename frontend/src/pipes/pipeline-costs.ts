import { OnDestroy, Pipe, PipeTransform } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { BehaviorSubject, filter, map, Observable, takeUntil } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineCosts } from "src/models/pipeline";
import { LaunchRequestChangedSignal } from "src/models/signals/launch-request";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { SignalsService } from "src/services/signals.service";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { toPlain } from "src/utils/models";

@Pipe({ name: "pipelineCosts" })
export class PipelineCostsPipe
  extends UntilDestroyed
  implements PipeTransform, OnDestroy
{
  value: BehaviorSubject<PipelineCosts> | null = null;

  constructor(
    private http: HttpService,
    private projectManager: ProjectManager,
    private signals: SignalsService,
  ) {
    super();
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.value?.complete();
  }

  transform(
    project: string,
    launchRequest: LaunchRequest | null,
  ): Observable<PipelineCosts | null> {
    const update = () => {
      this.http
        .post(
          `projects/${project}/launch-costs`,
          launchRequest ? toPlain(launchRequest) : null,
        )
        .pipe(
          map((json) => (json ? plainToInstance(PipelineCosts, json) : null)),
        )
        .subscribe((costs) => this.value.next(costs));
    };

    if (!this.value) {
      this.value = new BehaviorSubject<PipelineCosts>(null);
      update();

      this.projectManager.updates
        .pipe(takeUntil(this.destroyed$))
        .subscribe(() => update());

      this.signals.feed
        .pipe(
          takeUntil(this.destroyed$),
          filter((event) => event instanceof LaunchRequestChangedSignal),
        )
        .subscribe(() => update());
    }

    return this.value;
  }
}
