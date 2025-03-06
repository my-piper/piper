import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Asset } from "src/models/assets";
import { NodeToLaunch } from "src/models/launch-request";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";

@Component({
  selector: "app-edit-node-inputs",
  templateUrl: "./edit-node-inputs.component.html",
  styleUrls: ["./edit-node-inputs.component.scss"],
})
export class EditNodeInputsComponent implements OnInit {
  userRole = UserRole;

  project!: Project;
  id!: string;
  node!: Node;

  inputsGroup = this.fb.group({});
  form = this.fb.group({
    inputs: this.inputsGroup,
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private async save() {
    const { pipeline, launchRequest } = this.project;
    const inputs = new Map<string, Primitive>();
    for (const [k, input] of this.node.inputs) {
      const value = this.inputsGroup.get(k).value as Primitive;
      switch (input.type) {
        case "boolean":
          const val = !!value;
          if (val !== input.default) {
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
          if (!!value && value !== input.default) {
            inputs.set(k, value);
          } else {
            inputs.delete(k);
          }
          break;
        default:
          inputs.set(k, value);
      }
    }

    if (inputs.size > 0) {
      launchRequest.nodes.set(this.id, new NodeToLaunch({ inputs }));
    } else {
      launchRequest.nodes.delete(this.id);
    }

    this.projectManager.update({ pipeline, launchRequest });
  }

  private build() {
    const { launchRequest } = this.project;
    for (const [k, input] of this.node.inputs) {
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

      this.inputsGroup.addControl(k, control);
    }
    this.cd.detectChanges();
  }

  put(input: string, asset: Asset) {
    this.inputsGroup.get(input).setValue(asset.url);
  }
}
