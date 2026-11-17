import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import * as marked from "marked";
import { HIDDEN_STRING } from "src/consts/core";
import { Environment } from "src/models/environment";
import { NodeEnvironment } from "src/models/node";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";
import {
  parseValue,
  VariableGroup,
  variableGroup,
  VariableMeta,
  variableType,
} from "src/utils/environment";
import { getDeclaredVariables } from "src/utils/pipeline";

/**
 * The Project Environment: one row per Variable the pipeline's Nodes declare.
 * Only `pipeline`-scoped Variables can be set here; the others show where
 * their value is read from (the lookup order of the backend's
 * `jobs/process-node/environment.ts`).
 */
@Component({
  selector: "app-edit-pipeline-environment",
  templateUrl: "./edit-pipeline-environment.component.html",
  styleUrls: ["./edit-pipeline-environment.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditPipelineEnvironmentComponent implements OnInit {
  project!: Project;
  userEnvironment: Environment | null = null;
  platform = new Set<string>();

  variables = this.fb.array<VariableGroup>([]);
  form = this.fb.group({ variables: this.variables });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, environment, platform }) => {
      this.project = project;
      this.userEnvironment = environment;
      this.platform = new Set(platform || []);
      this.build();
    });
  }

  private build() {
    this.variables.clear();
    const own = this.project.environment?.variables;
    for (const [key, declaration] of getDeclaredVariables(
      this.project.pipeline,
    )) {
      const editable = declaration.scope === "pipeline";
      this.variables.push(
        variableGroup(this.fb, {
          key,
          type: variableType(declaration.type),
          value: editable ? (own?.get(key) ?? null) : null,
          meta: {
            fixed: true,
            readonly: !editable,
            description: declaration.description
              ? (marked.parse(declaration.description) as string)
              : null,
            inherited: this.inherited(key, declaration, own?.has(key)),
          },
        }),
      );
    }
    this.cd.detectChanges();
  }

  /** Where the value comes from when the Project doesn't set it. */
  private inherited(
    key: string,
    { scope }: NodeEnvironment,
    setByProject: boolean,
  ): VariableMeta["inherited"] {
    const user = this.userEnvironment?.variables;
    if (user?.has(key)) {
      return scope === "pipeline" && setByProject
        ? undefined
        : { source: "user", value: user.get(key) };
    }
    switch (scope) {
      case "global":
        return this.platform.has(key)
          ? { source: "platform" }
          : { source: "none" };
      default:
        return { source: "none" };
    }
  }

  save() {
    const variables = new Map<string, Primitive>();
    for (const { key, type, value, meta } of this.variables.getRawValue()) {
      if (meta.readonly) {
        continue;
      }
      if (value !== "") {
        variables.set(key, parseValue(type, value));
      } else if (meta.stored) {
        // the stored secret is kept: the project diff leaves it untouched
        variables.set(key, HIDDEN_STRING);
      }
    }
    this.apply(new Environment({ variables }));
  }

  /** Drops the project's own variables; the user environment is untouched. */
  clear() {
    this.apply(new Environment({ variables: new Map<string, Primitive>() }));
  }

  private apply(environment: Environment) {
    assign(this.project, { environment });
    this.projectManager.markDirty();
    this.build();
  }
}
