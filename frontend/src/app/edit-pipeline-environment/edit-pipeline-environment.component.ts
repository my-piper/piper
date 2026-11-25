import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder, FormGroup } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import * as marked from "marked";
import { HIDDEN_STRING } from "src/consts/core";
import { Environment } from "src/models/environment";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";
import {
  parseValue,
  storedPlaceholder,
  VARIABLE_TYPE_LABELS,
  variableGroup,
  VariableMeta,
  VariableOptions,
  VariableType,
  variableType,
  visibleNames,
} from "src/utils/environment";
import { getDeclaredVariables } from "src/utils/pipeline";

/** What a Project Variable row shows besides its value. */
interface ProjectVariableMeta {
  description: string | null;
}

/**
 * A Project Variable row; `bind` names the Global Variable it is read from,
 * or is empty when the project overrides it with its own value.
 */
function projectVariableGroup(
  fb: FormBuilder,
  options: VariableOptions<ProjectVariableMeta>,
  bind: string,
) {
  const group = variableGroup<ProjectVariableMeta>(fb, options);
  return new FormGroup(
    {
      ...group.controls,
      bind: fb.nonNullable.control(bind),
    },
    { validators: group.validator },
  );
}

type ProjectVariableGroup = ReturnType<typeof projectVariableGroup>;

/**
 * The Project Environment: one row per Variable the pipeline's Nodes declare.
 * Each row is a Bound Variable, read from the Global Variable of the same
 * name or of another name, or an Overridden Variable with the project's own
 * value (the lookup of the backend's `jobs/process-node/environment.ts`).
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
  global: Environment | null = null;

  variables = this.fb.array<ProjectVariableGroup>([]);
  form = this.fb.group({ variables: this.variables });

  typeLabel = (type: VariableType) => VARIABLE_TYPE_LABELS[type];

  private texts = {
    stored: $localize`:@@label.stored:Stored`,
    thisProject: $localize`:@@label.this_project:This project`,
  };

  /** The Source select names the Global Variable a row is bound to. */
  bindLabel = (name: string) => name || this.texts.thisProject;

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, environment }) => {
      this.project = project;
      this.global = environment ?? null;
      this.build();
    });
  }

  /**
   * The Source choices: the project itself (`""`), then the Global Variables
   * a row can be bound to, always with the row's own name and a bound name
   * that is gone.
   */
  sources(key: string, bound: string): string[] {
    const names = new Set(this.global?.variables?.keys() ?? []);
    names.add(key);
    if (bound) {
      names.add(bound);
    }
    return ["", ...[...names].sort()];
  }

  hasGlobalVariable(name: string) {
    return !!this.global?.variables?.has(name);
  }

  private build() {
    this.variables.clear();
    const own = this.project.environment?.variables;
    const visible = new Set(this.project.environment?.visible ?? []);
    const bindings = this.project.environment?.bindings;
    for (const [key, declaration] of getDeclaredVariables(
      this.project.pipeline,
    )) {
      const overridden = !!own?.has(key);
      const bound = overridden ? "" : (bindings?.get(key) ?? key);
      const group = projectVariableGroup(
        this.fb,
        {
          key,
          type: variableType(declaration.type),
          value: overridden ? (own.get(key) ?? null) : null,
          secret: !visible.has(key),
          fixed: true,
          meta: {
            description: declaration.description
              ? (marked.parse(declaration.description) as string)
              : null,
          },
        },
        bound,
      );
      this.lockWhenBound(group);
      this.variables.push(group);
    }
    this.cd.detectChanges();
  }

  /** A Bound Variable has no value of its own to edit. */
  private lockWhenBound(group: ProjectVariableGroup) {
    const { bind, value, secret } = group.controls;
    // overriding again before saving gives the row its own value back
    let own = value.value;
    const apply = (bound: string) => {
      if (bound) {
        if (value.enabled) {
          own = value.value;
        }
        value.setValue("");
        value.disable({ emitEvent: false });
        secret.disable({ emitEvent: false });
      } else {
        value.setValue(own);
        value.enable({ emitEvent: false });
        secret.enable({ emitEvent: false });
      }
    };
    apply(bind.value);
    bind.valueChanges.subscribe(apply);
  }

  placeholder(
    meta: ProjectVariableMeta & VariableMeta,
    type: string,
    secret: boolean,
    bound: string,
  ) {
    if (!bound) {
      return storedPlaceholder(meta, type, secret);
    }
    if (!this.hasGlobalVariable(bound)) {
      return "";
    }
    // a Global Secret Variable is never shown
    const value = this.global.variables.get(bound);
    return value === HIDDEN_STRING ? this.texts.stored : String(value);
  }

  save() {
    const variables = new Map<string, Primitive>();
    const bindings = new Map<string, string>();
    const rows = this.variables.getRawValue();
    for (const { key, type, value, secret, meta, bind } of rows) {
      if (bind) {
        // bound by name is the default and isn't stored
        if (bind !== key) {
          bindings.set(key, bind);
        }
      } else if (value !== "") {
        variables.set(key, parseValue(type, value));
      } else if (meta.storedSecret && secret) {
        // the stored secret is kept: the project diff leaves it untouched
        variables.set(key, HIDDEN_STRING);
      }
      // an empty override reads the Global Variable of the same name, and a
      // stored secret made visible without a new value is dropped
    }
    const visible = visibleNames(rows).filter((key) => variables.has(key));
    this.apply(
      new Environment({
        variables,
        visible,
        ...(bindings.size > 0 ? { bindings } : {}),
      }),
    );
  }

  /** Drops the project's overrides and bindings; the Global Environment is untouched. */
  clear() {
    this.apply(new Environment({ variables: new Map<string, Primitive>() }));
  }

  private apply(environment: Environment) {
    assign(this.project, { environment });
    this.projectManager.markDirty();
    this.build();
  }
}
