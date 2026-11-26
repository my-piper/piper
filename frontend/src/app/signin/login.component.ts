import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { ENV_MODE } from "src/consts/env";
import { AppConfig } from "src/models/app-config";
import { Authorization } from "src/models/authorisation";
import { AppError } from "src/models/errors";
import { UserCredentials } from "src/models/user-credentials";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { ssoErrorMessage } from "src/consts/sso";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LoginComponent implements OnInit {
  progress = { login: false };
  error!: AppError;

  @Output()
  logged = new EventEmitter();

  identityControl = this.fb.control<string | null>(null, [Validators.required]);
  form = this.fb.group({
    identity: this.identityControl,
    password: this.fb.control<string | null>(null, [Validators.required]),
  });

  constructor(
    public config: AppConfig,
    private fb: FormBuilder,
    private http: HttpService,
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  get ssoLabel(): string {
    return this.config.ui?.oidcLabel || "SSO";
  }

  ngOnInit() {
    // Single sign-on failures come back as `?error=<code>`.
    const code = this.route.snapshot.queryParamMap.get("error");
    if (code?.startsWith("sso_")) {
      this.error = new AppError(ssoErrorMessage(code, this.ssoLabel));
    }

    if (ENV_MODE == "development") {
      this.form.patchValue(
        {
          identity: "admin",
          password: "",
        },
        { emitEvent: false },
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
        map((json) => toInstance(json as object, Authorization)),
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
