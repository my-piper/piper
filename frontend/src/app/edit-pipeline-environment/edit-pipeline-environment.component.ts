import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import * as marked from "marked";
import { delay, finalize } from "rxjs";
import { Environment } from "src/models/environment";
import { AppError } from "src/models/errors";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-pipeline-environment",
  templateUrl: "./edit-pipeline-environment.component.html",
  styleUrls: ["./edit-pipeline-environment.component.scss"],
})
export class EditPipelineEnvironmentComponent implements OnInit {
  progress = { saving: false };
  error!: AppError;

  schemas: {
    environment: {
      type: string;
      title: string;
      properties: {
        variables: {
          type: string;
          title: string;
          properties: {
            [key: string]: {
              type: string;
              title: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        };
      };
      required: string[];
      additionalProperties: boolean;
    };
  } = {
    environment: {
      type: "object",
      title: "Environment",
      properties: {
        variables: {
          type: "object",
          title: "Variables",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      required: ["variables"],
      additionalProperties: false,
    },
  };

  project: Project;
  environment: { pipeline?: Environment; user?: Environment } = {};

  form = this.fb.group({
    environment: this.fb.control<object>(null),
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, environment }) => {
      this.project = project;
      assign(this.environment, {
        pipeline: project.environment,
        user: environment,
      });
      this.build();
    });
  }

  private build() {
    const { variables } = this.schemas.environment.properties;
    for (const [, node] of this.project.pipeline.nodes) {
      if (!!node.environment) {
        for (const [
          key,
          { title, type, scope, description },
        ] of node.environment) {
          if (scope !== "global") {
            variables.properties[key] = {
              title,
              type,
              description: !!description
                ? (marked.parse(description) as string)
                : null,
            };
            variables.required.push(key);
          }
        }
      }
    }

    const environment = new Environment({
      variables: new Map<string, Primitive>(),
    });

    {
      const variables = this.environment.user?.variables;
      if (!!variables) {
        for (const [key, value] of variables) {
          environment.variables.set(key, value);
        }
      }
    }

    {
      const variables = this.environment.pipeline?.variables;
      if (!!variables) {
        for (const [key, value] of variables) {
          environment.variables.set(key, value);
        }
      }
    }

    this.form.patchValue({
      environment: toPlain(environment),
    });
  }

  save() {
    const [user, pipeline] = [
      new Environment({
        variables: new Map<string, Primitive>(),
      }),
      new Environment({
        variables: new Map<string, Primitive>(),
      }),
    ];
    const { environment } = plainToInstance(Project, this.form.getRawValue());
    for (const [, node] of this.project.pipeline.nodes) {
      if (!!node.environment) {
        for (const [key, { scope }] of node.environment) {
          if (!environment.variables.has(key)) {
            continue;
          }
          const value = environment.variables.get(key);
          switch (scope) {
            case "user":
              user.variables.set(key, value);
              break;
            case "pipeline":
              pipeline.variables.set(key, value);
              break;
          }
        }
      }
    }

    this.progress.saving = true;
    this.cd.detectChanges();
    this.http
      .put("me/environment", toPlain(user))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          assign(this.project, { environment: pipeline });
          this.projectManager.markDirty();
        },
        error: (err) => (this.error = err),
      });
  }
}
