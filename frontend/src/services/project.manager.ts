import { Injectable } from "@angular/core";
import { diff } from "jsondiffpatch/with-text-diffs";
import { get } from "lodash";
import assign from "lodash/assign";
import {
  BehaviorSubject,
  debounceTime,
  delay,
  map,
  mergeMap,
  of,
  Subject,
  tap,
} from "rxjs";
import { ConflictError } from "src/models/errors";
import { NodeToLaunch } from "src/models/launch-request";
import { PatchProject, Project } from "src/models/project";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/consts/ui";
import { createLogger, LogLevel } from "src/utils/logger";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import { dropDangling } from "src/utils/pipeline-editor";
import { HttpService } from "./http.service";

const logger = createLogger("project_manager", LogLevel.debug);

function sanitize(project: Project) {
  const { pipeline, launchRequest } = project;

  // TODO: check groups for inputs/outputs exists
  // TODO: reset from launch request inputs what has pipeline input flows
  // TODO: clear empty node to launch inputs/outputs

  // drop flows, start marks and launch values of unknown nodes and sockets,
  // as the pipeline editor does on every edit

  dropDangling(pipeline, launchRequest);

  // remove pipeline inputs without flows

  for (const [id, input] of pipeline.inputs) {
    if (input.flows.size === 0) {
      pipeline.inputs.delete(id);
      launchRequest.inputs.delete(id);
    }
  }

  // remove default values from launch request

  for (const [node, nodeToLaunch] of launchRequest.nodes) {
    for (const [id, value] of nodeToLaunch.inputs ?? []) {
      if (value === pipeline.nodes.get(node).inputs.get(id).default) {
        nodeToLaunch.inputs.delete(id);
      }
    }
  }

  for (const [node, nodeToLaunch] of launchRequest.nodes) {
    if (
      (nodeToLaunch.inputs?.size || 0) === 0 &&
      (nodeToLaunch.outputs?.size || 0) === 0
    ) {
      launchRequest.nodes.delete(node);
    }
  }

  // remove pipeline outputs without flows

  for (const [id, output] of pipeline.outputs) {
    if (output.flows.size === 0) {
      pipeline.outputs.delete(id);
    }
  }

  // fill launch request nodes inputs

  for (const [, flow] of pipeline.flows) {
    const [output, input] = [
      pipeline.nodes.get(flow.from).outputs.get(flow.output),
      pipeline.nodes.get(flow.to).inputs.get(flow.input),
    ];

    const value = launchRequest.nodes.get(flow.from)?.outputs?.get(flow.output);
    if (value !== undefined) {
      const setNodeInputValue = (value: Primitive) => {
        let nodeToLaunch = launchRequest.nodes.get(flow.to);
        if (!nodeToLaunch) {
          nodeToLaunch = mapTo({}, NodeToLaunch);
          launchRequest.nodes.set(flow.to, nodeToLaunch);
        }

        nodeToLaunch.inputs ??= new Map<string, Primitive>();
        nodeToLaunch.inputs.set(flow.input, value);
      };
      switch (flow.transformer?.type) {
        case "json": {
          const { path } = flow.transformer;
          if (path) {
            let json: object = null;

            try {
              json = JSON.parse(value as string) as object;
            } catch (e) {
              logger.error(e);
              break;
            }

            const fromPath = get(json, path);
            if (fromPath !== undefined) {
              switch (input.type) {
                case "boolean":
                  setNodeInputValue(Boolean(fromPath));
                  break;
                case "integer":
                  if (typeof fromPath === "number") {
                    setNodeInputValue(fromPath);
                  } else if (typeof fromPath === "string") {
                    setNodeInputValue(parseInt(fromPath));
                  }
                  break;
                case "float":
                  if (typeof fromPath === "number") {
                    setNodeInputValue(fromPath);
                  } else if (typeof fromPath === "string") {
                    setNodeInputValue(parseFloat(fromPath));
                  }
                  break;
                case "string":
                  if (typeof fromPath === "string") {
                    setNodeInputValue(fromPath);
                  } else if (typeof fromPath === "number") {
                    setNodeInputValue(fromPath.toString());
                  }
                  break;
                case "json":
                  if (typeof fromPath === "object") {
                    setNodeInputValue(JSON.stringify(fromPath));
                  }
                  break;
              }
            }
          }
          break;
        }
        case "array": {
          switch (output.type) {
            case "image[]":
              switch (input.type) {
                case "image": {
                  const {
                    transformer: { index },
                  } = flow;
                  const array = (value as string).split("|");
                  const element =
                    array[Math.min(array.length - 1, index)] || null;
                  setNodeInputValue(element);
                  break;
                }
              }
              break;
          }
          break;
        }
        default: {
          setNodeInputValue(value);
        }
      }
    }
  }
}

type SaveStatus = "dirty" | "saving" | "saved" | "error";

@Injectable({ providedIn: "root" })
export class ProjectManager {
  _project: Project | null = null;
  snapshots: {
    pipeline: object | null;
    launchRequest: object | null;
    environment: object | null;
  } = {
    pipeline: null,
    launchRequest: null,
    environment: null,
  };

  dirty = new Subject<object | null>();
  updates = new Subject<object | null>();
  status = new BehaviorSubject<SaveStatus | null>(null);
  error = new BehaviorSubject<Error | null>(null);

  /** The last save failed because another project has the pipeline's name. */
  get titleTaken(): boolean {
    return (
      this.status.value === "error" && this.error.value instanceof ConflictError
    );
  }

  set project(project: Project) {
    this._project = project;
    this.resave = false;
    this.snapshots = {
      pipeline: null,
      launchRequest: null,
      environment: null,
    };

    if (project) {
      const { pipeline, launchRequest, environment } = project;
      this.snapshots = {
        pipeline: toPlain(pipeline),
        launchRequest: toPlain(launchRequest),
        environment: toPlain(environment),
      };
    }
  }

  get project() {
    return this._project;
  }

  lastUpdate = new Date();

  // Project whose PATCH is in flight; `status` can turn "dirty" meanwhile.
  private saving: Project | null = null;
  // A save was requested while that PATCH was in flight.
  private resave = false;

  constructor(private http: HttpService) {
    const update = (initiator: object | null) => {
      if (!this.project) {
        return;
      }
      sanitize(this.project);
      this.updates.next(initiator);
    };

    this.dirty
      .pipe(
        mergeMap((initiator) => {
          const diff = Date.now() - this.lastUpdate.getTime();
          this.lastUpdate = new Date();
          if (diff > 1000) {
            logger.debug("Immediate update");
            update(initiator);
          }
          return of(initiator);
        }),
        debounceTime(1000),
        tap((initiator) => {
          logger.debug("Delayed update");
          update(initiator);
        }),
        debounceTime(3000),
      )
      .subscribe(() => this.save());
  }

  kick() {
    this.save();
  }

  private save() {
    logger.debug("Save project");

    const { project } = this;
    if (!project) {
      return;
    }

    if (this.saving === project) {
      this.resave = true;
      return;
    }

    const snapshots = {};
    const update = new PatchProject();

    const { pipeline, launchRequest, environment } = project;

    if (pipeline) {
      const snapshot = toPlain(pipeline);
      const changes = diff(this.snapshots.pipeline, snapshot);
      if (changes) {
        assign(snapshots, { pipeline: snapshot });
        assign(update, { pipeline: changes });
      }
    }
    if (launchRequest) {
      const snapshot = toPlain(launchRequest);
      const changes = diff(this.snapshots.launchRequest, snapshot);
      if (changes) {
        assign(snapshots, { launchRequest: snapshot });
        assign(update, {
          launchRequest: changes,
        });
      }
    }
    if (environment) {
      const snapshot = toPlain(environment);
      const changes = diff(this.snapshots.environment, snapshot);
      if (changes) {
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

    const { _id: id, revision } = project;
    this.saving = project;
    this.status.next("saving");
    this.http
      .patch(`projects/${id}/patch/${revision}`, update)
      .pipe(
        delay(UI_DELAY),
        map((json) => toInstance(json as object, Project)),
      )
      .subscribe({
        next: ({ revision }) => {
          console.log(`Project saved with revision ${revision}`);
          this.saving = null;
          if (this.project !== project) {
            return;
          }

          assign(project, { revision });
          assign(this.snapshots, snapshots);
          if (this.resave) {
            this.resave = false;
            this.save();
          } else if (this.status.value !== "dirty") {
            this.status.next("saved");
          }
        },
        error: (err) => {
          this.saving = null;
          if (this.project !== project) {
            return;
          }

          this.resave = false;
          this.status.next("error");
          this.error.next(err);
        },
      });
  }

  markDirty(initiator: object = null) {
    this.dirty.next(initiator);
    this.status.next("dirty");
  }
}
