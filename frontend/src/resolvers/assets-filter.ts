import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { AssetsFilter } from "src/models/assets";
import { Project } from "src/models/project";

@Injectable({ providedIn: "root" })
export class AssetsFilterResolver implements Resolve<AssetsFilter> {
  resolve(route: ActivatedRouteSnapshot) {
    return new AssetsFilter({
      ...(() => {
        const { _id } = (route.parent.data["project"] as Project) || {};
        return !!_id ? { project: _id } : {};
      })(),
    });
  }
}
