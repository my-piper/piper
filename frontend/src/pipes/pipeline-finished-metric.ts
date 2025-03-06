import { Pipe, PipeTransform } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { map, Observable } from "rxjs";
import { PipelineFinishedMetric } from "src/models/pipeline-finished-metric";
import { HttpService } from "src/services/http.service";

@Pipe({ name: "pipelineFinishedMetric" })
export class PipelineFinishedMetricPipe implements PipeTransform {
  constructor(private http: HttpService) {}

  transform(launch: string): Observable<PipelineFinishedMetric | null> {
    return this.http
      .get(`launches/${launch}/metrics/finished`)
      .pipe(
        map((json) =>
          !!json ? plainToInstance(PipelineFinishedMetric, json) : null
        )
      );
  }
}
