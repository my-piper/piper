import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map, switchMap } from "rxjs";
import { Environment } from "src/models/environment";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/consts/ui";
import {
  parseValue,
  VariableGroup,
  variableGroup,
  variableType,
} from "src/utils/environment";
import { toPlain } from "src/utils/models";

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

  variables = this.fb.array<VariableGroup>([]);
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

  private build(environment: Environment | null) {
    this.variables.clear();
    for (const [key, value] of environment?.variables || []) {
      this.variables.push(
        variableGroup(this.fb, {
          key,
          type: variableType(typeof value),
          value,
          meta: { stored: true },
        }),
      );
    }
    this.cd.detectChanges();
  }

  add() {
    this.variables.push(variableGroup(this.fb));
  }

  remove(index: number) {
    const {
      key,
      meta: { stored },
    } = this.variables.at(index).getRawValue();
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
      environment.variables.set(key, parseValue(type, value));
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
