import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { map } from "rxjs";
import { NodePackage } from "src/models/node-package";
import { HttpService } from "src/services/http.service";

@Injectable({ providedIn: "root" })
export class NodePackageResolver implements Resolve<NodePackage> {
  constructor(private http: HttpService) {}

  resolve(route: ActivatedRouteSnapshot) {
    const { package: id } = route.params;

    return this.http
      .get(`node-packages/${id}`)
      .pipe(map((json) => plainToInstance(NodePackage, json)));
  }
}
