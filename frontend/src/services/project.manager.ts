import { Injectable } from "@angular/core";
import { diff } from "jsondiffpatch";
import assign from "lodash/assign";
import { BehaviorSubject, debounceTime, delay, map, Subject } from "rxjs";
import { PatchProject, Project } from "src/models/project";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance, toPlain } from "src/utils/models";
import { HttpService } from "./http.service";

const UPDATE_INTERVAL = 1000;

function sanitize(project: Project) {
  const { pipeline, launchRequest, environment } = project;

  // remove from start unknown nodes

  for (const [id, input] of pipeline.inputs) {
    const { flows } = input;
    for (const [id, flow] of flows) {
      if (!pipeline.nodes.has(flow.to)) {
        flows.delete(id);
      }
    }

    if (input.flows.size === 0) {
      pipeline.inputs.delete(id);
      launchRequest.inputs.delete(id);
    }
  }

  for (const [id, output] of pipeline.outputs) {
    const { flows } = output;
    for (const [id, flow] of flows) {
      if (!pipeline.nodes.has(flow.from)) {
        flows.delete(id);
      }
    }

    if (output.flows.size === 0) {
      pipeline.outputs.delete(id);
    }
  }
}

type SaveStatus = "dirty" | "saving" | "saved" | "error";

@Injectable({ providedIn: "root" })
export class ProjectManager {
  _project!: Project;
  snapshots!: { pipeline: Object; launchRequest: Object; environment: Object };

  private updates = new Subject<void>();
  status = new BehaviorSubject<SaveStatus | null>(null);
  error = new BehaviorSubject<Error | null>(null);

  set project(project: Project) {
    this._project = project;

    const { pipeline, launchRequest, environment } = project;
    this.snapshots = {
      pipeline: toPlain(pipeline),
      launchRequest: toPlain(launchRequest),
      environment: toPlain(environment),
    };
  }

  get project() {
    return this._project;
  }

  constructor(private http: HttpService) {
    this.updates
      .pipe(debounceTime(UPDATE_INTERVAL))
      .subscribe(() => this.save());
  }

  kick() {
    this.save();
  }

  private save() {
    if (this.status.value === "saving") {
      return;
    }

    const snapshots = {};
    const update = new PatchProject();

    const { pipeline, launchRequest, environment } = this.project;

    if (!!pipeline) {
      const snapshot = toPlain(pipeline);
      const changes = diff(this.snapshots.pipeline, snapshot);
      if (!!changes) {
        assign(snapshots, { pipeline: snapshot });
        assign(update, { pipeline: changes });
      }
    }
    if (!!launchRequest) {
      const snapshot = toPlain(launchRequest);
      const changes = diff(this.snapshots.launchRequest, snapshot);
      if (!!changes) {
        assign(snapshots, { launchRequest: snapshot });
        assign(update, {
          launchRequest: changes,
        });
      }
    }
    if (!!environment) {
      const snapshot = toPlain(environment);
      const changes = diff(this.snapshots.environment, snapshot);
      if (!!changes) {
        assign(snapshots, { environment: snapshot });
        assign(update, {
          environment: changes,
        });
      }
    }

    if (Object.keys(update).length <= 0) {
      this.status.next("saved");
      return;
    }

    const { _id: id, revision } = this.project;
    this.status.next("saving");
    this.http
      .patch(`projects/${id}/patch/${revision}`, update)
      .pipe(
        delay(UI_DELAY),
        map((json) => toInstance(json as object, Project))
      )
      .subscribe({
        next: ({ revision }) => {
          console.log(`Project saved with revision ${revision}`);
          assign(this.project, { revision });
          assign(this.snapshots, snapshots);
          this.status.next("saved");
        },
        error: (err) => {
          this.status.next("error");
          this.error.next(err);
        },
      });
  }

  markDirty() {
    sanitize(this.project);
    this.updates.next();
    this.status.next("dirty");
  }
}
