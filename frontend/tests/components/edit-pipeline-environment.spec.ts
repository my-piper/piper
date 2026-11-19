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
import { EnvironmentVariablesComponent } from "src/app/environment-variables/environment-variables.component";
import { Environment } from "src/models/environment";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toInstance, toPlain } from "src/utils/models";
import { projectA, projectWith } from "../fixtures/models";
import { Plain, smallGraphPipeline } from "../fixtures/plain";
import { provideTestConfig } from "../helpers/config";
import { finish } from "../helpers/editor";

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
    TestBed.configureTestingModule({
      declarations: [
        EditPipelineEnvironmentComponent,
        EnvironmentVariablesComponent,
      ],
      imports: [ReactiveFormsModule, RouterLink, UiKitModule],
      providers: [
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

  function rows() {
    return Array.from(element.querySelectorAll("tr.variable")).map((row) => {
      const value = row.querySelector("input.value") as HTMLInputElement;
      return {
        key: (row.querySelector("input.key") as HTMLInputElement).value,
        type: (row.querySelector("select.type") as HTMLSelectElement).value,
        value: value.value,
        readonly: value.readOnly,
        inherited: row.querySelector(".inherited")?.textContent.trim() || "",
      };
    });
  }

  function row(key: string) {
    return Array.from(element.querySelectorAll("tr.variable")).find(
      (r) => (r.querySelector("input.key") as HTMLInputElement).value === key,
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
        type: "string",
        value: "",
        readonly: true,
        inherited: "Your environment",
      },
      {
        key: "API_URL",
        type: "string",
        value: "",
        readonly: true,
        inherited: "Platform",
      },
      {
        key: "MODEL",
        type: "string",
        value: "",
        readonly: true,
        inherited: "Not set",
      },
      {
        key: "RETRIES",
        type: "number",
        value: "0",
        readonly: false,
        inherited: "",
      },
      {
        key: "VERBOSE",
        type: "boolean",
        value: "",
        readonly: false,
        inherited: "Your environment",
      },
      {
        key: "TOKEN",
        type: "string",
        value: "",
        readonly: false,
        inherited: "Not set",
      },
    ]);
    finish();
  }));

  it("shows an inherited value but never a secret", fakeAsync(() => {
    setup();

    const placeholder = (key: string) =>
      (row(key).querySelector("input.value") as HTMLInputElement).placeholder;

    expect(placeholder("VERBOSE")).toBe("true");
    expect(placeholder("OPENAI_KEY")).toBe("Stored");
    expect(placeholder("API_URL")).toBe("Stored");
    finish();
  }));

  it("fixes names and types to the node declarations", fakeAsync(() => {
    setup();

    expect(
      (row("RETRIES").querySelector("input.key") as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(
      (row("RETRIES").querySelector("select.type") as HTMLSelectElement)
        .disabled,
    ).toBe(true);
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

    expect(
      (row("OPENAI_KEY").querySelector("input.value") as HTMLInputElement)
        .placeholder,
    ).toBe("sk-shown");
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
