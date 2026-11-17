import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import {
  concat,
  delay,
  finalize,
  last,
  map,
  Observable,
  of,
  switchMap,
  tap,
} from "rxjs";
import { Environment } from "src/models/environment";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/consts/ui";
import {
  parseValue,
  uniqueNames,
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

  variables = this.fb.array<VariableGroup>([], { validators: uniqueNames });
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
          meta: { stored: true, storedName: key },
        }),
      );
    }
    this.cd.detectChanges();
  }

  add() {
    this.variables.push(variableGroup(this.fb));
  }

  remove(index: number) {
    const { meta } = this.variables.at(index).getRawValue();
    // an unsaved rename doesn't move the stored value
    const key = meta.storedName;
    if (!key) {
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
            (control) => control.getRawValue().meta.storedName === key,
          );
          if (current >= 0) {
            this.variables.removeAt(current);
          }
        },
        error: (err) => (this.error = err),
      });
  }

  /** Once it lands, the row's value is stored under the new name. */
  private rename(index: number, from: string, to: string) {
    return this.http
      .post(`me/environment/${encodeURIComponent(from)}/rename`, { name: to })
      .pipe(
        tap(() => {
          const { meta } = this.variables.at(index).controls;
          meta.setValue({ ...meta.value, storedName: to });
        }),
      );
  }

  save() {
    const environment = new Environment({
      variables: new Map<string, Primitive>(),
    });
    const renames: Observable<unknown>[] = [];
    for (const [i, { key, type, value, meta }] of this.variables
      .getRawValue()
      .entries()) {
      if (meta.storedName && meta.storedName !== key) {
        renames.push(this.rename(i, meta.storedName, key));
      }
      // empty keeps the stored value, whatever the type
      if (value === "") {
        continue;
      }
      environment.variables.set(key, parseValue(type, value));
    }

    this.progress.saving = true;
    this.cd.detectChanges();
    // renames run one by one before the values land under the new names
    concat(...renames, of(null))
      .pipe(
        last(),
        switchMap(() => this.http.put("me/environment", toPlain(environment))),
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
