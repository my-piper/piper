import { Injectable } from "@angular/core";
import { CanActivate, Router, UrlTree } from "@angular/router";
import { AppConfig } from "src/models/app-config";

@Injectable({ providedIn: "root" })
export class AnonymousGuard implements CanActivate {
  constructor(
    private config: AppConfig,
    private router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    return !this.config.authorization ? true : this.router.createUrlTree(["/"]);
  }
}
