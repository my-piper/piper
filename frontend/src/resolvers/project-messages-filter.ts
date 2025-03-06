import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { PipelineMessagesFilter } from "src/models/pipeline-message";
import { Project } from "src/models/project";

@Injectable({ providedIn: "root" })
export class ProjectMessagesFilterResolver
  implements Resolve<PipelineMessagesFilter>
{
  resolve(route: ActivatedRouteSnapshot) {
    const { _id } = route.parent.data["project"] as Project;
    return new PipelineMessagesFilter({ project: _id });
  }
}
