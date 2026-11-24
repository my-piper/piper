import { Component, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { HIDDEN_STRING, V1_HIDDEN_STRING } from "src/consts/core";
import { Project } from "src/models/project";
import { Ajv } from "src/providers/ajv";
import SCHEMAS from "src/schemas/compiled.json";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";
import { renameV1Variables, v1VariableName } from "src/utils/v1-variables";
import * as YAML from "yaml";

@Component({
  selector: "app-edit-pipeline-yaml",
  templateUrl: "./edit-pipeline-yaml.component.html",
  styleUrls: ["./edit-pipeline-yaml.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditPipelineYamlComponent implements OnInit {
  project!: Project;
  error: Error | null = null;

  form = this.fb.group({
    pipeline: this.fb.control<string | null>(null, [Validators.required]),
    launchRequest: this.fb.control<string | null>(null, [Validators.required]),
    environment: this.fb.control<string | null>(null, [Validators.required]),
  });

  constructor(
    private projectManager: ProjectManager,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private ajv: Ajv,
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
      { emitEvent: false },
    );
  }

  save() {
    // Parse and validate everything before touching the project, so an
    // invalid edit never partially replaces the current graph.
    let plain: { pipeline: object; launchRequest: object; environment: object };
    try {
      const { pipeline, launchRequest, environment } = this.form.getRawValue();
      plain = {
        pipeline: YAML.parse(<string>pipeline),
        launchRequest: JSON.parse(<string>launchRequest),
        environment: JSON.parse(<string>environment),
      };
    } catch (e) {
      this.error = e as Error;
      return;
    }

    const validate = this.ajv.compile(SCHEMAS.pipeline);
    if (!validate(plain.pipeline)) {
      const details = (validate.errors || []).map((e) =>
        [e.instancePath || "/", e.message].join(" "),
      );
      this.error = new Error(
        [
          $localize`:@@message.pipeline_schema_invalid:Pipeline schema invalid`,
          ...details,
        ].join("\n"),
      );
      return;
    }

    this.error = null;
    renameV1Variables(plain.environment);
    this.resolveSecretPlaceholders(plain.environment);
    const { pipeline, launchRequest, environment } = plainToInstance(
      Project,
      plain,
    );

    assign(this.project, {
      title: pipeline.name,
      pipeline,
      launchRequest,
      environment,
    });
    this.projectManager.markDirty();
  }

  /**
   * A placeholder in place of a Secret Variable's value, the current one or
   * Piper v1's from a pasted v1 Environment, keeps the stored secret; under a
   * name with no stored secret it is no value. The server applies the same
   * rule, so the project stays as it will be saved.
   */
  private resolveSecretPlaceholders(environment: {
    variables?: Record<string, unknown>;
  }) {
    const variables = environment?.variables ?? {};
    const stored = this.project.environment?.variables;
    for (const [name, value] of Object.entries(variables)) {
      if (value !== HIDDEN_STRING && value !== V1_HIDDEN_STRING) {
        continue;
      }
      // the server renames a stored Variable that still has its v1 name
      const secret =
        stored?.get(name) ?? stored?.get(v1VariableName(name) ?? name);
      if (secret === HIDDEN_STRING) {
        variables[name] = HIDDEN_STRING;
      } else {
        delete variables[name];
      }
    }
  }
}
