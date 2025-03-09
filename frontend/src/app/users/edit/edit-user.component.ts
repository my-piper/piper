import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { AppError } from "src/models/errors";
import { User, UserRole } from "src/models/user";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { sid } from "src/ui-kit/utils/string";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-edit-user",
  templateUrl: "./edit-user.component.html",
  styleUrls: ["./edit-user.component.scss"],
})
export class EditUserComponent implements OnInit {
  schemas = SCHEMAS;
  userRole = UserRole;

  private _user: User;

  progress = { saving: false };
  error!: AppError;

  set user(user: User) {
    this._user = user;
    if (!!user) {
      this.form.patchValue({ user });
    }
  }

  get user() {
    return this._user;
  }

  @Output()
  added = new EventEmitter<User>();

  @Output()
  saved = new EventEmitter<User>();

  form = this.fb.group({
    user: this.fb.control<Partial<User>>({}),
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe(({ user }) => (this.user = user));
  }

  generatePassword() {
    const { user } = this.form.getRawValue();
    if (!!this.user || !!user.password) {
      return;
    }

    this.form.patchValue({ user: { ...user, password: sid() } });
  }

  save() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.saving = true;
    this.cd.detectChanges();

    (() => {
      if (!this.user) {
        const { user } = this.form.getRawValue();
        return this.http.post("users", user);
      } else {
        const { user } = this.form.getRawValue();
        return this.http.patch(`users/${this.user._id}`, user);
      }
    })()
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, User))
      )
      .subscribe({
        next: (user) => {
          if (!!this.user) {
            this.saved.emit(user);
          } else {
            this.added.emit(user);
          }
        },
        error: (err) => (this.error = err),
      });
  }
}
