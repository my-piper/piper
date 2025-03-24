import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { delay, finalize } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { getLabel } from "src/ui-kit/utils/i18n";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-deploy-pipeline",
  templateUrl: "./deploy-pipeline.component.html",
  styleUrls: ["./deploy-pipeline.component.scss"],
})
export class DeployPipelineComponent implements OnInit {
  schemas = SCHEMAS;

  progress = { deploying: false };
  error: Error;

  project!: Project;

  slugControl = this.fb.control<string>(null);
  form = this.fb.group({
    deploy: this.fb.control<object>(null),
  });

  constructor(
    private fb: FormBuilder,
    private projectManager: ProjectManager,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });
  }

  build() {
    const {
      title,
      pipeline: { deploy },
    } = this.project;

    this.form.patchValue({
      deploy: !!deploy
        ? toPlain(deploy)
        : {
            slug:
              getLabel(title, Languages.en).toLowerCase().replace(/\s/g, "-") +
              "-v1",
            scope: {
              activated: false,
              maxConcurrent: 1,
            },
          },
    });
  }

  save() {
    const { pipeline } = this.project;
    const { deploy } = plainToInstance(Pipeline, this.form.getRawValue());
    assign(pipeline, { deploy });
    this.projectManager.update({ pipeline });
  }

  deploy() {
    this.progress.deploying = true;
    this.cd.detectChanges();

    this.http
      .post(`projects/${this.project._id}/deploy`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deploying = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {},
        error: (err) => (this.error = err.error),
      });
  }
}
