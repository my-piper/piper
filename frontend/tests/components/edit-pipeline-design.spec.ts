import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ComponentFixture, fakeAsync, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, provideRouter } from "@angular/router";
import { provideTaiga } from "@taiga-ui/core";
import { of } from "rxjs";
import { EditPipelineDesignComponent } from "src/app/edit-pipeline-design/edit-pipeline-design.component";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { projectA } from "../fixtures/models";
import { provideTestConfig } from "../helpers/config";
import { finish } from "../helpers/editor";

/**
 * Route data: `project`. The tab edits the Pipeline's name, description,
 * tags and version, and the name also becomes the Project's title; the
 * change reaches the backend through the regular project autosave
 * (`ProjectManager.markDirty`), so the tab never calls the API itself.
 * `backend/schemas/pipeline.json` requires a name of 5 to 160 characters and
 * a version.
 */
describe("EditPipelineDesignComponent", () => {
  let fixture: ComponentFixture<EditPipelineDesignComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;
  let markDirty: ReturnType<typeof vi.spyOn>;

  function setup(project: Project = projectA()) {
    TestBed.configureTestingModule({
      declarations: [EditPipelineDesignComponent],
      imports: [ReactiveFormsModule, TaigaFormsModule],
      providers: [
        provideTaiga(),
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { data: of({ project }) } },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    const manager = TestBed.inject(ProjectManager);
    manager.project = project;
    markDirty = vi.spyOn(manager, "markDirty").mockImplementation(() => {});
    fixture = TestBed.createComponent(EditPipelineDesignComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    return project;
  }

  function field<T extends HTMLElement>(name: string): T {
    return element.querySelector<T>(`[formControlName=${name}]`);
  }

  function type(name: string, value: string) {
    const input = field<HTMLInputElement>(name);
    input.value = value;
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
  }

  /** Types a tag into the focused chip input and confirms it with Enter. */
  function addTag(tag: string) {
    const input = field<HTMLInputElement>("tags");
    input.focus();
    input.value = tag;
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    fixture.detectChanges();
  }

  /** The tag chips' labels, without their "Remove" buttons. */
  function chips() {
    return Array.from(element.querySelectorAll("tui-input-chip")).map((c) =>
      c.textContent.replace("Remove", "").trim(),
    );
  }

  afterEach(() => controller.verify());

  it("shows the pipeline's name, description, tags and version", fakeAsync(() => {
    setup();

    expect(field<HTMLInputElement>("name").value).toBe("Small graph");
    expect(field<HTMLTextAreaElement>("description").value).toBe(
      "Two node fixture",
    );
    expect(chips()).toEqual(["fixture"]);
    expect(field<HTMLInputElement>("version").value).toBe("1");
    expect(element.querySelector("app-json-editor")).toBeNull();
    finish();
  }));

  it("writes an edited name to the pipeline and the project title", fakeAsync(() => {
    const project = setup();

    type("name", "Renamed graph");

    expect(project.pipeline.name).toBe("Renamed graph");
    expect(project.title).toBe("Renamed graph");
    expect(markDirty).toHaveBeenCalledTimes(1);
    finish();
  }));

  it("writes an edited description and version to the pipeline", fakeAsync(() => {
    const project = setup();

    type("description", "Now with more nodes");
    type("version", "2");

    expect(project.pipeline.description).toBe("Now with more nodes");
    expect(project.pipeline.version).toBe(2);
    expect(markDirty).toHaveBeenCalledTimes(2);
    finish();
  }));

  it("adds a typed tag to the pipeline", fakeAsync(() => {
    const project = setup();

    addTag("beta");

    expect(project.pipeline.tags).toEqual(["fixture", "beta"]);
    expect(chips()).toEqual(["fixture", "beta"]);
    expect(markDirty).toHaveBeenCalledTimes(1);
    // the focused chip input leaves Taiga timers running until destroyed
    fixture.destroy();
    finish();
  }));

  it("keeps fields the tab does not show", fakeAsync(() => {
    const project = projectA();
    project.pipeline.thumbnail = "https://cdn.piper.test/thumb.png";
    project.pipeline.url = "https://cdn.piper.test/pipeline.yaml";
    setup(project);

    type("description", "Changed");

    expect(project.pipeline.thumbnail).toBe("https://cdn.piper.test/thumb.png");
    expect(project.pipeline.url).toBe("https://cdn.piper.test/pipeline.yaml");
    finish();
  }));

  it("does not save a name shorter than five characters", fakeAsync(() => {
    const project = setup();

    type("name", "Abc");

    expect(project.pipeline.name).toBe("Small graph");
    expect(project.title).toBe("Project A");
    expect(element.textContent).toContain("Use 5 to 160 characters");
    expect(markDirty).toHaveBeenCalledTimes(0);
    finish();
  }));

  it("does not save without a version", fakeAsync(() => {
    const project = setup();

    type("version", "");

    expect(project.pipeline.version).toBe(1);
    expect(element.textContent).toContain("Enter a version");
    expect(markDirty).toHaveBeenCalledTimes(0);
    finish();
  }));
});
