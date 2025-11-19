import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { mapValues } from "lodash";
import { parse } from "qs";
import { forkJoin, map, of } from "rxjs";
import { Launch } from "src/models/launch";
import { HttpService } from "src/services/http.service";

@Injectable({ providedIn: "root" })
export class LaunchesResolver implements Resolve<{ [key: string]: Launch }> {
  constructor(private http: HttpService) {}

  resolve(route: ActivatedRouteSnapshot) {
    const { launches: qs } = route.params;
    if (!!qs) {
      const ids = parse(qs.replace(/:/g, "="), { delimiter: "," });
      return forkJoin(
        mapValues(ids, (id) =>
          this.http
            .get(`launches/${id}`)
            .pipe(map((plain) => plainToInstance(Launch, plain as Object)))
        )
      );
    } else {
      return of(null);
    }
  }
}
