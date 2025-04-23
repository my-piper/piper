import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, ResolveFn } from "@angular/router";
import { Node } from "src/models/node";

@Injectable({ providedIn: "root" })
export class TagsResolver {
  resolve: ResolveFn<{ id: string; node: Node }> = (
    route: ActivatedRouteSnapshot
  ) => {
    const { tags } = route.params;
    return !!tags ? tags.split(",") : [];
  };
}
