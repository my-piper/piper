import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { HIDDEN_STRING } from "src/consts/core";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map, switchMap } from "rxjs";
import { Environment } from "src/models/environment";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";

type VariableType = "string" | "number" | "boolean";

/** A value must parse as its type; empty is always allowed (keep / unset). */
function valueMatchesType(group: AbstractControl): ValidationErrors | null {
  const { type, value } = group.value as { type: VariableType; value: string };
  if (value === "") {
    return null;
  }
  switch (type) {
    case "number":
      return Number.isFinite(Number(value)) ? null : { valueType: true };
    case "boolean":
      return value === "true" || value === "false" ? null : { valueType: true };
    default:
      return null;
  }
}

/**
 * The user environment: variables shared by all of the user's projects.
 */
@Component({
  selector: "app-me-environment",
  templateUrl: "./me-environment.component.html",
  styleUrls: ["./me-environment.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class MeEnvironmentComponent implements OnInit {
  progress: { saving: boolean; removing: { [key: string]: boolean } } = {
    saving: false,
    removing: {},
  };
  error!: AppError;
  storedPlaceholder = $localize`:@@message.stored_value_leave_empty:Stored, leave empty to keep`;

  variables = this.fb.array<ReturnType<typeof this.variableGroup>>([]);
  form = this.fb.group({ variables: this.variables });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ environment }) => this.build(environment));
  }

  private variableGroup({
    key = "",
    type = "string" as VariableType,
    value = "",
    stored = false,
  } = {}) {
    return this.fb.group(
      {
        key: this.fb.control(key, [
          Validators.required,
          Validators.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
        ]),
        type: this.fb.control<VariableType>(type),
        value: this.fb.control(value),
        stored: this.fb.control(stored),
      },
      { validators: valueMatchesType },
    );
  }

  private build(environment: Environment | null) {
    this.variables.clear();
    for (const [key, value] of environment?.variables || []) {
      const type = typeof value as VariableType;
      this.variables.push(
        this.variableGroup({
          key,
          type,
          // stored strings are never sent back: leave empty to keep them
          value: value === HIDDEN_STRING ? "" : String(value),
          stored: true,
        }),
      );
    }
    this.cd.detectChanges();
  }

  add() {
    this.variables.push(this.variableGroup());
  }

  remove(index: number) {
    const { key, stored } = this.variables.at(index).getRawValue();
    if (!stored) {
      this.variables.removeAt(index);
      return;
    }

    this.progress.removing[key] = true;
    this.cd.detectChanges();
    this.http
      .delete(`me/environment/${encodeURIComponent(key)}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          delete this.progress.removing[key];
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          const current = this.variables.controls.findIndex(
            (control) => control.getRawValue().key === key,
          );
          if (current >= 0) {
            this.variables.removeAt(current);
          }
        },
        error: (err) => (this.error = err),
      });
  }

  save() {
    const environment = new Environment({
      variables: new Map<string, Primitive>(),
    });
    for (const { key, type, value } of this.variables.getRawValue()) {
      // empty keeps the stored value, whatever the type
      if (value === "") {
        continue;
      }
      environment.variables.set(key, parse(type, value));
    }

    this.progress.saving = true;
    this.cd.detectChanges();
    this.http
      .put("me/environment", toPlain(environment))
      .pipe(
        delay(UI_DELAY),
        switchMap(() => this.http.get("me/environment")),
        map((plain) => plainToInstance(Environment, plain as object)),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (environment) => this.build(environment),
        error: (err) => (this.error = err),
      });
  }
}

function parse(type: VariableType, value: string): Primitive {
  switch (type) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true";
    default:
      return value;
  }
}
