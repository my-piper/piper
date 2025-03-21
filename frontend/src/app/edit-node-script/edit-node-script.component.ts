import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { NodeExecution } from "src/enums/node-execution";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";

@Component({
  selector: "app-edit-node-script",
  templateUrl: "./edit-node-script.component.html",
  styleUrls: ["./edit-node-script.component.scss"],
})
export class EditNodeScriptComponent implements OnInit {
  nodeExecution = NodeExecution;

  project!: Project;
  id!: string;
  node!: Node;

  inputsGroup = this.fb.group({});
  form = this.fb.group({
    execution: this.fb.control<NodeExecution>(NodeExecution.regular),
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
    const { execution, script } = this.node;
    this.form.patchValue({
      execution,
      script,
    });
  }

  private save() {
    const { pipeline } = this.project;
    const { execution, script } = this.form.getRawValue();
    assign(this.node, { execution, script });
    this.projectManager.update({ pipeline });
  }
}
