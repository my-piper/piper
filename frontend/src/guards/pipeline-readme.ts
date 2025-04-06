import { Injectable } from "@angular/core";
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from "@angular/router";

@Injectable({ providedIn: "root" })
export class ShouldCheckReadmeGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const { id } = route.params;
    const key = `readme-${id}`;
    const checked = localStorage.getItem(key);
    if (!checked) {
      localStorage.setItem(key, "x");
    }
    return checked ? true : this.router.createUrlTree(["play", id, "readme"]);
  }
}
