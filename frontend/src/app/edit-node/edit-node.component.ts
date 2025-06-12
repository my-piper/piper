import { Component } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { UI } from "src/consts/ui";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { MeManager } from "src/services/me.service";
import { ProjectManager } from "src/services/project.manager";

@Component({
  selector: "app-edit-node",
  templateUrl: "./edit-node.component.html",
  styleUrls: ["./edit-node.component.scss"],
})
export class EditNodeComponent {
  userRole = UserRole;
  ui = UI;
  project!: Project;
  id!: string;
  node!: Node;

  inputsGroup = this.fb.group({});
  form = this.fb.group({
    start: this.fb.control<boolean>(false),
  });

  constructor(
    private projectManager: ProjectManager,
    private me: MeManager,
    private fb: FormBuilder,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const { pipeline } = this.project;
    this.form.patchValue({
      start: pipeline.start.nodes.includes(this.id),
    });
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

    this.projectManager.update({ pipeline, launchRequest });
  }

  unlock() {
    if (!this.me.user.roles.includes(UserRole.admin)) {
      const { environment } = this.node;
      if (!!environment) {
        for (const [k, v] of environment) {
          if (v.scope === "global") {
            assign(v, { scope: "user" });
          }
        }
      }
    }

    delete this.node._id;
    delete this.node.costs;
    assign(this.node, { locked: false, source: "node" });

    const { pipeline } = this.project;
    this.projectManager.update({ pipeline });
  }
}
