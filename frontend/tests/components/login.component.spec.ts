import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
  RouterLink,
} from "@angular/router";
import { LoginComponent } from "src/app/signin/login.component";
import { AUTHORIZATION_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { IncludesPipe } from "src/pipes/includes.pipe";
import { ErrorDialogComponent } from "src/app/error-dialog/error-dialog.component";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { provideTaiga, TuiDropdown } from "@taiga-ui/core";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { authorizationPlain } from "../fixtures/plain";
import { PlainAppConfig, RUNTIME_VARIANTS } from "../fixtures/runtime-config";
import { provideTestConfig } from "../helpers/config";
import {
  isLoading,
  markedInvalid,
  openDialog,
  popupRoot,
  togglePassword,
} from "../helpers/taiga";

async function render(
  config: Partial<PlainAppConfig> = {},
  query: Record<string, string> = {},
) {
  await TestBed.configureTestingModule({
    declarations: [
      LoginComponent,
      SelectThemeComponent,
      IncludesPipe,
    ],
    imports: [
      ReactiveFormsModule,
      RouterLink,
      TaigaFormsModule,
      ErrorDialogComponent,
      ...TuiDropdown,
    ],
    providers: [
      provideTaiga(),
      provideTestConfig(config),
      provideRouter([]),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginComponent);
  // Before the first change detection: an SSO error opens a dialog at once.
  const root = popupRoot();
  fixture.detectChanges();
  return {
    fixture,
    root,
    element: fixture.nativeElement as HTMLElement,
    controller: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    config: TestBed.inject(AppConfig),
  };
}

function type(
  fixture: ComponentFixture<LoginComponent>,
  id: string,
  value: string,
) {
  const input = fixture.nativeElement.querySelector(
    `#${id}`,
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function submit(fixture: ComponentFixture<LoginComponent>) {
  const form = fixture.nativeElement.querySelector("form") as HTMLFormElement;
  form.dispatchEvent(new Event("submit"));
  fixture.detectChanges();
}

function submitButton(element: HTMLElement) {
  return element.querySelector("button[type=submit]") as HTMLButtonElement;
}

describe("LoginComponent", () => {
  it("does not submit an incomplete form and marks missing fields", fakeAsync(async () => {
    const { fixture, element, controller } = await render();
    type(fixture, "identity", "");

    submit(fixture);

    expect(markedInvalid(element.querySelector("#identity"))).toBe(true);
    expect(markedInvalid(element.querySelector("#password"))).toBe(true);
    controller.verify();
  }));

  it("shows and hides the typed password", fakeAsync(async () => {
    const { fixture, element } = await render();
    const password = element.querySelector<HTMLInputElement>("#password");
    const textfield = password.closest("tui-textfield");

    togglePassword(textfield);
    fixture.detectChanges();
    const shown = password.type;
    togglePassword(textfield);
    fixture.detectChanges();

    expect([shown, password.type]).toEqual(["text", "password"]);
  }));

  it("signs in, stores the authorization and opens projects", fakeAsync(async () => {
    const { fixture, element, controller, router, config } = await render();
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
    type(fixture, "identity", "owner");
    type(fixture, "password", "secret");

    submit(fixture);
    const req = controller.expectOne("/api/login");
    const busy = submitButton(element).disabled;
    const loading = isLoading(submitButton(element));
    req.flush(authorizationPlain("owner"));
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ identity: "owner", password: "secret" });
    expect(busy).toBe(true);
    expect(loading).toBe(true);
    expect(submitButton(element).disabled).toBe(false);
    expect(isLoading(submitButton(element))).toBe(false);
    expect(config.authorization.token).toBe("fake-token-owner");
    expect(JSON.parse(localStorage.getItem(AUTHORIZATION_KEY)).token).toBe(
      "fake-token-owner",
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(["/projects"]);
    controller.verify();
  }));

  it("shows the error, resets progress and stores nothing on failure", fakeAsync(async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const { fixture, root, element, controller, router, config } =
      await render();
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
    type(fixture, "identity", "owner");
    type(fixture, "password", "wrong");

    submit(fixture);
    controller
      .expectOne("/api/login")
      .flush("Wrong credentials", { status: 400, statusText: "Bad Request" });
    tick(UI_DELAY);
    fixture.detectChanges();
    root.detectChanges();

    expect(openDialog().textContent).toContain("Wrong credentials");
    expect(submitButton(element).disabled).toBe(false);
    expect(config.authorization).toBeNull();
    expect(localStorage.getItem(AUTHORIZATION_KEY)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    controller.verify();
  }));

  it("clears the error when its dialog is closed with OK", fakeAsync(async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const { fixture, root, controller } = await render();
    type(fixture, "identity", "owner");
    type(fixture, "password", "wrong");
    submit(fixture);
    controller
      .expectOne("/api/login")
      .flush("Wrong credentials", { status: 400, statusText: "Bad Request" });
    tick(UI_DELAY);
    fixture.detectChanges();
    root.detectChanges();

    Array.from(openDialog().querySelectorAll("button"))
      .find((b) => b.textContent.trim() === "OK")
      .click();
    fixture.detectChanges();

    expect(fixture.componentInstance.error).toBeNull();
    controller.verify();
  }));

  it("offers registration only when signup is enabled", fakeAsync(async () => {
    const enabled = await render();
    const withSignup = !!enabled.element.querySelector("a[href='/signup']");
    TestBed.resetTestingModule();

    const disabled = await render(RUNTIME_VARIANTS.signupOff());

    expect(withSignup).toBe(true);
    expect(disabled.element.querySelector("a[href='/signup']")).toBeNull();
  }));

  it("shows OAuth buttons only for enabled providers", fakeAsync(async () => {
    const { element } = await render({
      ui: { features: ["signup", "google_auth"] },
    });

    expect(element.querySelector("a[href='/oauth/google']")).not.toBeNull();
    expect(element.querySelector("a[href='/oauth/yandex']")).toBeNull();
  }));

  it("offers single sign-on whenever it is enabled, even without signup", fakeAsync(async () => {
    const enabled = await render({
      ui: { features: ["oidc_auth"], oidcLabel: "Authentik" },
    });
    const button = enabled.element.querySelector("a[href='/oauth/oidc']");
    const label = button?.textContent.trim();
    TestBed.resetTestingModule();

    const disabled = await render();

    expect(label).toBe("Sign in with Authentik");
    expect(disabled.element.querySelector("a[href='/oauth/oidc']")).toBeNull();
  }));

  for (const { code, message } of [
    {
      code: "sso_account_exists",
      message:
        "An account with this email already exists. Sign in with your password, then connect Authentik under Connected accounts in the account menu.",
    },
    {
      code: "sso_failed",
      message: "Single sign-on with Authentik failed. Please try again.",
    },
  ]) {
    it(`explains the single sign-on error ${code}`, fakeAsync(async () => {
      const { root } = await render(
        { ui: { features: ["oidc_auth"], oidcLabel: "Authentik" } },
        { error: code },
      );

      root.detectChanges();

      expect(openDialog().textContent).toContain(message);
    }));
  }
});
