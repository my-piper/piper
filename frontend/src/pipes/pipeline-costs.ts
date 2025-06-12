import { Pipe, PipeTransform } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { minutesToMilliseconds } from "date-fns";
import { BehaviorSubject, map, Observable } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { PipelineCosts } from "src/models/pipeline";
import { HttpService } from "src/services/http.service";
import { toPlain } from "src/utils/models";

const cache = new Map<string, BehaviorSubject<PipelineCosts>>();
setInterval(() => cache.clear(), minutesToMilliseconds(30));

@Pipe({ name: "pipelineCosts" })
export class PipelineCostsPipe implements PipeTransform {
  last: PipelineCosts | null = null;

  constructor(private http: HttpService) {}

  transform(
    project: string,
    launchRequest: LaunchRequest | null = null,
    revision: string
  ): Observable<PipelineCosts | null> {
    const key = [
      project,
      revision,
      ...(!!launchRequest ? [JSON.stringify(launchRequest)] : []),
    ].join(":");
    if (cache.has(key)) {
      return cache.get(key);
    }

    const value = new BehaviorSubject<PipelineCosts>(this.last);
    cache.set(key, value);

    this.http
      .post(
        `projects/${project}/launch-costs`,
        !!launchRequest ? toPlain(launchRequest) : null
      )
      .pipe(
        map((json) => (!!json ? plainToInstance(PipelineCosts, json) : null))
      )
      .subscribe((costs) => {
        value.next(costs);
        this.last = costs;
      });

    return value;
  }
}
