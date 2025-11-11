import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { debounceTime } from "rxjs";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";

@Component({
  selector: "app-edit-node-app",
  templateUrl: "./edit-node-app.component.html",
  styleUrls: ["./edit-node-app.component.scss"],
})
export class EditNodeAppComponent implements OnInit {
  project!: Project;
  id!: string;
  node!: Node;

  appControl = this.fb.control<string>(null);
  form = this.fb.group({
    app: this.appControl,
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
  }

  private build() {
    const { app } = this.node;
    this.form.patchValue({ app });

    this.appControl.valueChanges
      .pipe(debounceTime(2000))
      .subscribe(() => this.save());
  }

  save() {
    const { app } = this.form.getRawValue();

    const { pipeline } = this.project;
    assign(this.node, { app });
    this.projectManager.markDirty();
  }
}
