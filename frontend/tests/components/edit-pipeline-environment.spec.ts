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
import { ActivatedRoute, provideRouter, RouterLink } from "@angular/router";
import { of } from "rxjs";
import { EditPipelineEnvironmentComponent } from "src/app/edit-pipeline-environment/edit-pipeline-environment.component";
import { Environment } from "src/models/environment";
import { Project } from "src/models/project";
import { PipelineEnvironmentPipe } from "src/pipes/pipeline-environment";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { TickerPipe } from "src/ui-kit/pipes/ticker.pipe";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toInstance, toPlain } from "src/utils/models";
import { projectA, projectWith } from "../fixtures/models";
import { Plain, smallGraphPipeline } from "../fixtures/plain";
import { provideTestConfig } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import { finish } from "../helpers/editor";
import { asJitPipes } from "../helpers/jit";
import { editJson, JsonEditorStubComponent } from "../helpers/json-editor-stub";

/**
 * Wire contracts (backend/api/environment):
 * - GET /api/me/environment → `{ variables }` (MeEnvironmentResolver);
 * - PUT /api/me/environment `{ variables }` merges into the user environment;
 * - the project tab never deletes the user environment; its Clear drops only
 *   the project's own variables.
 * Pipeline-scoped variables live in `project.environment` and reach the
 * backend through the regular project autosave.
 */
const ENVIRONMENT_URL = "/api/me/environment";

/**
 * Project A (environment `API_URL`, `RETRIES: 0`) whose nodes declare one
 * variable per scope.
 */
function projectWithEnvironment(): Project {
  const pipeline = smallGraphPipeline() as {
    nodes: Record<string, Record<string, unknown>>;
  };
  pipeline.nodes["node_one"]["environment"] = {
    OPENAI_KEY: { title: "OpenAI key", type: "string", scope: "user" },
    API_URL: { title: "API URL", type: "string", scope: "global" },
  };
  pipeline.nodes["node_two"]["environment"] = {
    RETRIES: { title: "Retries", type: "integer", scope: "pipeline" },
  };
  return projectWith(pipeline);
}

function userEnvironment(variables: Plain): Environment {
  return toInstance({ variables }, Environment);
}

describe("EditPipelineEnvironmentComponent", () => {
  let fixture: ComponentFixture<EditPipelineEnvironmentComponent>;
  let controller: HttpTestingController;
  let manager: ProjectManager;
  let element: HTMLElement;

  function setup(
    project: Project = projectWithEnvironment(),
    environment: Environment = userEnvironment({
      OPENAI_KEY: "sk-user",
      API_URL: "http://user.piper.test",
    }),
  ) {
    asJitPipes(TickerPipe, PipelineEnvironmentPipe);
    TestBed.configureTestingModule({
      declarations: [EditPipelineEnvironmentComponent, PipelineEnvironmentPipe],
      imports: [
        ReactiveFormsModule,
        RouterLink,
        UiKitModule,
        JsonEditorStubComponent,
      ],
      providers: [
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

  function editorValue(): object {
    const textarea = element.querySelector(
      "textarea.json-editor-stub",
    ) as HTMLTextAreaElement;
    return JSON.parse(textarea.value);
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

  it("explains that no node needs variables", fakeAsync(() => {
    setup(projectA());

    expect(element.querySelector("form")).toBeNull();
    expect(element.textContent).toContain(
      "No one node has require environment variables.",
    );
    finish();
  }));

  it("shows user variables overridden by the pipeline's own", fakeAsync(() => {
    setup();

    expect(editorValue()).toEqual({
      variables: {
        OPENAI_KEY: "sk-user",
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
      },
    });
    finish();
  }));

  it("saves user and global variables to the user and keeps pipeline ones in the project", fakeAsync(() => {
    const project = setup();
    editJson(element, {
      variables: {
        OPENAI_KEY: "sk-new",
        API_URL: "http://new.piper.test",
        RETRIES: 5,
        UNDECLARED: "dropped",
      },
    });
    fixture.detectChanges();

    button("Save").click();
    const request = controller.expectOne(ENVIRONMENT_URL);
    const busy = button("Save").disabled;
    request.flush(null);
    settle();

    expect(request.request.method).toBe("PUT");
    expect(request.request.body).toEqual({
      variables: { OPENAI_KEY: "sk-new", API_URL: "http://new.piper.test" },
    });
    expect(busy).toBe(true);
    expect(button("Save").disabled).toBe(false);
    expect(toPlain(project.environment)).toEqual({
      variables: { RETRIES: 5 },
    });
    expect(manager.status.value).toBe("dirty");
    finish();
  }));

  it("shows a failed save and leaves the project untouched", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const project = setup();
    const before = toPlain(project.environment);

    button("Save").click();
    controller
      .expectOne(ENVIRONMENT_URL)
      .flush("Wrong environment", { status: 400, statusText: "Bad Request" });
    settle();

    expect(element.querySelector("app-informer").textContent).toContain(
      "Wrong environment",
    );
    expect(toPlain(project.environment)).toEqual(before);
    expect(manager.status.value).toBeNull();
    finish();
  }));

  it("leaves project variables the project doesn't set to the user environment", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.delete("RETRIES");
    setup(project, userEnvironment({ OPENAI_KEY: "sk-user", RETRIES: 9 }));

    // the user value isn't copied in; the editor shows its own default
    expect(editorValue()).toEqual({
      variables: {
        OPENAI_KEY: "sk-user",
        API_URL: "http://dummy.piper.test",
        RETRIES: 0,
      },
    });
    expect(element.querySelector(".inherited").textContent).toContain(
      "RETRIES",
    );
    finish();
  }));

  it("doesn't store emptied variables so they inherit", fakeAsync(() => {
    const project = setup();
    editJson(element, {
      variables: { OPENAI_KEY: "sk-user", API_URL: "", RETRIES: null },
    });
    fixture.detectChanges();

    button("Save").click();
    const request = controller.expectOne(ENVIRONMENT_URL);
    request.flush(null);
    settle();

    expect(request.request.body).toEqual({
      variables: { OPENAI_KEY: "sk-user" },
    });
    expect(toPlain(project.environment)).toEqual({ variables: {} });
    finish();
  }));

  it("keeps inheriting a variable the editor filled with its default", fakeAsync(() => {
    const project = projectWithEnvironment();
    project.environment.variables.delete("RETRIES");
    setup(project, userEnvironment({ RETRIES: 9 }));
    tick();

    button("Save").click();
    controller.expectOne(ENVIRONMENT_URL).flush(null);
    settle();

    expect(toPlain(project.environment)).toEqual({ variables: {} });
    finish();
  }));

  it("clears only the project's own variables", fakeAsync(() => {
    const project = setup();

    button("Clear").click();
    fixture.detectChanges();

    controller.expectNone(ENVIRONMENT_URL);
    expect(toPlain(project.environment)).toEqual({ variables: {} });
    expect(manager.status.value).toBe("dirty");
    expect(editorValue()).toEqual({
      variables: {
        OPENAI_KEY: "sk-user",
        API_URL: "http://user.piper.test",
        RETRIES: 0,
      },
    });
    finish();
  }));
});
