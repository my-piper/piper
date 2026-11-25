import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ComponentFixture, fakeAsync, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, provideRouter, RouterLink } from "@angular/router";
import { of } from "rxjs";
import { EditPipelineEnvironmentComponent } from "src/app/edit-pipeline-environment/edit-pipeline-environment.component";
import { Environment } from "src/models/environment";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { provideTaiga } from "@taiga-ui/core";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toInstance, toPlain } from "src/utils/models";
import { getDeclaredVariables } from "src/utils/pipeline";
import { projectA, projectWith } from "../fixtures/models";
import { Plain, smallGraphPipeline } from "../fixtures/plain";
import { provideTestConfig } from "../helpers/config";
import { finish } from "../helpers/editor";
import {
  expectNativeSelectReadOnly,
  optionLabels,
  selectByLabel,
  selectedLabel,
} from "../helpers/taiga";

/**
 * Route data: `project` and the Global `environment` (GET /api/environment,
 * Secret Variables masked as `[encrypted]`, Visible Variables in clear). The
 * tab edits only `project.environment` (`{ variables, visible, bindings? }`:
 * an own value overrides, `bindings` names a differently named Global
 * Variable, neither binds the Global Variable of the same name), which
 * reaches the backend through the regular project autosave; it never calls
 * the environment API itself.
 */

/**
 * Project A (own values `API_URL`, `RETRIES: 0`) whose nodes declare six
 * variables.
 */
function projectWithEnvironment(): Project {
  const pipeline = smallGraphPipeline() as {
    nodes: Record<string, Record<string, unknown>>;
  };
  pipeline.nodes["node_one"]["environment"] = {
    OPENAI_KEY: { type: "string", description: "Get it from **OpenAI**" },
    API_URL: { type: "string" },
    MODEL: { type: "string" },
  };
  pipeline.nodes["node_two"]["environment"] = {
    RETRIES: { type: "integer" },
    VERBOSE: { type: "boolean" },
    TOKEN: { type: "string" },
  };
  return projectWith(pipeline);
}

function globalEnvironment(
  variables: Plain,
  visible: string[] = [],
): Environment {
  return toInstance({ variables, visible }, Environment);
}

describe("EditPipelineEnvironmentComponent", () => {
  let fixture: ComponentFixture<EditPipelineEnvironmentComponent>;
  let controller: HttpTestingController;
  let manager: ProjectManager;
  let element: HTMLElement;

  function setup(
    project: Project = projectWithEnvironment(),
    environment: Environment | null = globalEnvironment(
      { OPENAI_KEY: "[encrypted]", VERBOSE: true, MODEL: "gpt-5" },
      ["MODEL"],
    ),
  ) {
    // every declared Variable gets a Source select
    if (getDeclaredVariables(project.pipeline).size > 0) {
      expectNativeSelectReadOnly();
    }
    TestBed.configureTestingModule({
      errorOnUnknownProperties: false,
      declarations: [EditPipelineEnvironmentComponent],
      imports: [ReactiveFormsModule, RouterLink, UiKitModule, TaigaFormsModule],
      providers: [
        provideTaiga(),
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        {
          provide: ActivatedRoute,
          useValue: { data: of({ project, environment }) },
        },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    manager = TestBed.inject(ProjectManager);
    manager.project = project;
    fixture = TestBed.createComponent(EditPipelineEnvironmentComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    return project;
  }

  /** What each row shows: its source, and its value or placeholder. */
  function rows() {
    return Array.from(element.querySelectorAll("tr.variable")).map((row) => {
      const input = row.querySelector("input.value") as HTMLInputElement;
      return {
        key: text(row, ".key"),
        type: text(row, ".type"),
        source: source(row),
        value: input.value || input.placeholder,
        editable: !input.readOnly,
      };
    });
  }

  function text(parent: Element, selector: string) {
    return parent.querySelector(selector)?.textContent.trim() ?? "";
  }

  /** The Source a row's select shows. */
  function source(row: Element) {
    return selectedLabel(row.querySelector("select.bind"));
  }

  function row(key: string) {
    return Array.from(element.querySelectorAll("tr.variable")).find(
      (r) => text(r, ".key") === key,
    );
  }

  function type(input: Element, value: string) {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll("button")).find((b) =>
      b.textContent.includes(text),
    );
  }

  /** The labels of a row's Source choices. */
  function sources(key: string) {
    return optionLabels(row(key).querySelector("select.bind"));
  }

  /** Picks a Source by its label; "This project" overrides. */
  function bind(key: string, label: string) {
    selectByLabel(row(key).querySelector("select.bind"), label);
    fixture.detectChanges();
  }

  afterEach(() => controller.verify());

  it("explains that no node needs variables", fakeAsync(() => {
    setup(projectA());

    expect(element.querySelector("form")).toBeNull();
    expect(element.textContent).toContain(
      "No node in this pipeline needs environment variables.",
    );
    finish();
  }));

  it("lists each declared variable with where its value comes from", fakeAsync(() => {
    setup();

    expect(rows()).toEqual([
      {
        key: "OPENAI_KEY",
        type: "String",
        source: "OPENAI_KEY",
        value: "Stored",
        editable: false,
      },
      {
        key: "API_URL",
        type: "String",
        source: "This project",
        value: "http://dummy.piper.test",
        editable: true,
      },
      {
        key: "MODEL",
        type: "String",
        source: "MODEL",
        value: "gpt-5",
        editable: false,
      },
      {
        key: "RETRIES",
        type: "Number",
        source: "This project",
        value: "0",
        editable: true,
      },
      {
        key: "VERBOSE",
        type: "Boolean",
        source: "VERBOSE",
        value: "true",
        editable: false,
      },
      {
        key: "TOKEN",
        type: "String",
        source: "TOKEN",
        value: "",
        editable: false,
      },
    ]);
    finish();
  }));

  it("shows a bound Visible Variable's value but never a secret", fakeAsync(() => {
    setup();

    const input = (key: string) =>
      row(key).querySelector("input.value") as HTMLInputElement;

    expect({
      value: input("MODEL").value,
      placeholder: input("MODEL").placeholder,
    }).toEqual({ value: "", placeholder: "gpt-5" });
    expect(input("OPENAI_KEY").placeholder).toBe("Stored");
    expect(row("OPENAI_KEY").querySelector("input.secret")).toBeNull();
    finish();
  }));

  it("flags a variable bound to a missing global variable", fakeAsync(() => {
    setup();

    const missing = Array.from(element.querySelectorAll(".missing")).map(
      (note) => note.closest("tr").querySelector(".key").textContent.trim(),
    );

    expect(missing).toEqual(["TOKEN"]);
    expect(text(row("TOKEN"), ".missing")).toBe(
      "Not in the global environment",
    );
    finish();
  }));

  it("lets every variable be set or bound, with its type fixed", fakeAsync(() => {
    setup();

    const controls = (key: string) =>
      Array.from(row(key).querySelectorAll("input, select")).map(
        (control) => control.className.split(" ")[0],
      );

    expect(controls("RETRIES")).toEqual(["bind", "value"]);
    expect(controls("API_URL")).toEqual(["bind", "value", "secret"]);
    expect(controls("OPENAI_KEY")).toEqual(["bind", "value"]);
    expect(element.querySelector("button.remove")).toBeNull();
    expect(button("Add variable")).toBeUndefined();
    finish();
  }));

  it("shows the node's description as markdown", fakeAsync(() => {
    setup();

    expect(row("OPENAI_KEY").querySelector(".description").innerHTML).toContain(
      "Get it from <strong>OpenAI</strong>",
    );
    finish();
  }));

  it("saves only the project's own variables, typed, without calling the API", fakeAsync(() => {
    const project = setup();
    bind("VERBOSE", "This project");
    bind("TOKEN", "This project");
    type(row("RETRIES").querySelector("input.value"), "5");
    type(row("VERBOSE").querySelector("input.value"), "false");
    type(row("TOKEN").querySelector("input.value"), "sk-project");

    button("Save").click();
    fixture.detectChanges();

    controller.expectNone(() => true);
    expect(toPlain(project.environment)).toEqual({
      variables: {
        API_URL: "http://dummy.piper.test",
        RETRIES: 5,
        VERBOSE: false,
        TOKEN: "sk-project",
      },
      visible: [],
    });
    expect(manager.status.value).toBe("dirty");
    finish();
  }));

  it("doesn't store emptied variables so they read the same-name global variable", fakeAsync(() => {
    const project = setup();
    type(row("RETRIES").querySelector("input.value"), "");

    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: { API_URL: "http://dummy.piper.test" },
      visible: [],
    });
    expect(source(row("RETRIES"))).toBe("RETRIES");
    finish();
  }));

  it("keeps a stored secret whose input is left empty", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.set("TOKEN", "[encrypted]");
    setup(project);

    const input = row("TOKEN").querySelector("input.value") as HTMLInputElement;
    button("Save").click();
    fixture.detectChanges();

    expect(input.value).toBe("");
    expect(source(row("TOKEN"))).toBe("This project");
    expect(toPlain(project.environment)).toEqual({
      variables: {
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
        TOKEN: "[encrypted]",
      },
      visible: [],
    });
    finish();
  }));

  it("shows and keeps the project's own Visible Variable", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.set("TOKEN", "tk-shown");
    project.environment.visible = ["TOKEN"];
    setup(project);

    const input = row("TOKEN").querySelector("input.value") as HTMLInputElement;
    const shown = { value: input.value, type: input.type };
    button("Save").click();
    fixture.detectChanges();

    expect(shown).toEqual({ value: "tk-shown", type: "text" });
    expect(toPlain(project.environment)).toEqual({
      variables: {
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
        TOKEN: "tk-shown",
      },
      visible: ["TOKEN"],
    });
    finish();
  }));

  it("saves a string Variable as visible when it isn't secret", fakeAsync(() => {
    const project = setup();
    bind("TOKEN", "This project");
    type(row("TOKEN").querySelector("input.value"), "tk-new");
    (row("TOKEN").querySelector("input.secret") as HTMLInputElement).click();

    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: {
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
        TOKEN: "tk-new",
      },
      visible: ["TOKEN"],
    });
    finish();
  }));

  it("drops a stored secret made visible without a new value", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.set("TOKEN", "[encrypted]");
    setup(project);

    (row("TOKEN").querySelector("input.secret") as HTMLInputElement).click();
    fixture.detectChanges();
    const placeholder = (
      row("TOKEN").querySelector("input.value") as HTMLInputElement
    ).placeholder;
    button("Save").click();
    fixture.detectChanges();

    expect(placeholder).toBe("The stored value is dropped on save");
    expect(toPlain(project.environment)).toEqual({
      variables: { API_URL: "http://dummy.piper.test", RETRIES: 0 },
      visible: [],
    });
    finish();
  }));

  it("doesn't save a value that doesn't match its type", fakeAsync(() => {
    setup();

    type(row("RETRIES").querySelector("input.value"), "three");

    expect(button("Save").disabled).toBe(true);
    finish();
  }));

  it("offers this project and every global variable as the source", fakeAsync(() => {
    setup();

    const options = sources("TOKEN");

    expect(options).toEqual([
      "This project",
      "MODEL",
      "OPENAI_KEY",
      "TOKEN",
      "VERBOSE",
    ]);
    expect(sources("RETRIES")).toEqual([
      "This project",
      "MODEL",
      "OPENAI_KEY",
      "RETRIES",
      "VERBOSE",
    ]);
    finish();
  }));

  it("binds a variable to another global variable instead of its own value", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.set("TOKEN", "[encrypted]");
    setup(project);

    bind("TOKEN", "OPENAI_KEY");

    const input = row("TOKEN").querySelector("input.value") as HTMLInputElement;
    const shown = {
      readonly: input.readOnly,
      placeholder: input.placeholder,
      secret: row("TOKEN").querySelector("input.secret"),
    };

    button("Save").click();
    fixture.detectChanges();

    expect(shown).toEqual({
      readonly: true,
      placeholder: "Stored",
      secret: null,
    });
    expect(toPlain(project.environment)).toEqual({
      variables: { API_URL: "http://dummy.piper.test", RETRIES: 0 },
      visible: [],
      bindings: { TOKEN: "OPENAI_KEY" },
    });
    finish();
  }));

  it("stores nothing for a variable bound to the global variable of its name", fakeAsync(() => {
    const project = setup();

    bind("RETRIES", "RETRIES");
    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: { API_URL: "http://dummy.piper.test" },
      visible: [],
    });
    expect(row("RETRIES").querySelector(".missing")).not.toBeNull();
    finish();
  }));

  it("shows the value of a bound Visible Variable", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.delete("RETRIES");
    project.environment.bindings = new Map([["RETRIES", "VERBOSE"]]);
    setup(project, globalEnvironment({ VERBOSE: true }, ["VERBOSE"]));

    const input = row("RETRIES").querySelector(
      "input.value",
    ) as HTMLInputElement;

    expect(source(row("RETRIES"))).toBe("VERBOSE");
    expect({ value: input.value, placeholder: input.placeholder }).toEqual({
      value: "",
      placeholder: "true",
    });
    finish();
  }));

  it("keeps a binding whose global variable is gone and says so", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.bindings = new Map([["TOKEN", "OLD_TOKEN"]]);
    setup(project);

    const shown = {
      value: source(row("TOKEN")),
      placeholder: (
        row("TOKEN").querySelector("input.value") as HTMLInputElement
      ).placeholder,
      note: row("TOKEN").querySelector(".missing")?.textContent.trim(),
    };

    button("Save").click();
    fixture.detectChanges();

    expect(shown).toEqual({
      value: "OLD_TOKEN",
      placeholder: "",
      note: "Not in the global environment",
    });
    expect(toPlain(project.environment).bindings).toEqual({
      TOKEN: "OLD_TOKEN",
    });
    finish();
  }));

  it("gives back the own value when a row is bound and unbound before saving", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.set("TOKEN", "tk-shown");
    project.environment.visible = ["TOKEN"];
    setup(project);

    bind("TOKEN", "OPENAI_KEY");
    bind("TOKEN", "This project");
    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: {
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
        TOKEN: "tk-shown",
      },
      visible: ["TOKEN"],
    });
    finish();
  }));

  it("unbinding lets the project set its own value again", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.bindings = new Map([["TOKEN", "OPENAI_KEY"]]);
    setup(project);

    bind("TOKEN", "This project");
    type(row("TOKEN").querySelector("input.value"), "sk-own");
    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: {
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
        TOKEN: "sk-own",
      },
      visible: [],
    });
    finish();
  }));

  it("clears the project's overrides and bindings so every variable reads its global variable", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.bindings = new Map([["TOKEN", "OPENAI_KEY"]]);
    setup(project);

    button("Clear").click();
    fixture.detectChanges();

    controller.expectNone(() => true);
    expect(toPlain(project.environment)).toEqual({ variables: {} });
    expect(manager.status.value).toBe("dirty");
    expect(rows().map(({ key, source }) => [key, source])).toEqual([
      ["OPENAI_KEY", "OPENAI_KEY"],
      ["API_URL", "API_URL"],
      ["MODEL", "MODEL"],
      ["RETRIES", "RETRIES"],
      ["VERBOSE", "VERBOSE"],
      ["TOKEN", "TOKEN"],
    ]);
    finish();
  }));

  it("links to the global environment", fakeAsync(() => {
    setup();

    const link = element.querySelector(".explanation a") as HTMLAnchorElement;

    expect(link.getAttribute("href")).toBe("/environment");
    expect(element.textContent).not.toContain("your environment");
    finish();
  }));

  it("binds every variable by name when there is no global environment", fakeAsync(() => {
    setup(projectWithEnvironment(), null);

    expect(rows().map(({ key, source }) => [key, source])).toEqual([
      ["OPENAI_KEY", "OPENAI_KEY"],
      ["API_URL", "This project"],
      ["MODEL", "MODEL"],
      ["RETRIES", "This project"],
      ["VERBOSE", "VERBOSE"],
      ["TOKEN", "TOKEN"],
    ]);
    expect(element.querySelectorAll(".missing")).toHaveLength(4);
    finish();
  }));
});
