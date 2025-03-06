import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { Launch } from "src/models/launch";
import { PipelineMessagesFilter } from "src/models/pipeline-message";

@Injectable({ providedIn: "root" })
export class LaunchMessagesFilterResolver
  implements Resolve<PipelineMessagesFilter>
{
  resolve(route: ActivatedRouteSnapshot) {
    const { _id } = route.parent.data["launch"] as Launch;
    return new PipelineMessagesFilter({ launch: _id });
  }
}
