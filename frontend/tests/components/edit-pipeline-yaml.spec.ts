import { provideHttpClient, withXhr } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import {
  ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, provideRouter } from "@angular/router";
import { cloneDeep } from "lodash";
import { patch } from "jsondiffpatch/with-text-diffs";
import { of } from "rxjs";
import { EditPipelineYamlComponent } from "src/app/edit-pipeline-yaml/edit-pipeline-yaml.component";
import { SubmitButtonDirective } from "src/directives/submit-button.directive";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { Ajv, ajvFactory } from "src/providers/ajv";
import { ProjectManager } from "src/services/project.manager";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toPlain } from "src/utils/models";
import * as YAML from "yaml";
import { projectA } from "../fixtures/models";
import { patchResponsePlain } from "../fixtures/plain";
import { provideTestConfig } from "../helpers/config";
import { MonacoEditorStubComponent, typeInto } from "../helpers/editor-stubs";
import {
  AUTOSAVE_DELAY,
  expectPatch,
  UI_DELAY,
} from "../helpers/project-manager";
import { HttpTestingController } from "@angular/common/http/testing";

describe("EditPipelineYamlComponent", () => {
  let project: Project;
  let fixture: ComponentFixture<EditPipelineYamlComponent>;
  let manager: ProjectManager;
  let element: HTMLElement;

  function editor(): HTMLTextAreaElement {
    return element.querySelector("textarea.monaco-stub");
  }

  function save() {
    (element.querySelector("footer button") as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function finish() {
    discardPeriodicTasks();
    flush();
  }

  beforeEach(() => {
    project = projectA();
    TestBed.configureTestingModule({
      declarations: [EditPipelineYamlComponent, SubmitButtonDirective],
      imports: [ReactiveFormsModule, UiKitModule, MonacoEditorStubComponent],
      providers: [
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: Ajv, useFactory: ajvFactory },
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        { provide: ActivatedRoute, useValue: { data: of({ project }) } },
      ],
    });
    manager = TestBed.inject(ProjectManager);
    manager.project = project;
    fixture = TestBed.createComponent(EditPipelineYamlComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  it("loads the current pipeline as YAML", () => {
    const parsed = YAML.parse(editor().value);

    expect(editor().dataset["language"]).toBe("yaml");
    expect(parsed).toEqual(toPlain(project.pipeline));
  });

  it("loads launch request and environment as JSON", () => {
    const { launchRequest, environment } =
      fixture.componentInstance.form.getRawValue();

    expect(JSON.parse(launchRequest)).toEqual(toPlain(project.launchRequest));
    expect(JSON.parse(environment)).toEqual({
      variables: { API_URL: "http://dummy.piper.test", RETRIES: 0 },
    });
  });

  it("applies a valid YAML edit to the project and saves it as a patch", fakeAsync(() => {
    const controller = TestBed.inject(HttpTestingController);
    const baseline = cloneDeep(toPlain(project.pipeline));
    const plain = YAML.parse(editor().value);
    plain.nodes.node_one.title = "Renamed";
    plain.nodes.node_two.inputs.count.default = 0;

    typeInto(editor(), YAML.stringify(plain));
    save();
    tick(AUTOSAVE_DELAY);
    const request = expectPatch(controller, "project_aaaa", "rev_a_1");
    const body = request.request.body as {
      pipeline: object;
    };
    request.flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);

    expect(project.pipeline.nodes.get("node_one")).toBeInstanceOf(Node);
    expect(project.pipeline.nodes.get("node_one").title).toBe("Renamed");
    expect(
      project.pipeline.nodes.get("node_two").inputs.get("count").default,
    ).toBe(0);
    expect(patch(baseline, body.pipeline as never)).toEqual(
      toPlain(project.pipeline),
    );
    expect(project.revision).toBe("rev_a_2");
    controller.verify();
    finish();
  }));

  it("keeps the graph and shows an error for invalid YAML syntax", fakeAsync(() => {
    const pipeline = project.pipeline;
    const before = toPlain(pipeline);

    typeInto(editor(), "nodes: [unclosed");
    save();

    expect(project.pipeline).toBe(pipeline);
    expect(toPlain(project.pipeline)).toEqual(before);
    expect(manager.status.value).toBeNull();
    expect(element.querySelector("app-informer")).not.toBeNull();
    finish();
  }));

  it("rejects YAML that violates the pipeline schema without a partial update", fakeAsync(() => {
    const before = toPlain(project.pipeline);
    const plain = YAML.parse(editor().value);
    delete plain.nodes.node_one.title;

    typeInto(editor(), YAML.stringify(plain));
    save();

    expect(toPlain(project.pipeline)).toEqual(before);
    expect(project.title).toBe("Project A");
    expect(manager.status.value).toBeNull();
    expect(element.querySelector("app-informer").textContent).toContain(
      "title",
    );
    finish();
  }));

  it("treats Piper v1's secret placeholder in a pasted environment as no value", fakeAsync(() => {
    const controller = TestBed.inject(HttpTestingController);
    project.environment.variables.set("API_KEY", "[encrypted]");
    fixture.componentInstance.form.patchValue({
      environment: JSON.stringify({
        variables: {
          API_KEY: "[hidden]",
          NEW_KEY: "[hidden]",
          API_URL: "http://dummy.piper.test",
        },
      }),
    });

    save();
    tick(AUTOSAVE_DELAY);
    expectPatch(controller, "project_aaaa", "rev_a_1").flush(
      patchResponsePlain("rev_a_2"),
    );
    tick(UI_DELAY);

    expect(Object.fromEntries(project.environment.variables)).toEqual({
      API_KEY: "[encrypted]",
      API_URL: "http://dummy.piper.test",
    });
    controller.verify();
    finish();
  }));

  it("renames the ArtWorks Variables of a pasted Piper v1 environment", fakeAsync(() => {
    const controller = TestBed.inject(HttpTestingController);
    project.environment.variables.set("OPEN_PAAS_PASSWORD", "[encrypted]");
    fixture.componentInstance.form.patchValue({
      environment: JSON.stringify({
        variables: {
          OPEN_PAAS_USER: "artist",
          OPEN_PAAS_PASSWORD: "[hidden]",
          PAAS_BASE_URL: "http://dummy.piper.test",
        },
      }),
    });

    save();
    tick(AUTOSAVE_DELAY);
    expectPatch(controller, "project_aaaa", "rev_a_1").flush(
      patchResponsePlain("rev_a_2"),
    );
    tick(UI_DELAY);

    expect(Object.fromEntries(project.environment.variables)).toEqual({
      ARTWORKS_USER: "artist",
      ARTWORKS_PASSWORD: "[encrypted]",
      ARTWORKS_URL: "http://dummy.piper.test",
    });
    controller.verify();
    finish();
  }));

  it("keeps a secret under its current name when its v1 namesake is shown back", fakeAsync(() => {
    const controller = TestBed.inject(HttpTestingController);
    project.environment.variables.set("OPEN_PAAS_PASSWORD", "shown");
    project.environment.variables.set("ARTWORKS_PASSWORD", "[encrypted]");
    project.environment.visible = ["OPEN_PAAS_PASSWORD"];
    fixture.componentInstance.form.patchValue({
      environment: JSON.stringify({
        variables: {
          OPEN_PAAS_PASSWORD: "shown",
          ARTWORKS_PASSWORD: "[encrypted]",
        },
        visible: ["OPEN_PAAS_PASSWORD"],
      }),
    });

    save();
    tick(AUTOSAVE_DELAY);
    expectPatch(controller, "project_aaaa", "rev_a_1").flush(
      patchResponsePlain("rev_a_2"),
    );
    tick(UI_DELAY);

    expect(Object.fromEntries(project.environment.variables)).toEqual({
      ARTWORKS_PASSWORD: "[encrypted]",
    });
    expect(project.environment.visible).toEqual([]);
    controller.verify();
    finish();
  }));

  it("rejects invalid launch request JSON without touching the pipeline", fakeAsync(() => {
    const before = toPlain(project);
    fixture.componentInstance.form.patchValue({ launchRequest: "{ nope" });

    save();

    expect(toPlain(project)).toEqual(before);
    expect(element.querySelector("app-informer")).not.toBeNull();
    finish();
  }));
});
