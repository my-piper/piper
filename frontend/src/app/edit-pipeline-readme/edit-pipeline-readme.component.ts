import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import assign from "lodash/assign";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { PipelineReadmeComponent } from "../pipeline-readme/pipeline-readme.component";

@Component({
  selector: "app-edit-pipeline-readme",
  templateUrl: "./edit-pipeline-readme.component.html",
  styleUrls: ["./edit-pipeline-readme.component.scss"],
})
export class EditPipelineReadmeComponent implements OnInit {
  project!: Project;
  modal!: PipelineReadmeComponent;

  form = this.fb.group({
    readme: this.fb.control<string | null>(null),
  });

  constructor(
    private projectManager: ProjectManager,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }

  private build() {
    const {
      pipeline: { readme },
    } = this.project;
    this.form.setValue(
      {
        readme,
      },
      { emitEvent: false }
    );
  }

  save() {
    const { readme } = this.form.getRawValue();

    const { pipeline } = this.project;
    assign(pipeline, { readme });
    this.projectManager.markDirty();
  }
}
