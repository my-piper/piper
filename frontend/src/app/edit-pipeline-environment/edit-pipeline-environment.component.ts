import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { delay, finalize } from "rxjs";
import { Environment } from "src/models/environment";
import { EnvironmentScope } from "src/models/node";
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
  inheritedKeys: string[] = [];
  error!: AppError;

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
    private cd: ChangeDetectorRef,
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

  /** Scope of each variable declared by the pipeline's nodes. */
  private collectScopes(): Map<string, EnvironmentScope> {
    const scopes = new Map<string, EnvironmentScope>();
    for (const [, node] of this.project.pipeline.nodes) {
      for (const [key, { scope }] of node.environment || []) {
        scopes.set(key, scope);
      }
    }
    return scopes;
  }

  private build() {
    const scopes = this.collectScopes();
    const environment = new Environment({
      variables: new Map<string, Primitive>(),
    });

    // project variables come from the project only: a user value shown here
    // would be frozen into the project on save
    for (const [key, value] of this.environment.user?.variables || []) {
      if (scopes.get(key) !== "pipeline") {
        environment.variables.set(key, value);
      }
    }
    for (const [key, value] of this.environment.pipeline?.variables || []) {
      environment.variables.set(key, value);
    }

    this.inheritedKeys = [...scopes]
      .filter(
        ([key, scope]) =>
          scope === "pipeline" &&
          !this.environment.pipeline?.variables?.has(key) &&
          this.environment.user?.variables?.has(key),
      )
      .map(([key]) => key);

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
    for (const [key, scope] of this.collectScopes()) {
      const value = environment.variables.get(key);
      // empty means "use the inherited value"
      if (value === undefined || value === null || value === "") {
        continue;
      }
      // the editor fills inherited booleans and numbers with its defaults;
      // keep inheriting instead of freezing them into the project
      if (
        this.inheritedKeys.includes(key) &&
        (value === false || value === 0)
      ) {
        continue;
      }
      switch (scope) {
        case "global":
        case "user":
          user.variables.set(key, value);
          break;
        case "pipeline":
          pipeline.variables.set(key, value);
          break;
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
        }),
      )
      .subscribe({
        next: () => this.applyProjectEnvironment(pipeline),
        error: (err) => (this.error = err),
      });
  }

  /** Drops the project's own variables; the user environment is untouched. */
  clear() {
    this.applyProjectEnvironment(
      new Environment({ variables: new Map<string, Primitive>() }),
    );
  }

  private applyProjectEnvironment(pipeline: Environment) {
    assign(this.project, { environment: pipeline });
    this.environment.pipeline = pipeline;
    this.projectManager.markDirty();
    this.build();
    this.cd.detectChanges();
  }
}
