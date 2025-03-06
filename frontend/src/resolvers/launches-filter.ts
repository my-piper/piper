import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { Launch, LaunchesFilter } from "src/models/launch";
import { Project } from "src/models/project";
import { User, UserRole } from "src/models/user";

@Injectable({ providedIn: "root" })
export class LaunchesFilterResolver implements Resolve<LaunchesFilter> {
  protected filter: Partial<LaunchesFilter> = {};

  resolve(route: ActivatedRouteSnapshot) {
    return new LaunchesFilter({
      ...this.filter,
      ...(() => {
        const { _id } = (route.parent.data["project"] as Project) || {};
        return !!_id ? { project: _id } : {};
      })(),
      ...(() => {
        const { _id } = (route.parent.data["launch"] as Launch) || {};
        return !!_id ? { parent: _id } : {};
      })(),
    });
  }
}

@Injectable({ providedIn: "root" })
export class NestedLaunchesFilterResolver implements Resolve<LaunchesFilter> {
  resolve(route: ActivatedRouteSnapshot) {
    return new LaunchesFilter({
      ...(() => {
        const { _id } = (route.parent.data["launch"] as Launch) || {};
        return !!_id ? { parent: _id } : {};
      })(),
    });
  }
}

@Injectable({ providedIn: "root" })
export class ProjectPlaygroundLaunchesFilterResolver
  implements Resolve<LaunchesFilter>
{
  resolve(route: ActivatedRouteSnapshot) {
    return new LaunchesFilter({
      ...(() => {
        const { _id, roles } = (route.parent.data["user"] as User) || {};
        return !!_id && roles?.includes(UserRole.admin)
          ? { launchedBy: _id }
          : {};
      })(),
      ...(() => {
        const { _id } = (route.parent.data["project"] as Project) || {};
        return !!_id ? { project: _id } : {};
      })(),
    });
  }
}

@Injectable({ providedIn: "root" })
export class AllLaunchesFilterResolver extends LaunchesFilterResolver {
  override filter: Partial<LaunchesFilter> = { parent: null };
}
