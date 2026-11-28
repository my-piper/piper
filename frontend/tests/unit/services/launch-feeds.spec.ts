import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  fakeAsync,
  flushMicrotasks,
  TestBed,
  tick,
} from "@angular/core/testing";
import { LaunchFeeds } from "src/services/launch-feeds";
import { LAUNCH_ID } from "../../fixtures/plain";
import { provideTestConfig } from "../../helpers/config";
import { expectConsoleError } from "../../helpers/console";
import {
  FakeLaunchEvents,
  provideFakeLaunchFeeds,
} from "../../helpers/launch-events";

/**
 * Node reads: GET /api/launches/:launch/:node/{inputs,outputs,status,progress}
 * (backend/api/launches/nodes/*).
 */
const base = (node: string) => `/api/launches/${LAUNCH_ID}/${node}`;

const GRAPH = {
  nodes: ["node_one", "node_two"],
  flows: [{ from: "node_one", to: "node_two" }],
  start: ["node_one"],
};

let feeds: LaunchFeeds;
let events: FakeLaunchEvents;
let controller: HttpTestingController;

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideTestConfig(),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      provideFakeLaunchFeeds(),
    ],
  });
  feeds = TestBed.inject(LaunchFeeds);
  events = TestBed.inject(FakeLaunchEvents);
  controller = TestBed.inject(HttpTestingController);
}

/** Answers a node's first reads; a `null` status means it has not run. */
function answerStart(node: string, status: object | null = null) {
  controller.expectOne(`${base(node)}/inputs`).flush({ prompt: "Cats" });
  controller.expectOne(`${base(node)}/outputs`).flush({});
  controller.expectOne(`${base(node)}/status`).flush(status);
}

describe("LaunchFeeds", () => {
  it("loads a watched node once for every watcher", fakeAsync(() => {
    setup();

    const card = feeds.watch(LAUNCH_ID, "node_one");
    const drawer = feeds.watch(LAUNCH_ID, "node_one");
    answerStart("node_one", { state: "error", error: "Boom" });

    expect(card.inputs()).toEqual({ prompt: "Cats" });
    expect(drawer.status()?.error).toBe("Boom");
    expect(events.listeners(LAUNCH_ID)).toBe(1);
    controller.verify();
    card.release();
    drawer.release();
    flushMicrotasks();
  }));

  it("polls a running node until it is done and hands over its outputs", fakeAsync(() => {
    setup();
    const node = feeds.watch(LAUNCH_ID, "node_one");
    const done: object[] = [];
    node.done.subscribe((outputs) => done.push(outputs));
    answerStart("node_one", { state: "running" });
    controller
      .expectOne(`${base("node_one")}/progress`)
      .flush({ total: 4, processed: 1 });

    tick(2000);
    controller.expectOne(`${base("node_one")}/status`).flush({ state: "done" });
    controller.expectOne(`${base("node_one")}/outputs`).flush({ text: "Hi" });
    tick(2000);

    expect(node.progress()?.processed).toBe(1);
    expect(node.state()).toBe("done");
    expect(node.outputs()).toEqual({ text: "Hi" });
    expect(done).toEqual([{ text: "Hi" }]);
    controller.verify();
    node.release();
    flushMicrotasks();
  }));

  it("keeps one status check going when an event arrives during a poll", fakeAsync(() => {
    setup();
    const node = feeds.watch(LAUNCH_ID, "node_one");
    answerStart("node_one", { state: "running" });
    controller.expectOne(`${base("node_one")}/progress`).flush(null);
    tick(2000);
    const poll = controller.expectOne(`${base("node_one")}/status`);

    events.emit(LAUNCH_ID, "running", "node_one");
    const check = controller.expectOne(`${base("node_one")}/status`);
    check.flush({ state: "running" });
    controller.expectOne(`${base("node_one")}/progress`).flush(null);
    tick(2000);
    const next = controller.match(`${base("node_one")}/status`);
    next.forEach((r) => r.flush({ state: "error" }));

    expect(poll.cancelled).toBe(true);
    expect(next.length).toBe(1);
    expect(node.state()).toBe("error");
    controller.verify();
    node.release();
    flushMicrotasks();
  }));

  it("keeps the inputs it has when reloading them fails", fakeAsync(() => {
    expectConsoleError("Process HTTP error 500");
    setup();
    const node = feeds.watch(LAUNCH_ID, "node_one");
    answerStart("node_one");

    events.emit(LAUNCH_ID, "reset", "node_one");
    controller
      .expectOne(`${base("node_one")}/inputs`)
      .flush("Boom", { status: 500, statusText: "Server Error" });

    expect(node.inputs()).toEqual({ prompt: "Cats" });
    controller.verify();
    node.release();
    flushMicrotasks();
  }));

  it("follows a node through the queue and its inputs into the launch state", fakeAsync(() => {
    setup();
    const launch = feeds.open(LAUNCH_ID);
    const one = feeds.watch(LAUNCH_ID, "node_one");
    const two = feeds.watch(LAUNCH_ID, "node_two");
    answerStart("node_one", { state: "done" });
    controller.expectOne(`${base("node_one")}/outputs`).flush({});
    answerStart("node_two");
    const skipped = launch.launchState(GRAPH);

    events.emit(LAUNCH_ID, "flow", "node_two");
    const queued = { node: two.state(), launch: launch.launchState(GRAPH) };
    controller.expectOne(`${base("node_two")}/inputs`).flush({});
    controller.expectOne(`${base("node_two")}/outputs`).flush({});
    events.emit(LAUNCH_ID, "not_ready", "node_two");

    expect(skipped).toBe("done");
    expect(queued).toEqual({ node: "queued", launch: "running" });
    expect(two.state()).toBe("waiting");
    expect(launch.launchState(GRAPH)).toBe("idle");
    expect(launch.states()).toEqual({ node_one: "done", node_two: "waiting" });
    controller.verify();
    [launch, one, two].forEach((feed) => feed.release());
    flushMicrotasks();
  }));

  it("drops a node's state after its last watcher, and stops polling it", fakeAsync(() => {
    setup();
    const launch = feeds.open(LAUNCH_ID);
    const node = feeds.watch(LAUNCH_ID, "node_one");
    answerStart("node_one", { state: "running" });
    controller.expectOne(`${base("node_one")}/progress`).flush(null);

    node.release();
    node.release();
    const kept = launch.states();
    flushMicrotasks();
    tick(2000);
    events.emit(LAUNCH_ID, "running", "node_one");

    expect(kept).toEqual({ node_one: "running" });
    expect(launch.states()).toEqual({});
    expect(launch.launchState(GRAPH)).toBeNull();
    controller.verify();
    launch.release();
  }));

  it("passes a launch's events by node and type, and stops listening after the last release", fakeAsync(() => {
    setup();
    const seen: string[] = [];
    const subscription = feeds
      .events(LAUNCH_ID, "node_one", ["repeat", "done"])
      .subscribe(({ type, node }) => seen.push(`${type}:${node}`));
    const peeked = feeds.peek(LAUNCH_ID) !== null;

    events.emit(LAUNCH_ID, "repeat", "node_one");
    events.emit(LAUNCH_ID, "repeat", "node_two");
    events.emit(LAUNCH_ID, "progress", "node_one");
    events.emit("launch_other", "done", "node_one");
    subscription.unsubscribe();

    expect(peeked).toBe(true);
    expect(seen).toEqual(["repeat:node_one"]);
    expect(events.total()).toBe(0);
    expect(feeds.peek(LAUNCH_ID)).toBeNull();
  }));
});
