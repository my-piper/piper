import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { ENV_MODE } from "src/consts/env";
import { AppConfig } from "src/models/app-config";
import { Authorization } from "src/models/authorisation";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";
import { SignupRequest } from "./models";

@Component({
  selector: "app-signup",
  templateUrl: "./signup.component.html",
  styleUrls: ["./signup.component.scss"],
})
export class SigupComponent implements OnInit {
  progress = { signup: false };
  error!: AppError;

  @Output()
  logged = new EventEmitter();

  emailControl = this.fb.control<string | null>(null, [
    Validators.required,
    Validators.email,
  ]);
  loginControl = this.fb.control<string | null>(null, [Validators.required]);
  sendPasswordControl = this.fb.control<boolean>(true);
  passwordControl = this.fb.control<string | null>(null, []);
  form = this.fb.group({
    email: this.emailControl,
    login: this.loginControl,
    sendPassword: this.sendPasswordControl,
    password: this.passwordControl,
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
          email: "test@test.com",
          password: "",
        },
        { emitEvent: false }
      );
    }

    this.emailControl.valueChanges.subscribe((email) => {
      if (!!email) {
        const [login] = email.split("@");
        if (!!login) {
          this.loginControl.setValue(login);
        }
      }
    });

    this.sendPasswordControl.valueChanges.subscribe((send) => {
      this.passwordControl.setValidators(send ? [] : [Validators.required]);
      this.passwordControl.updateValueAndValidity();
    });
  }

  login() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.signup = true;
    this.cd.detectChanges();

    const request = new SignupRequest(this.form.getRawValue());
    this.http
      .post("signup", toPlain(request))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.signup = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Authorization, json as Object))
      )
      .subscribe({
        next: (authorization) => {
          this.config.authorization = authorization;
          this.router.navigate(["/play"]);
        },
        error: (err) => (this.error = err),
      });
  }
}
