import { Injectable } from "@angular/core";
import { Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { map } from "rxjs";
import { Environment } from "src/models/environment";
import { HttpService } from "src/services/http.service";

/** Route data `environment`: the Global Environment, or `null` before any is saved. */
@Injectable({ providedIn: "root" })
export class GlobalEnvironmentResolver implements Resolve<Environment | null> {
  constructor(private http: HttpService) {}

  resolve() {
    return this.http
      .get("environment")
      .pipe(
        map((plain) =>
          plain ? plainToInstance(Environment, plain as object) : null,
        ),
      );
  }
}
