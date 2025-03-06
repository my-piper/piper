import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, ResolveFn } from "@angular/router";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";

@Injectable({ providedIn: "root" })
export class PipelineInputFromProjectResolver {
  resolve: ResolveFn<{ id: string; input: PipelineInput }> = (
    route: ActivatedRouteSnapshot
  ) => {
    const { id } = route.params;
    const project = route.parent.data["project"] as Project;
    return { id, input: project.pipeline.inputs.get(id) };
  };
}
