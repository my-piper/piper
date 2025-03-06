import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";

@Component({
  selector: "app-edit-node-script",
  templateUrl: "./edit-node-script.component.html",
  styleUrls: ["./edit-node-script.component.scss"],
})
export class EditNodeScriptComponent implements OnInit {
  project!: Project;
  id!: string;
  node!: Node;

  inputsGroup = this.fb.group({});
  form = this.fb.group({
    script: this.fb.control<string>(null),
  });

  constructor(
    private projectManager: ProjectManager,
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
    const { script } = this.node;
    this.form.patchValue({
      script,
    });
  }

  private save() {
    const { pipeline, launchRequest } = this.project;
    const { script } = this.form.getRawValue();
    assign(this.node, { script });
    this.projectManager.update({ pipeline, launchRequest });
  }
}
