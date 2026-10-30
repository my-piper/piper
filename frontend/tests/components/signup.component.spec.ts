import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { By } from "@angular/platform-browser";
import { provideRouter, Router, RouterLink } from "@angular/router";
import { SigupComponent } from "src/app/signup/signup.component";
import { AUTHORIZATION_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { InformerComponent } from "src/ui-kit/informer/informer.component";
import { IncludesPipe } from "src/ui-kit/pipes/includes.pipe";
import { InvalidFieldPipe } from "src/ui-kit/pipes/invalid-field.pipe";
import { PopoverDirective } from "src/ui-kit/popover/popover.directive";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { GetUrlPipe } from "src/ui-kit/select-language/get-url-by-lang.pipe";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { SelectLanguageComponent } from "src/ui-kit/select-language/select-language.component";
import { authorizationPlain } from "../fixtures/plain";
import { PlainAppConfig, RUNTIME_VARIANTS } from "../fixtures/runtime-config";
import { HcaptchaStubComponent } from "../helpers/captcha-stub";
import { provideTestConfig } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";

/**
 * Wire contracts (backend/api/users/signup.ts):
 * - POST /api/signup/confirm `{ email, captcha }` → text; mails a code.
 * - POST /api/signup `{ email, login, password, code }` → Authorization.
 * - Failures are DataError → HTTP 400 with a text body.
 */
const CONFIRM_URL = "/api/signup/confirm";
const SIGNUP_URL = "/api/signup";

async function render(config: Partial<PlainAppConfig> = {}) {
  await TestBed.configureTestingModule({
    // UiKitModule is not imported: under JIT its TickerPipe (a pipe extending
    // the @Directive UntilDestroyed base) fails with "has no selector".
    declarations: [
      SigupComponent,
      IconComponent,
      InformerComponent,
      PopoverDirective,
      SelectLanguageComponent,
      SelectThemeComponent,
      InvalidFieldPipe,
      IncludesPipe,
      GetUrlPipe,
    ],
    imports: [ReactiveFormsModule, RouterLink, HcaptchaStubComponent],
    providers: [
      provideTestConfig(config),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SigupComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const router = TestBed.inject(Router);

  const input = (id: string) =>
    element.querySelector(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string) => {
    input(id).value = value;
    input(id).dispatchEvent(new Event("input"));
    fixture.detectChanges();
  };
  const submit = (form: HTMLFormElement) => {
    form.dispatchEvent(new Event("submit"));
    fixture.detectChanges();
  };

  return {
    fixture,
    element,
    controller: TestBed.inject(HttpTestingController),
    router,
    navigate: spyOn(router, "navigate").and.resolveTo(true),
    config: TestBed.inject(AppConfig),
    captcha: fixture.debugElement.query(By.directive(HcaptchaStubComponent))
      .componentInstance as HcaptchaStubComponent,
    input,
    type,
    signupForm: () =>
      element.querySelector("form:not(.confirmation)") as HTMLFormElement,
    confirmationForm: () =>
      element.querySelector("form.confirmation") as HTMLFormElement,
    submit,
    // The error informer is the one with the default (message) template.
    informerText: () =>
      element.querySelector("app-informer > p")?.textContent.trim(),
  };
}

type Rendered = Awaited<ReturnType<typeof render>>;

/** Fills the first step and answers the confirmation request successfully. */
function passConfirmation(page: Rendered, email = "new.user@example.com") {
  page.type("email", email);
  page.captcha.solve("captcha-token");
  page.submit(page.signupForm());
  page.controller.expectOne(CONFIRM_URL).flush("");
  tick(UI_DELAY);
  page.fixture.detectChanges();
}

describe("SigupComponent", () => {
  describe("first step", () => {
    it("derives a login of at most 14 characters from the email", fakeAsync(async () => {
      const { type, input } = await render();

      type("email", "a.very.long.local.part@example.com");

      expect(input("login").value).toBe("a.very.long.lo");
    }));

    it("keeps a login the user typed after the email", fakeAsync(async () => {
      const { type, input } = await render();

      type("email", "mary@example.com");
      type("login", "mary_k");

      expect(input("login").value).toBe("mary_k");
    }));

    it("does not request a code for an invalid email and marks it", fakeAsync(async () => {
      const { type, input, submit, signupForm, controller } = await render();
      type("email", "not-an-email");

      submit(signupForm());

      expect(input("email").classList).toContain("error");
      controller.verify();
    }));

    it("sends the email with the captcha token and asks for the code", fakeAsync(async () => {
      const page = await render(RUNTIME_VARIANTS.captchaOn());
      page.type("email", "new.user@example.com");
      page.captcha.solve("captcha-token");

      page.submit(page.signupForm());
      const request = page.controller.expectOne(CONFIRM_URL);
      const button = page.signupForm().querySelector("button[type=submit]");
      const busy = (button as HTMLButtonElement).disabled;
      request.flush("");
      tick(UI_DELAY);
      page.fixture.detectChanges();

      expect(request.request.method).toBe("POST");
      expect(request.request.body).toEqual({
        email: "new.user@example.com",
        captcha: "captcha-token",
      });
      expect(request.request.responseType).toBe("text");
      expect(busy).toBeTrue();
      expect((button as HTMLButtonElement).disabled).toBeFalse();
      expect(page.captcha.siteKey).toBe("10000000-ffff-ffff-ffff-000000000001");
      expect(page.confirmationForm()).not.toBeNull();
      page.controller.verify();
    }));

    it("shows a confirmation failure and stays on the first step", fakeAsync(async () => {
      expectConsoleError("Process HTTP error 400");
      const page = await render();
      page.type("email", "new.user@example.com");

      page.submit(page.signupForm());
      page.controller
        .expectOne(CONFIRM_URL)
        .flush("Wrong captcha", { status: 400, statusText: "Bad Request" });
      tick(UI_DELAY);
      page.fixture.detectChanges();

      expect(page.informerText()).toBe("Wrong captcha");
      expect(page.confirmationForm()).toBeNull();
      page.controller.verify();
    }));

    it("dismisses the error informer", fakeAsync(async () => {
      expectConsoleError("Process HTTP error 400");
      const page = await render();
      page.type("email", "new.user@example.com");
      page.submit(page.signupForm());
      page.controller
        .expectOne(CONFIRM_URL)
        .flush("Wrong captcha", { status: 400, statusText: "Bad Request" });
      tick(UI_DELAY);
      page.fixture.detectChanges();

      (
        page.element.querySelector("app-informer button") as HTMLElement
      ).click();
      page.fixture.detectChanges();

      expect(page.element.querySelector("app-informer")).toBeNull();
    }));
  });

  describe("registration", () => {
    it("registers with the code, stores the authorization and opens the playground", fakeAsync(async () => {
      const page = await render();
      passConfirmation(page);
      page.type("password", "secret");
      page.type("code", "123456");

      page.submit(page.confirmationForm());
      const request = page.controller.expectOne(SIGNUP_URL);
      request.flush(authorizationPlain("owner"));
      tick(UI_DELAY);

      expect(request.request.method).toBe("POST");
      expect(request.request.body).toEqual({
        email: "new.user@example.com",
        login: "new.user",
        password: "secret",
        code: "123456",
      });
      expect(page.config.authorization.token).toBe("fake-token-owner");
      expect(JSON.parse(localStorage.getItem(AUTHORIZATION_KEY)).token).toBe(
        "fake-token-owner",
      );
      expect(page.navigate).toHaveBeenCalledOnceWith(["/play"]);
      page.controller.verify();
    }));

    it("keeps the user signed out when the code is wrong", fakeAsync(async () => {
      expectConsoleError("Process HTTP error 400");
      const page = await render();
      passConfirmation(page);
      page.type("password", "secret");
      page.type("code", "000000");

      page.submit(page.confirmationForm());
      page.controller.expectOne(SIGNUP_URL).flush("Wrong confirmation code", {
        status: 400,
        statusText: "Bad Request",
      });
      tick(UI_DELAY);
      page.fixture.detectChanges();

      expect(page.informerText()).toBe("Wrong confirmation code");
      expect(page.config.authorization).toBeNull();
      expect(localStorage.getItem(AUTHORIZATION_KEY)).toBeNull();
      expect(page.navigate).not.toHaveBeenCalled();
      expect(
        page.confirmationForm().querySelector("button[type=submit]"),
      ).not.toHaveClass("busy");
      page.controller.verify();
    }));
  });

  describe("links", () => {
    it("links to sign-in and both OAuth providers", fakeAsync(async () => {
      const { element } = await render();

      expect(element.querySelector("a[href='/login']")).not.toBeNull();
      expect(element.querySelector("a[href='/oauth/google']")).not.toBeNull();
      expect(element.querySelector("a[href='/oauth/yandex']")).not.toBeNull();
    }));
  });
});
