import { Pipe, PipeTransform } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { BehaviorSubject, map, Observable } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineCosts } from "src/models/pipeline";
import { HttpService } from "src/services/http.service";
import { toPlain } from "src/utils/models";

@Pipe({ name: "pipelineCosts" })
export class PipelineCostsPipe implements PipeTransform {
  value = new BehaviorSubject<PipelineCosts | null>(null);

  constructor(private http: HttpService) {}

  transform(
    project: string,
    launchRequest: LaunchRequest | null = null
  ): Observable<PipelineCosts | null> {
    this.http
      .post(
        `projects/${project}/launch-costs`,
        !!launchRequest ? toPlain(launchRequest) : null
      )
      .pipe(
        map((json) => (!!json ? plainToInstance(PipelineCosts, json) : null))
      )
      .subscribe((costs) => this.value.next(costs));

    return this.value;
  }
}
