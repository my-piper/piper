import { Component, OnInit } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";
import * as YAML from "yaml";

@Component({
  selector: "app-edit-pipeline-yaml",
  templateUrl: "./edit-pipeline-yaml.component.html",
  styleUrls: ["./edit-pipeline-yaml.component.scss"],
})
export class EditPipelineYamlComponent implements OnInit {
  project!: Project;

  form = this.fb.group({
    pipeline: this.fb.control<string | null>(null, [Validators.required]),
    launchRequest: this.fb.control<string | null>(null, [Validators.required]),
    environment: this.fb.control<string | null>(null, [Validators.required]),
  });

  constructor(
    private projectManager: ProjectManager,
    private route: ActivatedRoute,
    private fb: FormBuilder
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });
  }

  private build() {
    const { pipeline, launchRequest, environment } = this.project;
    this.form.setValue(
      {
        pipeline: YAML.stringify(toPlain(pipeline), {
          lineWidth: 0,
        }),
        launchRequest: JSON.stringify(toPlain(launchRequest || {}), null, "  "),
        environment: JSON.stringify(toPlain(environment || {}), null, "  "),
      },
      { emitEvent: false }
    );
  }

  save() {
    const { pipeline, launchRequest, environment } = plainToInstance(
      Project,
      (() => {
        const { pipeline, launchRequest, environment } =
          this.form.getRawValue();
        return {
          pipeline: YAML.parse(<string>pipeline),
          launchRequest: JSON.parse(<string>launchRequest),
          environment: JSON.parse(<string>environment),
        };
      })()
    );

    assign(this.project, {
      title: pipeline.name,
      pipeline,
      launchRequest,
      environment,
    });
    this.projectManager.update({
      pipeline,
      launchRequest,
      environment,
    });
  }
}
