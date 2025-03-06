import { Injectable } from "@angular/core";
import { diff } from "jsondiffpatch";
import assign from "lodash/assign";
import { BehaviorSubject, debounceTime, delay, map, Subject } from "rxjs";
import { PatchProject, Project } from "src/models/project";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance, toPlain } from "src/utils/models";
import { HttpService } from "./http.service";

const UPDATE_INTERVAL = 1000;

type SaveStatus = "dirty" | "saving" | "saved" | "error";

@Injectable({ providedIn: "root" })
export class ProjectManager {
  _project!: Project;
  snapshots!: { pipeline: Object; launchRequest: Object; environment: Object };

  private updates = new Subject<Partial<Project>>();
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
      .subscribe((project) => this.save(project));
  }

  private save({ pipeline, launchRequest, environment }: Partial<Project>) {
    const snapshots = {};
    const update = new PatchProject();

    if (!!pipeline) {
      const snapshot = toPlain(pipeline);
      assign(snapshots, { pipeline: snapshot });
      assign(update, { pipeline: diff(this.snapshots.pipeline, snapshot) });
    }
    if (!!launchRequest) {
      const snapshot = toPlain(launchRequest);
      assign(snapshots, { launchRequest: snapshot });
      assign(update, {
        launchRequest: diff(this.snapshots.launchRequest, snapshot),
      });
    }
    if (!!environment) {
      const snapshot = toPlain(environment);
      assign(snapshots, { environment: snapshot });
      assign(update, {
        environment: diff(this.snapshots.environment, snapshot),
      });
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

  update(project: Partial<Project>) {
    this.updates.next(project);
    this.status.next("dirty");
  }
}
