import { HttpRequest } from "@angular/common/http";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { Launch } from "src/models/launch";
import { LiveService } from "src/services/live.service";
import { launchResponsePlain } from "../fixtures/launch-results";
import {
  LAUNCH_ID,
  PROJECT_A_ID,
  patchResponsePlain,
  SOCKET_EVENTS,
  USER_IDS,
} from "../fixtures/plain";
import { finish, setupEditor } from "../helpers/editor";
import { expectConsoleError } from "../helpers/console";

/**
 * Wire contracts: POST /api/projects/:_id/launch merges the body into the
 * project's stored launch request and returns the launch without `pipeline`
 * (backend/api/projects/launch-project.ts); POST /api/launches/:id/interrupt
 * returns null (backend/api/launches/interrupt-launch.ts); `pipeline_done`
 * arrives in the launch room as `{ launch, node }`.
 */
const LAUNCH_URL = `/api/projects/${PROJECT_A_ID}/launch`;
const INTERRUPT_URL = `/api/launches/${LAUNCH_ID}/interrupt`;
const UI_DELAY = 250;
const AUTOSAVE = 4000;

type Editor = ReturnType<typeof setupEditor>;

function runButton(element: HTMLElement): HTMLButtonElement {
  const actions = element.querySelector("div.actions.stack:not(.align-center)");
  return Array.from(actions.querySelectorAll("button.circle")).find((b) =>
    ["play", "stop"].includes(
      b.querySelector("app-icon")?.getAttribute("ng-reflect-icon"),
    ),
  ) as HTMLButtonElement;
}

function nodeRunButton(element: HTMLElement, id: string): HTMLButtonElement {
  const node = element.querySelector(`[data-testid="node-${id}"]`);
  return node.querySelector(".actions.align-center button.circle.small");
}

/**
 * Answers the node result reads a launched `app-node` performs; a `null`
 * status (node not started yet) stops further polling.
 */
function answerNodeReads({ controller }: Editor) {
  const reads = controller.match(
    (r: HttpRequest<unknown>) =>
      r.method === "GET" && r.url.startsWith(`/api/launches/`),
  );
  for (const read of reads) {
    read.flush(read.request.url.endsWith("/status") ? null : {});
  }
  return reads.map((r) => r.request.url);
}

/** Flushes saves `kick()` sends for the sanitized fixture. */
function answerSaves({ controller }: Editor, revision = "rev_a_2") {
  for (const save of controller.match((r) => r.method === "PATCH")) {
    save.flush(patchResponsePlain(revision));
  }
  tick(UI_DELAY);
}

describe("EditPipelineVisualComponent runs", () => {
  it("launches the whole pipeline with the outputs bucket", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges } = editor;

    runButton(element).click();
    detectChanges();
    const request = controller.expectOne(LAUNCH_URL);
    const busy = runButton(element).classList.contains("busy");
    request.flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);

    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({ options: { bucket: "outputs" } });
    expect(busy).toBeTrue();
    expect(editor.editor.launch).toBeInstanceOf(Launch);
    expect(editor.editor.launch._id).toBe(LAUNCH_ID);
    expect(editor.editor.progress.launching).toBeFalse();
    expect(editor.router.url).toContain(`launch=${LAUNCH_ID}`);
    expect(
      runButton(element)
        .querySelector("app-icon")
        .getAttribute("ng-reflect-icon"),
    ).toBe("stop");
    controller.verify();
    finish();
  }));

  it("waits for a pending save before launching", fakeAsync(() => {
    const editor = setupEditor();
    const { controller, manager, detectChanges, element } = editor;
    manager.project.pipeline.nodes.get("node_one").title = "Renamed";
    manager.markDirty();

    runButton(element).click();
    detectChanges();
    const early = controller.match(LAUNCH_URL);
    tick(AUTOSAVE);
    const patch = controller.expectOne((r) => r.method === "PATCH");
    patch.flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);
    const launch = controller.expectOne(LAUNCH_URL);
    launch.flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);

    expect(early.length).toBe(0);
    expect(manager.project.revision).toBe("rev_a_2");
    expect(editor.editor.launch._id).toBe(LAUNCH_ID);
    controller.verify();
    finish();
  }));

  it("shows a launch failure and clears progress", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const editor = setupEditor();
    const { element, controller, detectChanges } = editor;

    runButton(element).click();
    controller.expectOne(LAUNCH_URL).flush("Please, top up your balance", {
      status: 400,
      statusText: "Bad Request",
    });
    tick(UI_DELAY);
    detectChanges();

    expect(element.querySelector("app-informer")?.textContent).toContain(
      "Please, top up your balance",
    );
    expect(editor.editor.launch).toBeFalsy();
    expect(editor.editor.progress.launching).toBeFalse();
    expect(runButton(element).classList.contains("busy")).toBeFalse();
    controller.verify();
    finish();
  }));

  it("interrupts the running launch and clears its URL state", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges } = editor;
    runButton(element).click();
    controller.expectOne(LAUNCH_URL).flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);

    runButton(element).click();
    detectChanges();
    const interrupt = controller.expectOne(INTERRUPT_URL);
    const interrupting = editor.editor.progress.interrupting;
    interrupt.flush(null);
    tick(UI_DELAY);
    detectChanges();

    expect(interrupt.request.method).toBe("POST");
    expect(interrupting).toBeTrue();
    expect(editor.editor.launch).toBeNull();
    expect(editor.editor.progress.interrupting).toBeFalse();
    expect(editor.router.url).not.toContain("launch=");
    controller.verify();
    finish();
  }));

  it("keeps the launch and shows the error when interrupting fails", fakeAsync(() => {
    expectConsoleError("Process HTTP error 404");
    const editor = setupEditor();
    const { element, controller, detectChanges } = editor;
    runButton(element).click();
    controller.expectOne(LAUNCH_URL).flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);

    runButton(element).click();
    controller
      .expectOne(INTERRUPT_URL)
      .flush("Not found", { status: 404, statusText: "Not Found" });
    tick(UI_DELAY);
    detectChanges();

    expect(editor.editor.launch._id).toBe(LAUNCH_ID);
    expect(editor.editor.progress.interrupting).toBeFalse();
    expect(element.querySelector("app-informer")).not.toBeNull();
    controller.verify();
    finish();
  }));

  it("clears the launch when its pipeline_done arrives, ignoring other launches", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges, socket } = editor;
    runButton(element).click();
    controller.expectOne(LAUNCH_URL).flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);

    socket.receive("pipeline_done", { launch: "launch_other" });
    const afterOther = editor.editor.launch?._id;
    socket.receive("pipeline_done", { launch: LAUNCH_ID });
    tick();
    detectChanges();

    expect(afterOther).toBe(LAUNCH_ID);
    expect(editor.editor.launch).toBeNull();
    expect(editor.router.url).not.toContain("launch=");
    controller.verify();
    finish();
  }));

  it("runs a single node with inclusive options after kicking the save", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges, manager } = editor;
    manager.project.pipeline.nodes.get("node_two").title = "Edited";

    nodeRunButton(element, "node_two").click();
    detectChanges();
    const patch = controller.expectOne((r) => r.method === "PATCH");
    const early = controller.match(LAUNCH_URL);
    patch.flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);
    const launch = controller.expectOne(LAUNCH_URL);
    launch.flush(launchResponsePlain("launch_node_two"));
    tick(UI_DELAY);
    detectChanges();
    const reads = answerNodeReads(editor);

    expect(early.length).toBe(0);
    expect(launch.request.body).toEqual({
      options: { bucket: "outputs" },
      inclusive: { nodes: ["node_two"] },
    });
    expect(editor.editor.launches["node_two"]._id).toBe("launch_node_two");
    expect(editor.editor.progress.nodes.launching["node_two"]).toBeFalse();
    expect(decodeURIComponent(editor.router.url)).toContain(
      "launches=node_two:launch_node_two",
    );
    expect(reads.every((url) => url.includes("launch_node_two"))).toBeTrue();
    expect(editor.socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toContain(
      "launch_node_two",
    );
    controller.verify();
    finish();
  }));

  it("stops a single-node run and leaves its room", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges, socket } = editor;
    nodeRunButton(element, "node_two").click();
    detectChanges();
    answerSaves(editor);
    controller
      .expectOne(LAUNCH_URL)
      .flush(launchResponsePlain("launch_node_two"));
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);

    nodeRunButton(element, "node_two").click();
    tick();
    detectChanges();

    expect(editor.editor.launches["node_two"]).toBeUndefined();
    expect(editor.router.url).not.toContain("launches=");
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toContain(
      "launch_node_two",
    );
    controller.verify();
    finish();
  }));

  it("releases its rooms and socket listeners when destroyed", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges, socket, fixture } = editor;
    const live = TestBed.inject(LiveService);
    runButton(element).click();
    controller.expectOne(LAUNCH_URL).flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);
    const userRefs = live.rooms.get(USER_IDS.owner).size;

    fixture.destroy();
    socket.receive("node_done", { launch: LAUNCH_ID, node: "node_one" });

    // Only MeManager's app-wide balance listener and user room remain.
    expect(userRefs).toBe(2);
    expect(socket.listenerCount()).toBe(
      socket.listenerCount("user_balance_updated"),
    );
    expect(live.rooms.get(USER_IDS.owner).size).toBe(1);
    expect(live.rooms.has(LAUNCH_ID)).toBeFalse();
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([LAUNCH_ID]);
    controller.verify();
    finish();
  }));

  it("refreshes a re-launched node once per event, ignoring stale launches", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges, socket } = editor;
    const launchNode = (id: string) => {
      nodeRunButton(element, "node_two").click();
      detectChanges();
      answerSaves(editor);
      controller.expectOne(LAUNCH_URL).flush(launchResponsePlain(id));
      tick(UI_DELAY);
      detectChanges();
      answerNodeReads(editor);
    };
    launchNode("launch_first");
    nodeRunButton(element, "node_two").click();
    tick();
    detectChanges();
    launchNode("launch_second");

    socket.receive("node_running", {
      launch: "launch_second",
      node: "node_two",
    });
    const current = controller.match((r) => r.url.endsWith("/status"));
    socket.receive("node_running", {
      launch: "launch_first",
      node: "node_two",
    });
    const stale = controller.match((r) => r.url.endsWith("/status"));

    expect(current.map((r) => r.request.url)).toEqual([
      "/api/launches/launch_second/node_two/status",
    ]);
    expect(stale.length).toBe(0);
    current.forEach((r) => r.flush(null));
    controller.verify();
    finish();
  }));
});
