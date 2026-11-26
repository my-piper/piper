import { provideHttpClient, withXhr } from "@angular/common/http";
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
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { IncludesPipe } from "src/pipes/includes.pipe";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { PopoverDirective } from "src/ui-kit/popover/popover.directive";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { ErrorDialogComponent } from "src/app/error-dialog/error-dialog.component";
import { NgTemplateOutlet } from "@angular/common";
import { provideTaiga, TuiDialog, TuiDropdown } from "@taiga-ui/core";
import { authorizationPlain } from "../fixtures/plain";
import { PlainAppConfig, RUNTIME_VARIANTS } from "../fixtures/runtime-config";
import { HcaptchaStubComponent } from "../helpers/captcha-stub";
import { provideTestConfig } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import { isLoading, markedInvalid, popupRoot } from "../helpers/taiga";

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
    declarations: [
      SigupComponent,
      PopoverDirective,
      SelectThemeComponent,
      IncludesPipe,
    ],
    imports: [
      ReactiveFormsModule,
      RouterLink,
      TaigaFormsModule,
      HcaptchaStubComponent,
      ErrorDialogComponent,
      ...TuiDropdown,
      TuiDialog,
      NgTemplateOutlet,
    ],
    providers: [
      provideTaiga(),
      provideTestConfig(config),
      provideRouter([]),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SigupComponent);
  fixture.detectChanges();
  const root = popupRoot();
  const element = fixture.nativeElement as HTMLElement;
  // the confirmation step and errors render in dialogs, in the root's portal
  const detect = () => {
    fixture.detectChanges();
    root.detectChanges();
  };
  const router = TestBed.inject(Router);

  const input = (id: string) =>
    (element.querySelector(`#${id}`) ??
      document.querySelector(`tui-dialog #${id}`)) as HTMLInputElement;
  const type = (id: string, value: string) => {
    input(id).value = value;
    input(id).dispatchEvent(new Event("input"));
    detect();
  };
  const submit = (form: HTMLFormElement) => {
    form.dispatchEvent(new Event("submit"));
    detect();
  };

  return {
    fixture,
    detect,
    element,
    controller: TestBed.inject(HttpTestingController),
    router,
    navigate: vi.spyOn(router, "navigate").mockResolvedValue(true),
    config: TestBed.inject(AppConfig),
    captcha: fixture.debugElement.query(By.directive(HcaptchaStubComponent))
      .componentInstance as HcaptchaStubComponent,
    input,
    type,
    signupForm: () =>
      element.querySelector("form:not(.confirmation)") as HTMLFormElement,
    confirmationForm: () =>
      document.querySelector("tui-dialog form.confirmation") as HTMLFormElement,
    submit,
    errorText: () =>
      document.querySelector("tui-dialog [role=alert] p")?.textContent.trim(),
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
  page.detect();
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

      expect(markedInvalid(input("email"))).toBe(true);
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
      const loading = isLoading(button);
      request.flush("");
      tick(UI_DELAY);
      page.detect();

      expect(request.request.method).toBe("POST");
      expect(request.request.body).toEqual({
        email: "new.user@example.com",
        captcha: "captcha-token",
      });
      expect(request.request.responseType).toBe("text");
      expect(busy).toBe(true);
      expect(loading).toBe(true);
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(isLoading(button)).toBe(false);
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
      page.detect();

      expect(page.errorText()).toBe("Wrong captcha");
      expect(page.confirmationForm()).toBeNull();
      page.controller.verify();
    }));

    it("clears the error when its dialog is closed with OK", fakeAsync(async () => {
      expectConsoleError("Process HTTP error 400");
      const page = await render();
      page.type("email", "new.user@example.com");
      page.submit(page.signupForm());
      page.controller
        .expectOne(CONFIRM_URL)
        .flush("Wrong captcha", { status: 400, statusText: "Bad Request" });
      tick(UI_DELAY);
      page.detect();

      Array.from(document.querySelectorAll("tui-dialog button"))
        .find((b) => b.textContent.trim() === "OK")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      page.detect();

      expect(page.fixture.componentInstance.error).toBeNull();
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
      expect(page.navigate).toHaveBeenCalledTimes(1);
      expect(page.navigate).toHaveBeenCalledWith(["/projects"]);
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
      page.detect();

      expect(page.errorText()).toBe("Wrong confirmation code");
      expect(page.config.authorization).toBeNull();
      expect(localStorage.getItem(AUTHORIZATION_KEY)).toBeNull();
      expect(page.navigate).not.toHaveBeenCalled();
      expect(
        isLoading(page.confirmationForm().querySelector("button[type=submit]")),
      ).toBe(false);
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
