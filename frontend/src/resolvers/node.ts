import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, ResolveFn } from "@angular/router";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { Project } from "src/models/project";

@Injectable({ providedIn: "root" })
export class NodeFromProjectResolver {
  resolve: ResolveFn<{ id: string; node: Node }> = (
    route: ActivatedRouteSnapshot,
  ) => {
    const { id } = route.params;
    const project = route.parent.data["project"] as Project;
    return { id, node: project.pipeline.nodes.get(id) };
  };
}

@Injectable({ providedIn: "root" })
export class NodeFromLaunchResolver {
  resolve: ResolveFn<{ id: string; node: Node }> = (
    route: ActivatedRouteSnapshot,
  ) => {
    const { id } = route.params;
    const launch = route.parent.data["launch"] as Launch;
    return { id, node: launch.pipeline.nodes.get(id) };
  };
}
