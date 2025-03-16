import { Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { assign } from "lodash";
import { shrink } from "src/app/utils/objects";
import { AppError } from "src/models/errors";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import SCHEMAS from "src/schemas/compiled.json";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-pipeline-design",
  templateUrl: "./edit-pipeline-design.component.html",
  styleUrls: ["./edit-pipeline-design.component.scss"],
})
export class EditPipelineDesignComponent implements OnInit {
  schemas = (() => {
    const {
      name,
      description,
      version,
      url,
      checkUpdates,
      thumbnail,
      category,
    } = SCHEMAS.pipeline.properties;
    return {
      pipeline: {
        ...SCHEMAS.pipeline,
        properties: {
          name,
          description,
          version,
          url,
          checkUpdates,
          thumbnail,
          category,
        },
        required: ["name", "version"],
      },
    };
  })();

  progress = { saving: false };
  error!: AppError;

  project!: Project;

  form = this.fb.group({
    pipeline: this.fb.control<object>(null),
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const { pipeline } = this.project;
    const {
      name,
      description,
      version,
      url,
      checkUpdates,
      thumbnail,
      category,
    } = toPlain(pipeline);
    this.form.patchValue({
      pipeline: shrink({
        name,
        description,
        version,
        url,
        checkUpdates,
        thumbnail,
        category,
      }),
    });
  }

  save() {
    const {
      name,
      description,
      version,
      url,
      checkUpdates,
      thumbnail,
      category,
    } = plainToInstance(
      Pipeline,
      (() => {
        const { pipeline } = this.form.getRawValue();
        return pipeline;
      })()
    );

    assign(this.project, { title: name });

    const { pipeline } = this.project;
    assign(pipeline, {
      name,
      description,
      version,
      url,
      checkUpdates,
      thumbnail,
      category,
    });
    this.projectManager.update({ title: name, pipeline });
  }
}
