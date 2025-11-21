import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription } from "rxjs";
import { Asset } from "src/models/assets";
import { NodeToLaunch } from "src/models/launch-request";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";
import { UI } from "src/ui-kit/consts";

@Component({
  selector: "app-edit-node-inputs",
  templateUrl: "./edit-node-inputs.component.html",
  styleUrls: ["./edit-node-inputs.component.scss"],
})
export class EditNodeInputsComponent implements OnInit {
  userRole = UserRole;
  ui = UI;

  project!: Project;
  id!: string;
  node!: Node;

  subscriptions: { changes?: Subscription } = {};

  inputsGroup = this.fb.group({});
  form = this.fb.group({
    start: this.fb.control<boolean>(false),
    inputs: this.inputsGroup,
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    public route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
  }
  private build() {
    this.subscriptions.changes?.unsubscribe();
    Object.keys(this.inputsGroup.controls).forEach((key) =>
      this.inputsGroup.removeControl(key)
    );
    const { pipeline, launchRequest } = this.project;
    for (const [k, input] of this.node.inputs) {
      const inputGroup = this.fb.group({});

      const control = this.fb.control<Primitive>(null);
      const value =
        launchRequest.nodes.get(this.id)?.inputs?.get(k) || input.default;
      switch (input.type) {
        case "boolean":
          control.setValue(!!value);
          break;
        default:
          control.setValue(value);
      }

      inputGroup.addControl("value", control);

      this.inputsGroup.addControl(k, inputGroup);
    }

    this.form.patchValue({
      start: pipeline.start.nodes.includes(this.id),
    });

    this.subscriptions.changes = this.form.valueChanges.subscribe(() =>
      this.save()
    );
  }

  put(input: string, asset: Asset) {
    this.inputsGroup.get(input).setValue(asset.url);
  }

  private async save() {
    const { pipeline, launchRequest } = this.project;

    const { start } = this.form.getRawValue();
    const index = pipeline.start.nodes.indexOf(this.id);
    if (start) {
      if (index === -1) {
        pipeline.start.nodes.push(this.id);
      }
    } else {
      if (index !== -1) {
        pipeline.start.nodes.splice(index, 1);
      }
    }

    const inputs = new Map<string, Primitive>();
    for (const [k, input] of this.node.inputs) {
      const inputGroup = this.inputsGroup.get(k);
      if (!inputGroup) {
        console.error(`Group for input [${k}] not found`);
        continue;
      }

      const value = inputGroup.get("value").value as Primitive;
      switch (input.type) {
        case "boolean":
          const val = value as boolean;
          if (val) {
            inputs.set(k, val);
          } else {
            inputs.delete(k);
          }

          break;
        case "integer":
        case "float":
        case "string":
        case "string[]":
        case "json":
        case "image":
          if (!!value) {
            inputs.set(k, value);
          } else {
            inputs.delete(k);
          }
          break;
        default:
          inputs.set(k, value);
      }
    }

    let nodeToLaunch = launchRequest.nodes.get(this.id);
    if (!nodeToLaunch) {
      nodeToLaunch = new NodeToLaunch();
      launchRequest.nodes.set(this.id, nodeToLaunch);
    }
    nodeToLaunch.inputs = inputs;

    this.projectManager.markDirty();
  }

  markFeatured(input: string) {
    this.node.inputs.get(input).featured = true;
    this.projectManager.markDirty();
  }

  markUnFeatured(input: string) {
    delete this.node.inputs.get(input).featured;
    this.projectManager.markDirty();
  }
}
