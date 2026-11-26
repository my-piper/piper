import {
  HttpTestingController,
  TestRequest,
} from "@angular/common/http/testing";
import { ComponentFixture, fakeAsync, TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { LaunchLogsComponent } from "src/app/launch-logs/launch-logs.component";
import { launchLogsPlain } from "../fixtures/launch-results";
import { launch } from "../fixtures/models";
import { LAUNCH_ID, SOCKET_EVENTS } from "../fixtures/plain";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { SocketDouble } from "../helpers/socket";

/**
 * GET /api/launches/:launch/logs?node= (backend/api/launches/launch-logs.ts).
 * Node events arrive in the launch room as `{ launch, node }`.
 */
const URL = `/api/launches/${LAUNCH_ID}/logs`;

let fixture: ComponentFixture<LaunchLogsComponent>;
let element: HTMLElement;
let controller: HttpTestingController;
let socket: SocketDouble;

function render(node?: string) {
  configureAppTestingModule();
  const current = launch();
  const data = new BehaviorSubject<object>({
    launch: current,
    ...(node
      ? { node: { id: node, node: current.pipeline.nodes.get(node) } }
      : {}),
  });
  TestBed.overrideProvider(ActivatedRoute, { useValue: { data } });
  controller = TestBed.inject(HttpTestingController);
  socket = TestBed.inject(SocketDouble);
  fixture = TestBed.createComponent(LaunchLogsComponent);
  fixture.detectChanges();
  element = fixture.nativeElement;
}

function requests(): TestRequest[] {
  return controller.match((r) => r.url === URL);
}

function respond(body: object = launchLogsPlain()) {
  const [request] = requests();
  request.flush(body);
  fixture.detectChanges();
  return request;
}

function lines(): string[] {
  return Array.from(element.querySelectorAll(".line")).map((line) =>
    Array.from(line.querySelectorAll("time, .node, .attempt, pre"))
      .map((part) => part.textContent.trim())
      .join(" "),
  );
}

function chip(text: string): HTMLButtonElement {
  return Array.from(
    element.querySelectorAll<HTMLButtonElement>("button[tuiChip]"),
  ).find((b) => b.textContent.trim() === text);
}

describe("LaunchLogsComponent", () => {
  it("shows the logs of every node oldest first and joins the launch room", fakeAsync(() => {
    render();

    const request = respond();

    expect(request.request.params.has("node")).toBe(false);
    expect(lines()).toEqual([
      expect.stringMatching(/Generate text #1 started$/),
      expect.stringMatching(/Make JSON #1 parsed$/),
      expect.stringMatching(/Generate text #2 failed$/),
    ]);
    expect(
      element.querySelector("[data-testid=logs-dropped]").textContent.trim(),
    ).toBe("5 earlier lines of Make JSON dropped");
    expect(element.querySelector("[data-testid=node-filter]")).not.toBeNull();
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([LAUNCH_ID]);
    controller.verify();
    finish();
  }));

  it("filters the lines by level and by node", fakeAsync(() => {
    render();
    respond();

    chip("debug").click();
    fixture.detectChanges();
    const withoutDebug = lines().length;
    chip("Generate text").click();
    fixture.detectChanges();
    const ofNodeOne = lines();

    expect(withoutDebug).toBe(2);
    expect(ofNodeOne).toEqual([
      expect.stringMatching(/started$/),
      expect.stringMatching(/failed$/),
    ]);
    expect(element.querySelector("[data-testid=logs-dropped]")).toBeNull();
    finish();
  }));

  it("asks only for the logs of the node it is opened for", fakeAsync(() => {
    render("node_one");

    const request = respond({
      available: true,
      logs: [
        { node: "node_one", level: "info", message: "started", attempt: 0 },
      ],
      dropped: {},
    });

    expect(request.request.params.get("node")).toBe("node_one");
    expect(element.querySelector("h2").textContent.trim()).toBe(
      "Logs of Generate text",
    );
    expect(element.querySelector("[data-testid=node-filter]")).toBeNull();
    expect(lines()).toEqual(["#1 started"]);
    finish();
  }));

  it("says the logs expired once the launch's live state is gone", fakeAsync(() => {
    render();

    respond({ available: false, logs: [], dropped: {} });

    expect(element.querySelector("[data-testid=logs-expired]")).not.toBeNull();
    expect(element.querySelector("[data-testid=logs]")).toBeNull();
    finish();
  }));

  it("reloads on refresh and on node events of its launch only", fakeAsync(() => {
    render();
    respond();

    socket.receive("node_done", { launch: "launch_other", node: "node_one" });
    const unrelated = requests();
    socket.receive("node_error", { launch: LAUNCH_ID, node: "node_two" });
    const fromEvent = requests();
    fromEvent.forEach((r) => r.flush(launchLogsPlain()));
    (
      element.querySelector("[data-testid=refresh-logs]") as HTMLElement
    ).click();
    const fromRefresh = requests();
    fromRefresh.forEach((r) => r.flush(launchLogsPlain()));

    expect(unrelated.length).toBe(0);
    expect(fromEvent.length).toBe(1);
    expect(fromRefresh.length).toBe(1);
    controller.verify();
    finish();
  }));

  it("ignores another node's events when opened for one node", fakeAsync(() => {
    render("node_one");
    respond();

    socket.receive("node_done", { launch: LAUNCH_ID, node: "node_two" });

    expect(requests().length).toBe(0);
    finish();
  }));

  it("leaves the launch room and stops listening when destroyed", fakeAsync(() => {
    render();
    respond();

    fixture.destroy();
    socket.receive("node_done", { launch: LAUNCH_ID, node: "node_one" });

    expect(requests().length).toBe(0);
    expect(socket.listenerCount()).toBe(0);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([LAUNCH_ID]);
    finish();
  }));
});
