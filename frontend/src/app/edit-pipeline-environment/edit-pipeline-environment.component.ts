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
import { NodeEnvironment } from "src/models/node";
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
  VariableSource,
  VariableType,
  variableType,
  visibleNames,
} from "src/utils/environment";
import { getDeclaredVariables } from "src/utils/pipeline";

/** What a Project Variable row shows besides its value. */
interface ProjectVariableMeta {
  /** Only `pipeline`-scoped Variables can be set or bound here. */
  readonly: boolean;
  description: string | null;
  /** Shown when the row has no value of its own and isn't bound. */
  inherited?: { source: VariableSource; value?: Primitive };
}

/** A Project Variable row; `bind` names the User Variable it is read from. */
function projectVariableGroup(
  fb: FormBuilder,
  options: VariableOptions<Omit<ProjectVariableMeta, "readonly">>,
  bind: string,
) {
  const readonly = !!options.readonly;
  const group = variableGroup<ProjectVariableMeta>(fb, {
    ...options,
    meta: { ...options.meta, readonly },
  });
  return new FormGroup(
    {
      ...group.controls,
      bind: fb.nonNullable.control({ value: bind, disabled: readonly }),
    },
    { validators: group.validator },
  );
}

type ProjectVariableGroup = ReturnType<typeof projectVariableGroup>;

/**
 * The Project Environment: one row per Variable the pipeline's Nodes declare.
 * A `pipeline`-scoped Variable gets its own value, is bound to a User
 * Variable, or is left empty to read the User Variable of the same name; the
 * other scopes only show where their value is read from (the lookup order of
 * the backend's `jobs/process-node/environment.ts`).
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

  variables = this.fb.array<ProjectVariableGroup>([]);
  form = this.fb.group({ variables: this.variables });

  typeLabel = (type: VariableType) => VARIABLE_TYPE_LABELS[type];

  private texts = {
    stored: $localize`:@@label.stored:Stored`,
    thisProject: $localize`:@@label.this_project:This project`,
    sources: {
      user: $localize`:@@label.source_user_environment:Your environment`,
      platform: $localize`:@@label.source_platform:Platform`,
      none: $localize`:@@label.not_set:Not set`,
    } satisfies Record<VariableSource, string>,
  };

  /** The Source select names the User Variable a row is bound to. */
  bindLabel = (name: string) => name || this.texts.thisProject;

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

  /**
   * The Source choices: the project itself (`""`), then the User Variables a
   * row can be bound to, keeping a bound name that is gone.
   */
  sources(bound: string): string[] {
    const names = [...(this.userEnvironment?.variables?.keys() ?? [])];
    if (bound && !names.includes(bound)) {
      names.push(bound);
    }
    return ["", ...names.sort()];
  }

  hasUserVariable(name: string) {
    return !!this.userEnvironment?.variables?.has(name);
  }

  private build() {
    this.variables.clear();
    const own = this.project.environment?.variables;
    const visible = new Set(this.project.environment?.visible ?? []);
    const bindings = this.project.environment?.bindings;
    for (const [key, declaration] of getDeclaredVariables(
      this.project.pipeline,
    )) {
      const editable = declaration.scope === "pipeline";
      const bound = (editable && bindings?.get(key)) || "";
      const inherited = this.inherited(key, declaration, own?.has(key));
      const group = projectVariableGroup(
        this.fb,
        {
          key,
          type: variableType(declaration.type),
          value: editable && !bound ? (own?.get(key) ?? null) : null,
          // a read-only row shows the secrecy of the User Variable it reads
          secret: editable
            ? !visible.has(key)
            : inherited?.value === HIDDEN_STRING,
          fixed: true,
          readonly: !editable,
          meta: {
            description: declaration.description
              ? (marked.parse(declaration.description) as string)
              : null,
            inherited,
          },
        },
        bound,
      );
      if (editable) {
        this.lockWhenBound(group);
      }
      this.variables.push(group);
    }
    this.cd.detectChanges();
  }

  /** A Bound Variable has no value of its own to edit. */
  private lockWhenBound(group: ProjectVariableGroup) {
    const { bind, value, secret } = group.controls;
    // unbinding before saving gives the row its own value back
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

  /** Where the value comes from when the Project doesn't set it. */
  private inherited(
    key: string,
    { scope }: NodeEnvironment,
    setByProject: boolean,
  ): ProjectVariableMeta["inherited"] {
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

  /** Where a read-only row's value is read from. */
  sourceLabel({ inherited }: ProjectVariableMeta) {
    return this.texts.sources[inherited?.source ?? "none"];
  }

  /** Only a string read from the User Environment can be a Secret Variable. */
  showsInheritedSecret({ inherited }: ProjectVariableMeta) {
    return inherited?.source === "user" && typeof inherited.value === "string";
  }

  /** A read-only row's inherited value, never a secret one. */
  inheritedValue({ inherited }: ProjectVariableMeta) {
    return !inherited || inherited.source === "none"
      ? ""
      : this.shown(inherited.value);
  }

  placeholder(
    meta: ProjectVariableMeta & VariableMeta,
    type: string,
    secret: boolean,
    bound: string,
  ) {
    if (bound) {
      return this.hasUserVariable(bound)
        ? this.shown(this.userEnvironment?.variables?.get(bound))
        : "";
    }
    const { inherited, readonly } = meta;
    if (inherited && inherited.source !== "none") {
      return this.shown(inherited.value);
    }
    return readonly ? "" : storedPlaceholder(meta, type, secret);
  }

  /** An inherited value, never a secret one. */
  private shown(value: Primitive | undefined) {
    return value === undefined || value === HIDDEN_STRING
      ? this.texts.stored
      : String(value);
  }

  save() {
    const variables = new Map<string, Primitive>();
    const bindings = new Map<string, string>();
    const rows = this.variables
      .getRawValue()
      .filter(({ meta }) => !meta.readonly);
    for (const { key, type, value, secret, meta, bind } of rows) {
      if (bind) {
        bindings.set(key, bind);
      } else if (value !== "") {
        variables.set(key, parseValue(type, value));
      } else if (meta.storedSecret && secret) {
        // the stored secret is kept: the project diff leaves it untouched
        variables.set(key, HIDDEN_STRING);
      }
      // a stored secret made visible without a new value is dropped
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

  /** Drops the project's own variables and bindings; the user environment is untouched. */
  clear() {
    this.apply(new Environment({ variables: new Map<string, Primitive>() }));
  }

  private apply(environment: Environment) {
    assign(this.project, { environment });
    this.projectManager.markDirty();
    this.build();
  }
}
