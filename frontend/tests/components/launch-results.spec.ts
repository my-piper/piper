import { HttpTestingController } from "@angular/common/http/testing";
import { Type } from "@angular/core";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { LaunchOutputsComponent } from "src/app/launch-outputs/launch-outputs.component";
import { NodeJobsComponent } from "src/app/node-jobs/node-jobs.component";
import { NodeInputsComponent } from "src/app/node-inputs/node-inputs.component";
import { NodeOutputsComponent } from "src/app/node-outputs/node-outputs.component";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { Launch } from "src/models/launch";
import { toInstance } from "src/utils/models";
import {
  launchWithOutputsPlain,
  nodeStatusPlain,
  PIXEL,
} from "../fixtures/launch-results";
import { launch } from "../fixtures/models";
import { LAUNCH_ID, userPlain } from "../fixtures/plain";
import { configureAppTestingModule, finish } from "../helpers/editor";
import {
  FakeLaunchEvents,
  provideFakeLaunchFeeds,
} from "../helpers/launch-events";
import { seedAuthorization } from "../helpers/config";

/**
 * Node result reads: GET /api/launches/:launch/:node/{inputs,outputs,status}
 * and /api/launches/:launch/nodes/:node/{state,jobs}
 * (backend/api/launches/nodes/*). Node events come from the Launch feed, on a
 * fake event source; the socket side is in unit/services/launch-events.spec.ts.
 */
const UI_DELAY = 250;

describe("LaunchOutputsComponent", () => {
  let fixture: ComponentFixture<LaunchOutputsComponent>;
  let element: HTMLElement;

  function render(plain: object, mode: "card" | "full" = "full") {
    configureAppTestingModule();
    fixture = TestBed.createComponent(LaunchOutputsComponent);
    fixture.componentRef.setInput("mode", mode);
    fixture.componentRef.setInput("launch", toInstance(plain, Launch));
    fixture.detectChanges();
    element = fixture.nativeElement;
  }

  function show(index: number) {
    (element.querySelectorAll("footer button")[index] as HTMLElement).click();
    fixture.detectChanges();
  }

  function result(): HTMLElement {
    return element.querySelector(".results");
  }

  it("renders nothing for a launch without outputs", fakeAsync(() => {
    render({ ...launchWithOutputsPlain(), outputs: {} });

    expect(element.querySelector("footer").children.length).toBe(0);
    expect(result()).toBeNull();
    expect(fixture.componentInstance.active).toBeUndefined();
    finish();
  }));

  it("activates the first output and switches between artefact types", fakeAsync(() => {
    render(launchWithOutputsPlain());

    const text = result().textContent.trim();
    show(1);
    const json = JSON.parse(result().querySelector("pre").textContent);
    show(2);
    const flag = result().textContent.trim();
    show(3);
    const score = result().textContent.trim();

    expect(text).toBe("Hello");
    expect(json).toEqual({ answer: 42 });
    expect(flag).toBe("false");
    expect(score).toBe("0.25");
    expect(element.querySelector("label").textContent).toBe("Score");
    finish();
  }));

  it("shows the original image URL in full mode", fakeAsync(() => {
    render(launchWithOutputsPlain());

    show(4);

    expect(result().querySelector("img").getAttribute("src")).toBe(PIXEL);
  }));

  it("selects an element of an image array by index", fakeAsync(() => {
    render(launchWithOutputsPlain());

    show(6);

    expect(fixture.componentInstance.active).toEqual({
      id: "f_images",
      index: 1,
    });
    const images = result().querySelectorAll("img");
    expect(images.length).toBe(1);
    expect(images[0].getAttribute("src")).toBe(`${PIXEL}#1`);
    finish();
  }));

  it("links card results to the full outputs page with the active selection", fakeAsync(() => {
    render(launchWithOutputsPlain(), "card");

    show(1);

    const link = element.querySelector("a.results");
    expect(link.getAttribute("href")).toBe(
      `/outputs/${LAUNCH_ID}?id=b_json&index=0`,
    );
    finish();
  }));
});

type RouteData = {
  launch: Launch;
  node: {
    id: string;
    node: unknown;
  };
};

/** Components under the node drawer read `{ launch, node: { id, node } }`. */
function setupNodeView<T>(component: Type<T>, id = "node_one") {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule();
  TestBed.configureTestingModule({ providers: provideFakeLaunchFeeds() });
  const current = launch();
  const data = new BehaviorSubject<RouteData>({
    launch: current,
    node: { id, node: current.pipeline.nodes.get(id) },
  });
  TestBed.overrideProvider(ActivatedRoute, { useValue: { data } });
  const controller = TestBed.inject(HttpTestingController);
  const events = TestBed.inject(FakeLaunchEvents);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const select = (node: string) =>
    data.next({
      launch: current,
      node: { id: node, node: current.pipeline.nodes.get(node) },
    });
  return {
    fixture,
    controller,
    events,
    select,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe("NodeOutputsComponent", () => {
  const base = `/api/launches/${LAUNCH_ID}/node_one`;

  function answerInitial(
    controller: HttpTestingController,
    status = nodeStatusPlain("stopped"),
  ) {
    controller.expectOne(`${base}/inputs`).flush({ prompt: "Cats" });
    controller.expectOne(`${base}/outputs`).flush({});
    controller.expectOne(`${base}/status`).flush(status);
  }

  it("loads node results and listens to its launch", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);

    answerInitial(view.controller);
    view.fixture.detectChanges();

    expect(view.events.listeners(LAUNCH_ID)).toBe(1);
    expect(view.element.querySelector("li b").textContent).toBe("Text");
    view.controller.verify();
    finish();
  }));

  it("shows the node error from its status", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);

    answerInitial(view.controller, nodeStatusPlain("error", "Model timeout"));
    view.fixture.detectChanges();

    expect(view.element.querySelector("p.error").textContent).toBe(
      "Model timeout",
    );
    view.controller.verify();
    finish();
  }));

  it("polls the status while the node runs", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    answerInitial(view.controller, nodeStatusPlain("running"));
    view.controller.expectOne(`${base}/progress`).flush(null);

    tick(2000);
    view.controller.expectOne(`${base}/status`).flush(nodeStatusPlain("done"));
    view.controller.expectOne(`${base}/outputs`).flush({ text: "Hi" });
    view.fixture.detectChanges();
    tick(2000);

    expect(view.element.querySelector("li").classList.contains("filled")).toBe(
      true,
    );
    view.controller.verify();
    finish();
  }));

  it("reloads on events for its node and launch only", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    answerInitial(view.controller);

    view.events.emit("launch_other", "done", "node_one");
    view.events.emit(LAUNCH_ID, "done", "node_two");
    const unrelated = view.controller.match(() => true);
    view.events.emit(LAUNCH_ID, "done", "node_one");
    const status = view.controller.match(() => true);
    status.forEach((r) => r.flush(nodeStatusPlain("done")));
    const outputs = view.controller.match(() => true);
    outputs.forEach((r) => r.flush({ text: "Hi" }));
    view.fixture.detectChanges();

    expect(unrelated.length).toBe(0);
    expect(status.map((r) => r.request.url)).toEqual([`${base}/status`]);
    expect(outputs.map((r) => r.request.url)).toEqual([`${base}/outputs`]);
    expect(view.element.querySelector("li").classList.contains("filled")).toBe(
      true,
    );
    view.controller.verify();
    finish();
  }));

  it("switches nodes on one listener for the launch", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    answerInitial(view.controller);

    view.select("node_two");
    view.controller.match(() => true).forEach((r) => r.flush({}));
    view.events.emit(LAUNCH_ID, "flow", "node_one");
    const stale = view.controller.match(() => true);
    view.events.emit(LAUNCH_ID, "flow", "node_two");
    const reloads = view.controller.match(() => true);
    reloads.forEach((r) => r.flush({}));

    expect(view.events.listeners(LAUNCH_ID)).toBe(1);
    expect(stale.length).toBe(0);
    expect(reloads.map((r) => r.request.url)).toEqual([
      `/api/launches/${LAUNCH_ID}/node_two/inputs`,
      `/api/launches/${LAUNCH_ID}/node_two/outputs`,
    ]);
    view.controller.verify();
    finish();
  }));

  it("stops listening when destroyed", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    answerInitial(view.controller);

    view.fixture.destroy();
    view.events.emit(LAUNCH_ID, "done", "node_one");

    expect(view.controller.match(() => true).length).toBe(0);
    expect(view.events.total()).toBe(0);
    finish();
  }));
});

describe("NodeInputsComponent", () => {
  const base = `/api/launches/${LAUNCH_ID}/node_one`;

  it("shows the node's inputs and reloads them when a value flows in", fakeAsync(() => {
    const view = setupNodeView(NodeInputsComponent);
    view.controller.expectOne(`${base}/inputs`).flush({});
    view.controller.expectOne(`${base}/outputs`).flush({});
    view.controller
      .expectOne(`${base}/status`)
      .flush(nodeStatusPlain("stopped"));
    view.fixture.detectChanges();
    const before = view.element.querySelector("li.filled");

    view.events.emit(LAUNCH_ID, "flow", "node_one");
    view.controller.expectOne(`${base}/inputs`).flush({ prompt: "Cats" });
    view.controller.expectOne(`${base}/outputs`).flush({});
    view.fixture.detectChanges();

    expect(before).toBeNull();
    expect(view.element.querySelector("li.filled b").textContent).toBe(
      "Prompt",
    );
    view.controller.verify();
    finish();
  }));
});

const NODE_VIEWS: {
  name: string;
  component: Type<unknown>;
  path: string;
  respond: unknown;
  rendered: (element: HTMLElement) => string;
}[] = [
  {
    name: "NodeStateComponent",
    component: NodeStateComponent,
    path: "state",
    respond: { attempt: 2 },
    rendered: (e) => e.querySelector("pre")?.textContent,
  },
  {
    name: "NodeJobsComponent",
    component: NodeJobsComponent,
    path: "jobs",
    respond: [
      {
        id: 7,
        attemptsMade: 1,
        maxAttempts: 3,
        createdAt: "2026-03-01T12:00:00.000Z",
        result: "ok",
      },
    ],
    rendered: (e) => e.querySelector(".card footer small")?.textContent,
  },
];

for (const view of NODE_VIEWS) {
  describe(view.name, () => {
    const url = `/api/launches/${LAUNCH_ID}/nodes/node_one/${view.path}`;

    function load(setup: ReturnType<typeof setupNodeView>) {
      setup.controller.expectOne(url).flush(view.respond);
      tick(UI_DELAY);
      setup.fixture.detectChanges();
    }

    it("renders the loaded data", fakeAsync(() => {
      const setup = setupNodeView(view.component);

      load(setup);

      const expected: Record<string, string> = {
        state: '{\n  "attempt": 2\n}',
        jobs: "ok",
      };
      expect(view.rendered(setup.element)).toBe(expected[view.path]);
      setup.controller.verify();
      finish();
    }));

    it("reloads when its node repeats in its launch only", fakeAsync(() => {
      const setup = setupNodeView(view.component);
      load(setup);

      setup.events.emit("launch_other", "repeat", "node_one");
      setup.events.emit(LAUNCH_ID, "repeat", "node_two");
      setup.events.emit(LAUNCH_ID, "done", "node_one");
      const unrelated = setup.controller.match(() => true);
      setup.events.emit(LAUNCH_ID, "repeat", "node_one");
      const own = setup.controller.match(url);
      own.forEach((r) => r.flush(view.respond));
      tick(UI_DELAY);

      expect(unrelated.length).toBe(0);
      expect(own.length).toBe(1);
      setup.controller.verify();
      finish();
    }));

    it("listens once even when the selected node changes", fakeAsync(() => {
      const setup = setupNodeView(view.component);
      load(setup);

      setup.select("node_two");
      setup.controller.match(() => true).forEach((r) => r.flush(view.respond));
      tick(UI_DELAY);

      expect(setup.events.listeners(LAUNCH_ID)).toBe(1);
      setup.controller.verify();
      finish();
    }));

    it("ignores events after it is destroyed", fakeAsync(() => {
      const setup = setupNodeView(view.component);
      load(setup);

      setup.fixture.destroy();
      setup.events.emit(LAUNCH_ID, "repeat", "node_one");

      expect(setup.controller.match(() => true).length).toBe(0);
      expect(setup.events.total()).toBe(0);
      finish();
    }));
  });
}
