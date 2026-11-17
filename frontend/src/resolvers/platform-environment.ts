import { Injectable } from "@angular/core";
import { Resolve } from "@angular/router";
import { map } from "rxjs";
import { HttpService } from "src/services/http.service";

/** Route data `platform`: what GET /api/environment/keys lists. */
@Injectable({ providedIn: "root" })
export class PlatformEnvironmentResolver implements Resolve<string[]> {
  constructor(private http: HttpService) {}

  resolve() {
    return this.http
      .get("environment/keys")
      .pipe(map((plain) => (plain as { keys: string[] }).keys));
  }
}
