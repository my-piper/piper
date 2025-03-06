import { Injectable } from "@angular/core";
import { Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { map } from "rxjs";
import { Environment } from "src/models/environment";
import { HttpService } from "src/services/http.service";

@Injectable({ providedIn: "root" })
export class MeEnvironmentResolver implements Resolve<Environment> {
  constructor(private http: HttpService) {}

  resolve() {
    return this.http
      .get("me/environment")
      .pipe(map((plain) => plainToInstance(Environment, plain as Object)));
  }
}
