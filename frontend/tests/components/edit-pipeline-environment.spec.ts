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
 * Route data: `project`, the user `environment` (GET /api/me/environment,
 * Secret Variables masked as `[encrypted]`, Visible Variables in clear) and the `platform` variable names
 * (GET /api/environment/keys). The tab edits only `project.environment`,
 * which reaches the backend through the regular project autosave; it never
 * calls the environment API itself.
 */

/**
 * Project A (environment `API_URL`, `RETRIES: 0`) whose nodes declare
 * variables of every scope.
 */
function projectWithEnvironment(): Project {
  const pipeline = smallGraphPipeline() as {
    nodes: Record<string, Record<string, unknown>>;
  };
  pipeline.nodes["node_one"]["environment"] = {
    OPENAI_KEY: {
      type: "string",
      scope: "user",
      description: "Get it from **OpenAI**",
    },
    API_URL: { type: "string", scope: "global" },
    MODEL: { type: "string", scope: "global" },
  };
  pipeline.nodes["node_two"]["environment"] = {
    RETRIES: { type: "integer", scope: "pipeline" },
    VERBOSE: { type: "boolean", scope: "pipeline" },
    TOKEN: { type: "string", scope: "pipeline" },
  };
  return projectWith(pipeline);
}

function userEnvironment(
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
    environment: Environment = userEnvironment({
      OPENAI_KEY: "[encrypted]",
      VERBOSE: true,
    }),
    platform: string[] = ["API_URL"],
  ) {
    // only Variables the project can set get a Source select
    const declared = [...getDeclaredVariables(project.pipeline).values()];
    if (declared.some(({ scope }) => scope === "pipeline")) {
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
          useValue: { data: of({ project, environment, platform }) },
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

  /**
   * What each row shows: a read-only row has no inputs and says in text where
   * its value comes from; an editable row picks its source and value.
   */
  function rows() {
    return Array.from(element.querySelectorAll("tr.variable")).map((row) => {
      const input = row.querySelector("input.value") as HTMLInputElement | null;
      return {
        key: text(row, ".key"),
        type: text(row, ".type"),
        source: row.querySelector("select.bind")
          ? source(row)
          : text(row, ".source"),
        value: input ? input.value || input.placeholder : text(row, ".value"),
        editable: !!input && !input.readOnly,
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
        source: "Your environment",
        value: "Stored",
        editable: false,
      },
      {
        key: "API_URL",
        type: "String",
        source: "Platform",
        value: "Stored",
        editable: false,
      },
      {
        key: "MODEL",
        type: "String",
        source: "Not set",
        value: "",
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
        source: "This project",
        value: "true",
        editable: true,
      },
      {
        key: "TOKEN",
        type: "String",
        source: "This project",
        value: "",
        editable: true,
      },
    ]);
    finish();
  }));

  it("shows an inherited value but never a secret", fakeAsync(() => {
    setup();

    expect(
      (row("VERBOSE").querySelector("input.value") as HTMLInputElement)
        .placeholder,
    ).toBe("true");
    expect(text(row("OPENAI_KEY"), ".value")).toBe("Stored");
    expect(text(row("API_URL"), ".value")).toBe("Stored");
    finish();
  }));

  it("fixes names and types to the node declarations", fakeAsync(() => {
    setup();

    const controls = (key: string) =>
      Array.from(row(key).querySelectorAll("input, select")).map(
        (control) => control.className.split(" ")[0],
      );

    expect(controls("RETRIES")).toEqual(["bind", "value"]);
    expect(controls("TOKEN")).toEqual(["bind", "value", "secret"]);
    expect(controls("OPENAI_KEY")).toEqual([]);
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
    type(row("RETRIES").querySelector("input.value"), "5");
    type(row("VERBOSE").querySelector("input.value"), "false");
    type(row("TOKEN").querySelector("input.value"), "sk-project");

    button("Save").click();
    fixture.detectChanges();

    controller.expectNone(() => true);
    expect(toPlain(project.environment)).toEqual({
      variables: { RETRIES: 5, VERBOSE: false, TOKEN: "sk-project" },
      visible: [],
    });
    expect(manager.status.value).toBe("dirty");
    finish();
  }));

  it("doesn't store emptied variables so they inherit", fakeAsync(() => {
    const project = setup();
    type(row("RETRIES").querySelector("input.value"), "");

    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: {},
      visible: [],
    });
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
    expect(toPlain(project.environment)).toEqual({
      variables: { RETRIES: 0, TOKEN: "[encrypted]" },
      visible: [],
    });
    finish();
  }));

  it("shows the value of an inherited Visible Variable", fakeAsync(() => {
    setup(
      projectWithEnvironment(),
      userEnvironment({ OPENAI_KEY: "sk-shown" }, ["OPENAI_KEY"]),
    );

    expect(text(row("OPENAI_KEY"), ".value")).toBe("sk-shown");
    expect(row("OPENAI_KEY").querySelector("input.secret")).toBeNull();
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
      variables: { RETRIES: 0, TOKEN: "tk-shown" },
      visible: ["TOKEN"],
    });
    finish();
  }));

  it("saves a string Variable as visible when it isn't secret", fakeAsync(() => {
    const project = setup();
    type(row("TOKEN").querySelector("input.value"), "tk-new");
    (row("TOKEN").querySelector("input.secret") as HTMLInputElement).click();

    button("Save").click();
    fixture.detectChanges();

    expect(toPlain(project.environment)).toEqual({
      variables: { RETRIES: 0, TOKEN: "tk-new" },
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
      variables: { RETRIES: 0 },
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

  /** The labels of a row's Source choices. */
  function sources(key: string) {
    return optionLabels(row(key).querySelector("select.bind"));
  }

  /** Picks a Source by its label; "This project" unbinds. */
  function bind(key: string, label: string) {
    selectByLabel(row(key).querySelector("select.bind"), label);
    fixture.detectChanges();
  }

  it("offers binding only for variables the project can set", fakeAsync(() => {
    setup();

    const options = sources("TOKEN");

    expect(options).toEqual(["This project", "OPENAI_KEY", "VERBOSE"]);
    expect(row("OPENAI_KEY").querySelector("select.bind")).toBeNull();
    finish();
  }));

  it("binds a variable to a user variable instead of its own value", fakeAsync(() => {
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
      variables: { RETRIES: 0 },
      visible: [],
      bindings: { TOKEN: "OPENAI_KEY" },
    });
    finish();
  }));

  it("shows the value of a bound Visible Variable", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.bindings = new Map([["RETRIES", "VERBOSE"]]);
    setup(project, userEnvironment({ VERBOSE: true }, ["VERBOSE"]));

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

  it("keeps a binding whose user variable is gone and says so", fakeAsync(() => {
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
      note: "Not in your environment",
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
      variables: { RETRIES: 0, TOKEN: "tk-shown" },
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
      variables: { RETRIES: 0, TOKEN: "sk-own" },
      visible: [],
    });
    finish();
  }));

  it("clears only the project's own variables", fakeAsync(() => {
    const project = setup();

    button("Clear").click();
    fixture.detectChanges();

    controller.expectNone(() => true);
    expect(toPlain(project.environment)).toEqual({ variables: {} });
    expect(manager.status.value).toBe("dirty");
    expect(row("RETRIES").querySelector("input.value")).toHaveProperty(
      "value",
      "",
    );
    finish();
  }));
});
