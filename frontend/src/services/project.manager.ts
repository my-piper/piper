import { Injectable } from "@angular/core";
import { diff } from "jsondiffpatch";
import assign from "lodash/assign";
import { BehaviorSubject, debounceTime, delay, map, Subject } from "rxjs";
import { NodeToLaunch } from "src/models/launch-request";
import { PatchProject, Project } from "src/models/project";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import { HttpService } from "./http.service";

const UPDATE_INTERVAL = 1000;

function sanitize(project: Project) {
  const { pipeline, launchRequest, environment } = project;

  // remove from start unknown nodes

  const start = pipeline.start.nodes;
  let i = 0;

  while (i < start.length) {
    const id = start[i];
    if (!pipeline.nodes.has(id)) {
      start.splice(i, 1);
    } else {
      i++;
    }
  }

  // remove unknown nodes from inputs

  for (const [id, input] of pipeline.inputs) {
    const { flows } = input;
    for (const [id, flow] of flows) {
      const node = pipeline.nodes.get(flow.to);
      if (!node) {
        flows.delete(id);
        continue;
      }

      const input = node.inputs.get(flow.input);
      if (!input || !input.featured) {
        flows.delete(id);
      }
    }

    if (input.flows.size === 0) {
      pipeline.inputs.delete(id);
      launchRequest.inputs.delete(id);
    }
  }

  // remove default values from launch request

  for (const [node, nodeToLaunch] of launchRequest.nodes) {
    if (!pipeline.nodes.has(node)) {
      launchRequest.nodes.delete(node);
      continue;
    }

    if (!!nodeToLaunch.inputs) {
      for (const [id, value] of nodeToLaunch.inputs) {
        const input = pipeline.nodes.get(node).inputs.get(id);
        if (!input || value === input.default) {
          nodeToLaunch.inputs.delete(id);
        }
      }
    }

    if (!!nodeToLaunch.outputs) {
      for (const [id, value] of nodeToLaunch.outputs) {
        const output = pipeline.nodes.get(node).outputs.get(id);
        if (!output) {
          nodeToLaunch.inputs.delete(id);
        }
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

  // remove unknown nodes from outputs

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

  // fill launch request nodes inputs

  for (const [id, flow] of pipeline.flows) {
    const [output, input] = [
      pipeline.nodes.get(flow.from)?.outputs.get(flow.output),
      pipeline.nodes.get(flow.to)?.inputs.get(flow.input),
    ];

    if (!input || !input.featured) {
      pipeline.flows.delete(id);
      continue;
    }

    if (!output) {
      pipeline.flows.delete(id);
      continue;
    }

    console.log(flow.from);

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
        case "array": {
          switch (output.type) {
            case "image[]":
              switch (input.type) {
                case "image":
                  const {
                    transformer: { index },
                  } = flow;
                  const array = (value as string).split("|");
                  const element =
                    array[Math.min(array.length - 1, index)] || null;
                  setNodeInputValue(element);
                  break;
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
