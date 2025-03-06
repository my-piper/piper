import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { map } from "rxjs";
import { User } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { toInstance } from "src/utils/models";

@Injectable({ providedIn: "root" })
export class UserResolver implements Resolve<User> {
  constructor(private http: HttpService) {}

  resolve(route: ActivatedRouteSnapshot) {
    const { user } = route.params;

    return this.http
      .get(`users/${user}`)
      .pipe(map((json) => toInstance(json as Object, User)));
  }
}
