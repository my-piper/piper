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
import { ActivatedRoute, provideRouter } from "@angular/router";
import { of } from "rxjs";
import { MeEnvironmentComponent } from "src/app/me-environment/me-environment.component";
import { Environment } from "src/models/environment";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { TickerPipe } from "src/ui-kit/pipes/ticker.pipe";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toInstance } from "src/utils/models";
import { provideTestConfig } from "../helpers/config";
import { finish } from "../helpers/editor";
import { asJitPipes } from "../helpers/jit";

/**
 * Wire contracts (backend/api/environment):
 * - GET /api/me/environment → `{ variables }`, strings masked as `[encrypted]`;
 * - PUT /api/me/environment `{ variables }` merges into the user environment;
 * - DELETE /api/me/environment/:key removes one variable.
 */
const ENVIRONMENT_URL = "/api/me/environment";

describe("MeEnvironmentComponent", () => {
  let fixture: ComponentFixture<MeEnvironmentComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  function setup(
    variables: object = {
      OPENAI_KEY: "[encrypted]",
      RETRIES: 3,
      DEBUG: true,
    },
  ) {
    asJitPipes(TickerPipe);
    TestBed.configureTestingModule({
      declarations: [MeEnvironmentComponent],
      imports: [ReactiveFormsModule, UiKitModule],
      providers: [
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ environment: toInstance({ variables }, Environment) }),
          },
        },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MeEnvironmentComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  function rows(): { key: string; type: string; value: string }[] {
    return Array.from(element.querySelectorAll("tr.variable")).map((row) => ({
      key: (row.querySelector("input.key") as HTMLInputElement).value,
      type: (row.querySelector("select.type") as HTMLSelectElement).value,
      value: (row.querySelector("input.value") as HTMLInputElement).value,
    }));
  }

  function row(index: number) {
    return element.querySelectorAll("tr.variable")[index];
  }

  function type(input: Element, value: string) {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("change"));
    fixture.detectChanges();
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll("button")).find((b) =>
      b.textContent.includes(text),
    );
  }

  function settle() {
    tick(UI_DELAY);
    fixture.detectChanges();
  }

  afterEach(() => controller.verify());

  it("lists stored variables without revealing secrets", fakeAsync(() => {
    setup();

    expect(rows()).toEqual([
      { key: "OPENAI_KEY", type: "string", value: "" },
      { key: "RETRIES", type: "number", value: "3" },
      { key: "DEBUG", type: "boolean", value: "true" },
    ]);
    expect(
      (row(0).querySelector("input.key") as HTMLInputElement).readOnly,
    ).toBeTrue();
    finish();
  }));

  it("saves added and changed variables and keeps untouched secrets", fakeAsync(() => {
    setup();
    type(row(1).querySelector("input.value"), "5");
    button("Add variable").click();
    fixture.detectChanges();
    type(row(3).querySelector("input.key"), "API_URL");
    type(row(3).querySelector("input.value"), "http://shared.piper.test");

    button("Save").click();
    const put = controller.expectOne(ENVIRONMENT_URL);
    put.flush(null);
    settle();
    controller.expectOne(ENVIRONMENT_URL).flush({
      variables: {
        OPENAI_KEY: "[encrypted]",
        RETRIES: 5,
        DEBUG: true,
        API_URL: "[encrypted]",
      },
    });
    fixture.detectChanges();

    expect(put.request.method).toBe("PUT");
    expect(put.request.body).toEqual({
      variables: {
        RETRIES: 5,
        DEBUG: true,
        API_URL: "http://shared.piper.test",
      },
    });
    expect(rows().map(({ key }) => key)).toEqual([
      "OPENAI_KEY",
      "RETRIES",
      "DEBUG",
      "API_URL",
    ]);
    finish();
  }));

  it("removes a stored variable", fakeAsync(() => {
    setup();

    (row(0).querySelector("button.remove") as HTMLButtonElement).click();
    const request = controller.expectOne(`${ENVIRONMENT_URL}/OPENAI_KEY`);
    request.flush(null);
    settle();

    expect(request.request.method).toBe("DELETE");
    expect(rows().map(({ key }) => key)).toEqual(["RETRIES", "DEBUG"]);
    finish();
  }));

  it("drops an unsaved variable without asking the server", fakeAsync(() => {
    setup({});
    button("Add variable").click();
    fixture.detectChanges();

    (row(0).querySelector("button.remove") as HTMLButtonElement).click();
    fixture.detectChanges();

    controller.expectNone(() => true);
    expect(rows()).toEqual([]);
    finish();
  }));

  it("keeps a stored value whose input is left empty, whatever its type", fakeAsync(() => {
    setup({ OPENAI_KEY: "[encrypted]", RETRIES: 3 });
    const select = row(0).querySelector("select.type") as HTMLSelectElement;
    select.value = "number";
    select.dispatchEvent(new Event("change"));
    type(row(1).querySelector("input.value"), "");

    button("Save").click();
    const put = controller.expectOne(ENVIRONMENT_URL);
    put.flush(null);
    settle();
    controller.expectOne(ENVIRONMENT_URL).flush({ variables: {} });

    expect(put.request.body).toEqual({ variables: {} });
    finish();
  }));

  it("doesn't save a value that doesn't match its type", fakeAsync(() => {
    setup({ RETRIES: 3, DEBUG: true });

    type(row(0).querySelector("input.value"), "three");
    const numberInvalid = button("Save").disabled;
    type(row(0).querySelector("input.value"), "4");
    type(row(1).querySelector("input.value"), "yes");

    expect(numberInvalid).toBeTrue();
    expect(button("Save").disabled).toBeTrue();
    finish();
  }));

  it("doesn't save a variable with an invalid name", fakeAsync(() => {
    setup({});
    button("Add variable").click();
    fixture.detectChanges();

    type(row(0).querySelector("input.key"), "bad key");

    expect(button("Save").disabled).toBeTrue();
    finish();
  }));
});
