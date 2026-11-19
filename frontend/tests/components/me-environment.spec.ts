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
import { ActivatedRoute, provideRouter } from "@angular/router";
import { of } from "rxjs";
import { EnvironmentVariablesComponent } from "src/app/environment-variables/environment-variables.component";
import { MeEnvironmentComponent } from "src/app/me-environment/me-environment.component";
import { Environment } from "src/models/environment";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toInstance } from "src/utils/models";
import { provideTestConfig } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import { finish } from "../helpers/editor";

/**
 * Wire contracts (backend/api/environment):
 * - GET /api/me/environment → `{ variables, visible }`, Secret Variables
 *   masked as `[encrypted]`, Visible Variables (named in `visible`) in clear;
 * - PUT /api/me/environment `{ variables, visible }` merges into the user
 *   environment; a Secret Variable made visible without a value is dropped;
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
    visible: string[] = [],
  ) {
    TestBed.configureTestingModule({
      declarations: [MeEnvironmentComponent, EnvironmentVariablesComponent],
      imports: [ReactiveFormsModule, UiKitModule],
      providers: [
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({
              environment: toInstance({ variables, visible }, Environment),
            }),
          },
        },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MeEnvironmentComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  function rows(): {
    key: string;
    type: string;
    value: string;
  }[] {
    return Array.from(element.querySelectorAll("tr.variable")).map((row) => ({
      key: (row.querySelector("input.key") as HTMLInputElement).value,
      type: (row.querySelector("select.type") as HTMLSelectElement).value,
      value: (row.querySelector("input.value") as HTMLInputElement).value,
    }));
  }

  function valueInput(index: number) {
    return row(index).querySelector("input.value") as HTMLInputElement;
  }

  function secretBox(index: number) {
    return row(index).querySelector("input.secret") as HTMLInputElement | null;
  }

  function toggle(input: HTMLInputElement) {
    input.click();
    fixture.detectChanges();
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
    ).toBe(false);
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
      visible: [],
    });
    expect(rows().map(({ key }) => key)).toEqual([
      "OPENAI_KEY",
      "RETRIES",
      "DEBUG",
      "API_URL",
    ]);
    finish();
  }));

  it("renames a stored variable and keeps its secret", fakeAsync(() => {
    setup();

    type(row(0).querySelector("input.key"), "OPENAI_API_KEY");
    button("Save").click();
    const rename = controller.expectOne(`${ENVIRONMENT_URL}/OPENAI_KEY/rename`);
    rename.flush(null);
    const put = controller.expectOne(ENVIRONMENT_URL);
    put.flush(null);
    settle();
    controller.expectOne(ENVIRONMENT_URL).flush({
      variables: { OPENAI_API_KEY: "[encrypted]", RETRIES: 3, DEBUG: true },
    });
    fixture.detectChanges();

    expect(rename.request.method).toBe("POST");
    expect(rename.request.body).toEqual({ name: "OPENAI_API_KEY" });
    expect(put.request.body).toEqual({
      variables: { RETRIES: 3, DEBUG: true },
      visible: [],
    });
    expect(rows().map(({ key }) => key)).toEqual([
      "OPENAI_API_KEY",
      "RETRIES",
      "DEBUG",
    ]);
    finish();
  }));

  it("shows a Visible Variable's value and masks a Secret Variable's input", fakeAsync(() => {
    setup({ OPENAI_KEY: "[encrypted]", BASE_URL: "https://a", RETRIES: 3 }, [
      "BASE_URL",
    ]);

    expect(rows().map(({ value }) => value)).toEqual(["", "https://a", "3"]);
    expect(valueInput(0).type).toBe("password");
    expect(valueInput(1).type).toBe("text");
    expect(secretBox(0)?.checked).toBe(true);
    expect(secretBox(1)?.checked).toBe(false);
    expect(secretBox(2)).toBeNull();
    finish();
  }));

  it("saves a new string Variable as visible when it isn't secret", fakeAsync(() => {
    setup({});
    button("Add variable").click();
    fixture.detectChanges();
    type(row(0).querySelector("input.key"), "BASE_URL");
    type(valueInput(0), "https://a");
    const secretByDefault = secretBox(0)?.checked;
    toggle(secretBox(0));

    button("Save").click();
    const put = controller.expectOne(ENVIRONMENT_URL);
    put.flush(null);
    settle();
    controller.expectOne(ENVIRONMENT_URL).flush({
      variables: { BASE_URL: "https://a" },
      visible: ["BASE_URL"],
    });
    fixture.detectChanges();

    expect(secretByDefault).toBe(true);
    expect(put.request.body).toEqual({
      variables: { BASE_URL: "https://a" },
      visible: ["BASE_URL"],
    });
    expect(valueInput(0).value).toBe("https://a");
    finish();
  }));

  it("warns that making a stored Secret Variable visible drops its value", fakeAsync(() => {
    setup({ OPENAI_KEY: "[encrypted]" });

    toggle(secretBox(0));
    const placeholder = valueInput(0).placeholder;
    button("Save").click();
    const put = controller.expectOne(ENVIRONMENT_URL);
    put.flush(null);
    settle();
    controller.expectOne(ENVIRONMENT_URL).flush({
      variables: {},
      visible: [],
    });

    expect(placeholder).toBe("The stored value is dropped on save");
    expect(put.request.body).toEqual({
      variables: {},
      visible: ["OPENAI_KEY"],
    });
    finish();
  }));

  it("doesn't save two variables with the same name", fakeAsync(() => {
    setup();

    type(row(1).querySelector("input.key"), "OPENAI_KEY");

    expect(button("Save").disabled).toBe(true);
    finish();
  }));

  it("doesn't rename onto a name another row still has stored", fakeAsync(() => {
    setup();

    type(row(0).querySelector("input.key"), "RETRIES");
    type(row(1).querySelector("input.key"), "OPENAI_KEY");

    expect(button("Save").disabled).toBe(true);
    expect(element.querySelector(".duplicate-name")).not.toBeNull();
    finish();
  }));

  it("retries a save without repeating renames that already landed", fakeAsync(() => {
    expectConsoleError("Process HTTP error 500");
    setup();
    type(row(0).querySelector("input.key"), "OPENAI_API_KEY");
    type(row(1).querySelector("input.key"), "MAX_RETRIES");

    button("Save").click();
    controller.expectOne(`${ENVIRONMENT_URL}/OPENAI_KEY/rename`).flush(null);
    controller
      .expectOne(`${ENVIRONMENT_URL}/RETRIES/rename`)
      .flush("failed", { status: 500, statusText: "Server Error" });
    settle();
    button("Save").click();
    const retry = controller.expectOne(`${ENVIRONMENT_URL}/RETRIES/rename`);
    retry.flush(null);
    controller.expectOne(ENVIRONMENT_URL).flush(null);
    settle();
    controller.expectOne(ENVIRONMENT_URL).flush({
      variables: { OPENAI_API_KEY: "[encrypted]", MAX_RETRIES: 3, DEBUG: true },
    });

    expect(retry.request.body).toEqual({ name: "MAX_RETRIES" });
    controller.expectNone(`${ENVIRONMENT_URL}/OPENAI_KEY/rename`);
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

  it("removes a stored variable by its stored name after an unsaved rename", fakeAsync(() => {
    setup();
    type(row(0).querySelector("input.key"), "OPENAI_API_KEY");

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

    expect(put.request.body).toEqual({ variables: {}, visible: [] });
    finish();
  }));

  it("doesn't save a value that doesn't match its type", fakeAsync(() => {
    setup({ RETRIES: 3, DEBUG: true });

    type(row(0).querySelector("input.value"), "three");
    const numberInvalid = button("Save").disabled;
    type(row(0).querySelector("input.value"), "4");
    type(row(1).querySelector("input.value"), "yes");

    expect(numberInvalid).toBe(true);
    expect(button("Save").disabled).toBe(true);
    finish();
  }));

  it("doesn't save a variable with an invalid name", fakeAsync(() => {
    setup({});
    button("Add variable").click();
    fixture.detectChanges();

    type(row(0).querySelector("input.key"), "bad key");

    expect(button("Save").disabled).toBe(true);
    finish();
  }));
});
