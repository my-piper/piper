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
import { UserRole } from "src/models/user";
import { MeManager } from "src/services/me.service";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/consts/ui";
import {
  parseValue,
  storedPlaceholder,
  uniqueNames,
  VARIABLE_TYPE_LABELS,
  VARIABLE_TYPES,
  VariableGroup,
  variableGroup,
  VariableType,
  variableType,
  visibleNames,
} from "src/utils/environment";
import { toPlain } from "src/utils/models";

/** A Global Variable row: the name its value is stored under, once saved. */
interface GlobalVariableMeta {
  storedName?: string;
}

/**
 * The Global Environment: a free list of Variables shared by every Project.
 * Everyone signed in sees it; only admins add, rename and remove rows.
 */
@Component({
  selector: "app-environment",
  templateUrl: "./environment.component.html",
  styleUrls: ["./environment.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EnvironmentComponent implements OnInit {
  progress: { saving: boolean; removing: { [key: string]: boolean } } = {
    saving: false,
    removing: {},
  };
  error!: AppError;
  /** Only admins can change the Global Environment; others only read it. */
  admin = false;

  variables = this.fb.array<VariableGroup<GlobalVariableMeta>>([], {
    validators: uniqueNames,
  });

  form = this.fb.group({ variables: this.variables });

  types = VARIABLE_TYPES;
  typeLabel = (type: VariableType) => VARIABLE_TYPE_LABELS[type];

  private texts = {
    stored: $localize`:@@label.stored:Stored`,
  };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private me: MeManager,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ environment }) => this.build(environment));
    this.me.user$.subscribe((user) => {
      this.admin = !!user?.roles?.includes(UserRole.admin);
      this.lock();
      this.cd.detectChanges();
    });
  }

  /** A user who isn't an admin can't change any input. */
  private lock() {
    if (this.admin) {
      this.form.enable({ emitEvent: false });
    } else {
      this.form.disable({ emitEvent: false });
    }
  }

  /** What a read-only value cell shows: a secret only as stored. */
  shown(variable: VariableGroup<GlobalVariableMeta>) {
    const { value, meta } = variable.getRawValue();
    return meta.storedSecret ? this.texts.stored : value;
  }

  private build(environment: Environment | null) {
    this.variables.clear();
    const visible = new Set(environment?.visible ?? []);
    for (const [key, value] of environment?.variables || []) {
      this.variables.push(
        variableGroup<GlobalVariableMeta>(this.fb, {
          key,
          type: variableType(typeof value),
          value,
          secret: !visible.has(key),
          meta: { stored: true, storedName: key },
        }),
      );
    }
    this.lock();
    this.cd.detectChanges();
  }

  add() {
    this.variables.push(variableGroup<GlobalVariableMeta>(this.fb));
  }

  placeholder = storedPlaceholder;

  /** The name the row is busy under while it is being removed. */
  busy(variable: VariableGroup<GlobalVariableMeta>) {
    const { meta, key } = variable.getRawValue();
    return !!this.progress.removing[meta.storedName ?? key ?? ""];
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
      .delete(`environment/${encodeURIComponent(key)}`)
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
      .post(`environment/${encodeURIComponent(from)}/rename`, { name: to })
      .pipe(
        tap(() => {
          const { meta } = this.variables.at(index).controls;
          meta.setValue({ ...meta.value, storedName: to });
        }),
      );
  }

  save() {
    const rows = this.variables.getRawValue();
    const environment = new Environment({
      variables: new Map<string, Primitive>(),
      visible: visibleNames(rows),
    });
    const renames: Observable<unknown>[] = [];
    for (const [i, { key, type, value, meta }] of rows.entries()) {
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
        switchMap(() => this.http.put("environment", toPlain(environment))),
        delay(UI_DELAY),
        switchMap(() => this.http.get("environment")),
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
