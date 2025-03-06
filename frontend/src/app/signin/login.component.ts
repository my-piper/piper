import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { ENV_MODE } from "src/consts/env";
import { AppConfig } from "src/models/app-config";
import { Authorization } from "src/models/authorisation";
import { AppError } from "src/models/errors";
import { UserCredentials } from "src/models/user-credentials";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.scss"],
})
export class LoginComponent implements OnInit {
  progress = { login: false };
  error!: AppError;

  @Output()
  logged = new EventEmitter();

  idControl = this.fb.control<string | null>(null, [Validators.required]);
  form = this.fb.group({
    _id: this.idControl,
    password: this.fb.control<string | null>(null, [Validators.required]),
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private config: AppConfig,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    if (ENV_MODE == "development") {
      this.form.patchValue(
        {
          _id: "admin",
          password: "",
        },
        { emitEvent: false }
      );
    }
  }

  login() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.login = true;
    this.cd.detectChanges();

    const request = new UserCredentials(this.form.getRawValue());
    this.http
      .post("login", toPlain(request))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.login = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, Authorization))
      )
      .subscribe({
        next: (authorization) => {
          this.config.authorization = authorization;
          this.router.navigate(["/projects"]);
        },
        error: (err) => (this.error = err),
      });
  }
}
