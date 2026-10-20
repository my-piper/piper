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
import { NodeLogsComponent } from "src/app/node-logs/node-logs.component";
import { NodeOutputsComponent } from "src/app/node-outputs/node-outputs.component";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { Launch } from "src/models/launch";
import { LiveService } from "src/services/live.service";
import { toInstance } from "src/utils/models";
import {
  launchWithOutputsPlain,
  nodeStatusPlain,
  PIXEL,
} from "../fixtures/launch-results";
import { launch } from "../fixtures/models";
import { LAUNCH_ID, SOCKET_EVENTS } from "../fixtures/plain";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { SocketDouble } from "../helpers/socket";

/**
 * Node result reads: GET /api/launches/:launch/:node/{inputs,outputs,status}
 * and /api/launches/:launch/nodes/:node/{state,logs,jobs}
 * (backend/api/launches/nodes/*). Node events arrive in the launch room as
 * `{ launch, node }` (backend/jobs/process-node/process-node-handler.ts).
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
  node: { id: string; node: unknown };
};

/** Components under the node drawer read `{ launch, node: { id, node } }`. */
function setupNodeView<T>(component: Type<T>, id = "node_one") {
  configureAppTestingModule();
  const current = launch();
  const data = new BehaviorSubject<RouteData>({
    launch: current,
    node: { id, node: current.pipeline.nodes.get(id) },
  });
  TestBed.overrideProvider(ActivatedRoute, { useValue: { data } });
  const controller = TestBed.inject(HttpTestingController);
  const socket = TestBed.inject(SocketDouble);
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
    socket,
    select,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe("NodeOutputsComponent", () => {
  const base = `/api/launches/${LAUNCH_ID}/node_one`;

  function answerInitial(
    controller: HttpTestingController,
    status = nodeStatusPlain("running"),
  ) {
    controller.expectOne(`${base}/inputs`).flush({ prompt: "Cats" });
    controller.expectOne(`${base}/outputs`).flush({});
    controller.expectOne(`${base}/status`).flush(status);
  }

  it("loads node results and joins the launch room", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);

    answerInitial(view.controller);
    view.fixture.detectChanges();

    expect(view.socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      LAUNCH_ID,
    ]);
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

  it("reloads on events for its node and launch only", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    answerInitial(view.controller);

    view.socket.receive("node_done", {
      launch: "launch_other",
      node: "node_one",
    });
    view.socket.receive("node_done", { launch: LAUNCH_ID, node: "node_two" });
    const unrelated = view.controller.match(() => true);
    view.socket.receive("node_done", { launch: LAUNCH_ID, node: "node_one" });
    const own = view.controller.match(() => true);
    own.forEach((r) =>
      r.flush(
        r.request.url.endsWith("/status")
          ? nodeStatusPlain("done")
          : { text: "Hi" },
      ),
    );
    view.fixture.detectChanges();

    expect(unrelated.length).toBe(0);
    expect(own.map((r) => r.request.url).sort()).toEqual([
      `${base}/outputs`,
      `${base}/status`,
    ]);
    expect(
      view.element.querySelector("li").classList.contains("filled"),
    ).toBeTrue();
    view.controller.verify();
    finish();
  }));

  it("switches nodes without stacking rooms or listeners", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    const live = TestBed.inject(LiveService);
    answerInitial(view.controller);
    const listeners = view.socket.listenerCount();

    view.select("node_two");
    view.controller.match(() => true).forEach((r) => r.flush({}));
    view.socket.receive("node_flow", { launch: LAUNCH_ID, node: "node_two" });
    const reloads = view.controller.match(() => true);
    reloads.forEach((r) => r.flush({}));

    expect(view.socket.listenerCount()).toBe(listeners);
    expect(reloads.map((r) => r.request.url)).toEqual([
      `/api/launches/${LAUNCH_ID}/node_two/inputs`,
    ]);
    expect(live.rooms.get(LAUNCH_ID).size).toBe(1);
    view.controller.verify();
    finish();
  }));

  it("stops listening and leaves the room when destroyed", fakeAsync(() => {
    const view = setupNodeView(NodeOutputsComponent);
    answerInitial(view.controller);

    view.fixture.destroy();
    view.socket.receive("node_done", { launch: LAUNCH_ID, node: "node_one" });

    expect(view.controller.match(() => true).length).toBe(0);
    expect(view.socket.listenerCount()).toBe(0);
    expect(view.socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      LAUNCH_ID,
    ]);
    finish();
  }));
});

const NODE_VIEWS: {
  name: string;
  component: Type<unknown>;
  path: string;
  events: string[];
  respond: unknown;
  rendered: (element: HTMLElement) => string;
}[] = [
  {
    name: "NodeStateComponent",
    component: NodeStateComponent,
    path: "state",
    events: ["node_gonna_repeat"],
    respond: { attempt: 2 },
    rendered: (e) => e.querySelector("pre")?.textContent,
  },
  {
    name: "NodeLogsComponent",
    component: NodeLogsComponent,
    path: "logs",
    events: ["node_gonna_repeat", "node_error", "node_done"],
    respond: [
      { level: "info", message: "started", job: 7, attempt: 0 },
      { level: "error", message: "failed", job: 7, attempt: 0 },
    ],
    rendered: (e) =>
      Array.from(e.querySelectorAll("p, pre"))
        .map((x) => x.textContent.trim())
        .join("|"),
  },
  {
    name: "NodeJobsComponent",
    component: NodeJobsComponent,
    path: "jobs",
    events: ["node_gonna_repeat"],
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
        logs: "Job 7 attempt 1|started|failed",
        jobs: "ok",
      };
      expect(view.rendered(setup.element)).toBe(expected[view.path]);
      setup.controller.verify();
      finish();
    }));

    it("reloads on its node's events from its launch only", fakeAsync(() => {
      const setup = setupNodeView(view.component);
      load(setup);

      for (const event of view.events) {
        setup.socket.receive(event, {
          launch: "launch_other",
          node: "node_one",
        });
        setup.socket.receive(event, { launch: LAUNCH_ID, node: "node_two" });
      }
      const unrelated = setup.controller.match(() => true);
      setup.socket.receive(view.events[0], {
        launch: LAUNCH_ID,
        node: "node_one",
      });
      const own = setup.controller.match(url);
      own.forEach((r) => r.flush(view.respond));
      tick(UI_DELAY);

      expect(unrelated.length).toBe(0);
      expect(own.length).toBe(1);
      setup.controller.verify();
      finish();
    }));

    it("subscribes once even when the selected node changes", fakeAsync(() => {
      const setup = setupNodeView(view.component);
      load(setup);
      const listeners = setup.socket.listenerCount();

      setup.select("node_two");
      setup.controller.match(() => true).forEach((r) => r.flush(view.respond));
      tick(UI_DELAY);

      expect(setup.socket.listenerCount()).toBe(listeners);
      setup.controller.verify();
      finish();
    }));

    it("ignores events after it is destroyed", fakeAsync(() => {
      const setup = setupNodeView(view.component);
      load(setup);

      setup.fixture.destroy();
      for (const event of view.events) {
        setup.socket.receive(event, { launch: LAUNCH_ID, node: "node_one" });
      }

      expect(setup.controller.match(() => true).length).toBe(0);
      expect(setup.socket.listenerCount()).toBe(0);
      finish();
    }));
  });
}
