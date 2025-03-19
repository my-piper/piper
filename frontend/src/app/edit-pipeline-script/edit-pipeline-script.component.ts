import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { Pipeline } from "src/models/pipeline";
import { ProjectManager } from "src/services/project.manager";

@Component({
  selector: "app-edit-pipeline-script",
  templateUrl: "./edit-pipeline-script.component.html",
  styleUrls: ["./edit-pipeline-script.component.scss"],
})
export class EditPipelineScriptComponent implements OnInit {
  pipeline!: Pipeline;

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
    this.route.data.subscribe(({ project: { pipeline } }) => {
      this.pipeline = pipeline;
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const { script } = this.pipeline;
    this.form.patchValue({
      script,
    });
  }

  private save() {
    const { pipeline } = this;
    const { script } = this.form.getRawValue();
    assign(pipeline, { script });
    this.projectManager.update({ pipeline });
  }
}
