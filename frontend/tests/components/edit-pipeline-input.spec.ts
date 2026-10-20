import {
  ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing";
import { EditPipelineInputComponent } from "src/app/edit-pipeline-input/edit-pipeline-input.component";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { toInstance } from "src/utils/models";
import { projectA } from "../fixtures/models";
import { configureAppTestingModule } from "../helpers/editor";

/** valueChanges debounce in EditPipelineInputComponent. */
const INPUT_DEBOUNCE = 500;

describe("EditPipelineInputComponent", () => {
  let project: Project;
  let manager: ProjectManager;

  function render(
    id: string,
    input: object,
  ): ComponentFixture<EditPipelineInputComponent> {
    project.pipeline.inputs.set(id, toInstance(input, PipelineInput));
    const fixture = TestBed.createComponent(EditPipelineInputComponent);
    Object.assign(fixture.componentInstance, {
      id,
      input: project.pipeline.inputs.get(id),
      project,
      launchRequest: project.launchRequest,
    });
    fixture.detectChanges();
    return fixture;
  }

  function field(fixture: ComponentFixture<unknown>): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelector("input");
  }

  function type(fixture: ComponentFixture<unknown>, value: string) {
    const input = field(fixture);
    input.value = value;
    input.dispatchEvent(new Event("input"));
    tick(INPUT_DEBOUNCE);
  }

  function finish() {
    discardPeriodicTasks();
    flush();
  }

  beforeEach(() => {
    configureAppTestingModule();
    project = projectA();
    manager = TestBed.inject(ProjectManager);
    manager.project = project;
  });

  it("stores a typed value in the launch request and marks the project dirty", fakeAsync(() => {
    const fixture = render("topic", {
      type: "string",
      default: "Dogs",
      flows: {},
      arrange: { x: 0, y: 0 },
    });

    type(fixture, "Birds");

    expect(project.launchRequest.inputs.get("topic")).toBe("Birds");
    expect(manager.status.value).toBe("dirty");
    finish();
  }));

  it("drops a value equal to the default", fakeAsync(() => {
    const fixture = render("topic", {
      type: "string",
      default: "Cats",
      flows: {},
      arrange: { x: 0, y: 0 },
    });

    type(fixture, "Cats");

    expect(project.launchRequest.inputs.has("topic")).toBeFalse();
    finish();
  }));

  it("shows a stored explicit zero instead of the default", fakeAsync(() => {
    project.launchRequest.inputs.set("size", 0);

    const fixture = render("size", {
      type: "integer",
      default: 5,
      flows: {},
      arrange: { x: 0, y: 0 },
    });

    expect(field(fixture).value).toBe("0");
    finish();
  }));

  it("stores an explicit zero that differs from the default", fakeAsync(() => {
    const fixture = render("size", {
      type: "integer",
      default: 5,
      flows: {},
      arrange: { x: 0, y: 0 },
    });

    type(fixture, "0");

    expect(project.launchRequest.inputs.get("size")).toBe(0);
    finish();
  }));

  it("stores an explicit empty string that differs from the default", fakeAsync(() => {
    const fixture = render("note", {
      type: "string",
      default: "hello",
      flows: {},
      arrange: { x: 0, y: 0 },
    });

    type(fixture, "");

    expect(project.launchRequest.inputs.get("note")).toBe("");
    finish();
  }));

  it("stores false for a boolean defaulting to true and restores it", fakeAsync(() => {
    const input = {
      type: "boolean",
      default: true,
      flows: {},
      arrange: { x: 0, y: 0 },
    };
    const fixture = render("enabled", input);

    field(fixture).click();
    tick(INPUT_DEBOUNCE);
    const reloaded = render("enabled", input);

    expect(project.launchRequest.inputs.get("enabled")).toBe(false);
    expect(field(reloaded).checked).toBeFalse();
    finish();
  }));

  it("leaves other launch inputs untouched", fakeAsync(() => {
    const before = new Map(project.launchRequest.inputs);
    const fixture = render("size", {
      type: "integer",
      default: 5,
      flows: {},
      arrange: { x: 0, y: 0 },
    });

    type(fixture, "7");

    for (const [key, value] of before) {
      expect(project.launchRequest.inputs.get(key)).toBe(value);
    }
    expect(project.launchRequest.inputs.get("size")).toBe(7);
    finish();
  }));
});
