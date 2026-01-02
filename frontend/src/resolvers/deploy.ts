import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { map } from "rxjs";
import { Deploy } from "src/models/deploy";
import { HttpService } from "src/services/http.service";

@Injectable({ providedIn: "root" })
export class DeployResolver implements Resolve<Deploy> {
  constructor(private http: HttpService) {}

  resolve(route: ActivatedRouteSnapshot) {
    const { prefix, slug } = route.params;
    return this.http
      .get([...(!!prefix ? [prefix] : []), slug].join("/"))
      .pipe(map((json) => plainToInstance(Deploy, json)));
  }
}
