import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { map } from "rxjs";
import { Launch } from "src/models/launch";
import { HttpService } from "src/services/http.service";

@Injectable({ providedIn: "root" })
export class LaunchResolver implements Resolve<Launch> {
  constructor(private http: HttpService) {}

  resolve(route: ActivatedRouteSnapshot) {
    const { id, launch } = route.params;
    return this.http
      .get(`launches/${launch || id}`)
      .pipe(map((plain) => plainToInstance(Launch, plain as Object)));
  }
}
