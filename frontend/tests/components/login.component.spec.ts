import { provideHttpClient } from "@angular/common/http";
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
import { provideRouter, Router, RouterLink } from "@angular/router";
import { LoginComponent } from "src/app/signin/login.component";
import { AUTHORIZATION_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { InformerComponent } from "src/ui-kit/informer/informer.component";
import { IncludesPipe } from "src/ui-kit/pipes/includes.pipe";
import { InvalidFieldPipe } from "src/ui-kit/pipes/invalid-field.pipe";
import { PopoverDirective } from "src/ui-kit/popover/popover.directive";
import { GetUrlPipe } from "src/ui-kit/select-language/get-url-by-lang.pipe";
import { SelectLanguageComponent } from "src/ui-kit/select-language/select-language.component";
import { authorizationPlain } from "../fixtures/plain";
import { PlainAppConfig, RUNTIME_VARIANTS } from "../fixtures/runtime-config";
import { provideTestConfig } from "../helpers/config";

async function render(config: Partial<PlainAppConfig> = {}) {
  await TestBed.configureTestingModule({
    // UiKitModule is not imported: under JIT its TickerPipe (a pipe extending
    // the @Directive UntilDestroyed base) fails with "has no selector".
    declarations: [
      LoginComponent,
      IconComponent,
      InformerComponent,
      PopoverDirective,
      SelectLanguageComponent,
      InvalidFieldPipe,
      IncludesPipe,
      GetUrlPipe,
    ],
    imports: [ReactiveFormsModule, RouterLink],
    providers: [
      provideTestConfig(config),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  return {
    fixture,
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

    expect(element.querySelector("#identity").classList).toContain("error");
    expect(element.querySelector("#password").classList).toContain("error");
    controller.verify();
  }));

  it("signs in, stores the authorization and opens projects", fakeAsync(async () => {
    const { fixture, element, controller, router, config } = await render();
    const navigate = spyOn(router, "navigate").and.resolveTo(true);
    type(fixture, "identity", "owner");
    type(fixture, "password", "secret");

    submit(fixture);
    const req = controller.expectOne("/api/login");
    const busy = submitButton(element).disabled;
    req.flush(authorizationPlain("owner"));
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ identity: "owner", password: "secret" });
    expect(busy).toBeTrue();
    expect(submitButton(element).disabled).toBeFalse();
    expect(config.authorization.token).toBe("fake-token-owner");
    expect(JSON.parse(localStorage.getItem(AUTHORIZATION_KEY)).token).toBe(
      "fake-token-owner",
    );
    expect(navigate).toHaveBeenCalledOnceWith(["/projects"]);
    controller.verify();
  }));

  it("shows the error, resets progress and stores nothing on failure", fakeAsync(async () => {
    spyOn(console, "error");
    const { fixture, element, controller, router, config } = await render();
    const navigate = spyOn(router, "navigate").and.resolveTo(true);
    type(fixture, "identity", "owner");
    type(fixture, "password", "wrong");

    submit(fixture);
    controller
      .expectOne("/api/login")
      .flush("Wrong credentials", { status: 400, statusText: "Bad Request" });
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(element.querySelector("app-informer").textContent).toContain(
      "Wrong credentials",
    );
    expect(submitButton(element).disabled).toBeFalse();
    expect(config.authorization).toBeNull();
    expect(localStorage.getItem(AUTHORIZATION_KEY)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    controller.verify();
  }));

  it("offers registration only when signup is enabled", fakeAsync(async () => {
    const enabled = await render();
    const withSignup = !!enabled.element.querySelector("a[href='/signup']");
    TestBed.resetTestingModule();

    const disabled = await render(RUNTIME_VARIANTS.signupOff());

    expect(withSignup).toBeTrue();
    expect(disabled.element.querySelector("a[href='/signup']")).toBeNull();
  }));

  it("shows OAuth buttons only for enabled providers", fakeAsync(async () => {
    const { element } = await render({
      ui: { features: ["signup", "google_auth"] },
    });

    expect(element.querySelector("a[href='/oauth/google']")).not.toBeNull();
    expect(element.querySelector("a[href='/oauth/yandex']")).toBeNull();
  }));
});
