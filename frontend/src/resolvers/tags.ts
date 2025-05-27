import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, ResolveFn } from "@angular/router";

@Injectable({ providedIn: "root" })
export class TagResolver {
  resolve: ResolveFn<string | null> = (route: ActivatedRouteSnapshot) => {
    const { tag } = route.params;
    return tag || null;
  };
}
