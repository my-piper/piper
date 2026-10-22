import { HttpTestingController } from "@angular/common/http/testing";
import { Component } from "@angular/core";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { AppComponent } from "src/app/app.component";
import { PlayWithProjectComponent } from "src/app/play-with-project/play-with-project.component";
import { ProjectPlaygroundComponent } from "src/app/project-playground/project-playground.component";
import { Launch } from "src/models/launch";
import { Project } from "src/models/project";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { SignalsService } from "src/services/signals.service";
import { toInstance } from "src/utils/models";
import { launchResponsePlain } from "../fixtures/launch-results";
import {
  PROJECT_A_ID,
  PROJECT_B_ID,
  projectAPlain,
  projectBPlain,
  schemaInvalid,
  smallGraphPipeline,
  userPlain,
} from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { expectConsoleError } from "../helpers/console";

/**
 * POST /api/projects/:_id/launch merges this body into the stored launch
 * request (backend/api/projects/launch-project.ts); the costs pipe posts the
 * same request to /api/projects/:_id/launch-costs
 * (backend/api/projects/get-launch-costs.ts) — answered with `null` here.
 */
const UI_DELAY = 250;

/** Pipeline inputs of every scalar type with stored values that are falsy. */
function playgroundProject(base = projectAPlain()): Project {
  const pipeline = smallGraphPipeline() as Record<string, unknown>;
  const flows = { f: { to: "node_one", input: "prompt" } };
  pipeline["inputs"] = {
    topic: { order: 1, title: "Topic", type: "string", required: true, flows },
    flag: { order: 2, title: "Flag", type: "boolean", default: true, flows },
    count: { order: 3, title: "Count", type: "integer", default: 5, flows },
    label: {
      order: 4,
      title: "Label",
      type: "string",
      default: "fallback",
      flows,
    },
    note: { order: 5, title: "Note", type: "string", flows },
  };
  return toInstance(
    {
      ...base,
      pipeline,
      launchRequest: {
        inputs: { topic: "Cats", flag: false, count: 0, label: "" },
        nodes: {},
      },
    },
    Project,
  );
}

describe("ProjectPlaygroundComponent", () => {
  let fixture: ComponentFixture<ProjectPlaygroundComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  let routeData: BehaviorSubject<{ project: Project }>;

  function create(project: Project) {
    routeData.next({ project });
    fixture = TestBed.createComponent(ProjectPlaygroundComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    answerCosts();
    return fixture.componentInstance;
  }

  function setup(project = playgroundProject()) {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule();
    routeData = new BehaviorSubject({ project });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { data: routeData },
    });
    controller = TestBed.inject(HttpTestingController);
    controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
    return create(project);
  }

  function answerCosts() {
    controller
      .match((r) => r.url.endsWith("/launch-costs"))
      .forEach((r) => r.flush(null));
  }

  function field(id: string): HTMLInputElement {
    return element.querySelector(
      `app-edit-input[ng-reflect-id="${id}"] input, app-edit-input[ng-reflect-id="${id}"] textarea`,
    );
  }

  function type(id: string, value: string) {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    answerCosts();
  }

  function runButton(): HTMLButtonElement {
    return element.querySelector("footer button.primary.fluid");
  }

  afterEach(() => controller.verify());

  it("restores stored values, keeping explicit false, zero and empty string", fakeAsync(() => {
    const playground = setup();

    const values = playground.inputsGroup.getRawValue();

    expect(values).toEqual({
      topic: "Cats",
      flag: false,
      count: 0,
      label: "",
      note: null,
    });
    expect(field("topic").value).toBe("Cats");
    expect(field("flag").checked).toBeFalse();
    expect(field("count").value).toBe("0");
    finish();
  }));

  it("falls back to defaults only for absent values", fakeAsync(() => {
    const project = playgroundProject();
    project.launchRequest.inputs.clear();
    const playground = setup(project);

    const values = playground.inputsGroup.getRawValue();

    expect(values).toEqual({
      topic: null,
      flag: true,
      count: 5,
      label: "fallback",
      note: null,
    });
    finish();
  }));

  it("does not submit while a required input is empty", fakeAsync(() => {
    setup();

    type("topic", "");
    runButton().click();

    expect(runButton().disabled).toBeTrue();
    expect(controller.match((r) => r.url.endsWith("/launch")).length).toBe(0);
    finish();
  }));

  it("launches with the form values and announces the launch", fakeAsync(() => {
    setup();
    const signals: unknown[] = [];
    TestBed.inject(SignalsService).feed.subscribe((s) => signals.push(s));
    type("topic", "Dogs");

    runButton().click();
    fixture.detectChanges();
    const request = controller.expectOne(
      `/api/projects/${PROJECT_A_ID}/launch`,
    );
    const busy = runButton().classList.contains("busy");
    request.flush(launchResponsePlain());
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(request.request.body.options).toEqual({ bucket: "artefacts" });
    expect(request.request.body.inputs).toEqual({
      topic: "Dogs",
      flag: false,
      count: 0,
      label: "",
      note: null,
    });
    expect(busy).toBeTrue();
    expect(runButton().classList.contains("busy")).toBeFalse();
    const launched = signals.find(
      (s) => s instanceof PipelineLaunchedSignal,
    ) as PipelineLaunchedSignal;
    expect(launched.launch).toBeInstanceOf(Launch);
    expect(launched.launch._id).toBe("launch_one");
    finish();
  }));

  it("shows launch errors with their details and resets progress", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    setup();
    const { status, statusText, body } = schemaInvalid();

    runButton().click();
    controller
      .expectOne(`/api/projects/${PROJECT_A_ID}/launch`)
      .flush(body, { status, statusText });
    tick(UI_DELAY);
    fixture.detectChanges();

    const informer = element.querySelector("app-informer");
    expect(informer.textContent).toContain("Pipeline schema invalid");
    expect(informer.textContent).toContain("must have required property");
    expect(fixture.componentInstance.progress.launching).toBeFalse();
    finish();
  }));

  it("stores edits per project and restores them for the same project only", fakeAsync(() => {
    setup();
    type("topic", "Stored topic");
    fixture.destroy();

    const again = create(playgroundProject());
    const restored = again.inputsGroup.getRawValue() as Record<string, unknown>;
    fixture.destroy();
    const other = create(playgroundProject(projectBPlain()));
    const isolated = other.inputsGroup.getRawValue() as Record<string, unknown>;

    expect(restored["topic"]).toBe("Stored topic");
    expect(isolated["topic"]).toBe("Cats");
    expect(localStorage.getItem(PROJECT_B_ID)).toBeNull();
    finish();
  }));

  it("does not write playground edits into the project's launch request", fakeAsync(() => {
    const project = playgroundProject();
    setup(project);

    type("topic", "Edited");

    expect(project.launchRequest.inputs.get("topic")).toBe("Cats");
    expect(project.launchRequest.options).toBeUndefined();
    finish();
  }));

  it("resets to the project's values, keeping explicit falsy values", fakeAsync(() => {
    const playground = setup();
    type("topic", "Changed");
    type("count", "7");

    playground.reset();
    fixture.detectChanges();
    answerCosts();

    expect(localStorage.getItem(PROJECT_A_ID)).toBeNull();
    expect(playground.inputsGroup.getRawValue()).toEqual({
      topic: "Cats",
      flag: false,
      count: 0,
      label: "",
      note: null,
    });
    finish();
  }));

  it("removes its window.play hook when destroyed", fakeAsync(() => {
    setup();
    const hook = (window as unknown as { play?: unknown }).play;

    fixture.destroy();

    expect(typeof hook).toBe("function");
    expect((window as unknown as { play?: unknown }).play).toBeUndefined();
    finish();
  }));
});

@Component({ standalone: true, template: "<p>launches</p>" })
class LaunchesOutletStubComponent {}

describe("PlayWithProjectComponent", () => {
  let controller: HttpTestingController;

  function setup() {
    const project = playgroundProject();
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule([
      {
        path: "play/:id",
        component: PlayWithProjectComponent,
        resolve: { project: () => project },
        children: [{ path: "", component: LaunchesOutletStubComponent }],
      },
      { path: "elsewhere", component: LaunchesOutletStubComponent },
    ]);
    controller = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(AppComponent);
    router.navigateByUrl(`/play/${PROJECT_A_ID}`);
    tick();
    fixture.detectChanges();
    controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
    controller
      .match((r) => r.url.endsWith("/launch-costs"))
      .forEach((r) => r.flush(null));
    return { fixture, router, project };
  }

  afterEach(() => controller.verify());

  it("loads the project summary into the comments badge", fakeAsync(() => {
    const { fixture } = setup();

    controller
      .expectOne(`/api/projects/${PROJECT_A_ID}/summary`)
      .flush({ comments: 3 });
    tick(UI_DELAY);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector("h1").textContent).toContain("Project A");
    expect(element.querySelector(".badge").textContent.trim()).toBe("3");
    finish();
  }));

  it("returns to the launches list when a launch is announced", fakeAsync(() => {
    const { router } = setup();
    controller.expectOne(`/api/projects/${PROJECT_A_ID}/summary`).flush({});
    tick(UI_DELAY);
    router.navigateByUrl(`/play/${PROJECT_A_ID}`);
    tick();
    const navigate = spyOn(router, "navigate").and.callThrough();

    TestBed.inject(SignalsService).emit(
      new PipelineLaunchedSignal(toInstance(launchResponsePlain(), Launch)),
    );
    tick();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.calls.mostRecent().args[0]).toEqual(["./"]);
    finish();
  }));

  it("ignores launch announcements after it is destroyed", fakeAsync(() => {
    const { router } = setup();
    controller.expectOne(`/api/projects/${PROJECT_A_ID}/summary`).flush({});
    tick(UI_DELAY);
    router.navigateByUrl("/elsewhere");
    tick();
    const navigate = spyOn(router, "navigate").and.callThrough();

    TestBed.inject(SignalsService).emit(
      new PipelineLaunchedSignal(toInstance(launchResponsePlain(), Launch)),
    );
    tick();

    expect(navigate).not.toHaveBeenCalled();
    expect(router.url).toBe("/elsewhere");
    finish();
  }));
});
