import { HttpRequest } from "@angular/common/http";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { LiveService } from "src/services/live.service";
import { launchResponsePlain } from "../fixtures/launch-results";
import { launch } from "../fixtures/models";
import {
  LAUNCH_ID,
  PROJECT_A_ID,
  patchResponsePlain,
  SOCKET_EVENTS,
  USER_IDS,
} from "../fixtures/plain";
import { finish, setupEditor } from "../helpers/editor";
import { expectConsoleError } from "../helpers/console";
import { isLoading, iconName, openDialog } from "../helpers/taiga";
import { LAUNCH_ROOM, USER_ROOM } from "src/consts/rooms";

/**
 * Wire contracts: POST /api/projects/:_id/launch merges the body into the
 * project's stored launch request and returns the launch without `pipeline`
 * (backend/api/projects/launch-project.ts); POST /api/launches/:id/interrupt
 * returns null (backend/api/launches/interrupt-launch.ts).
 */
const LAUNCH_URL = `/api/projects/${PROJECT_A_ID}/launch`;
const INTERRUPT_URL = `/api/launches/${LAUNCH_ID}/interrupt`;
const UI_DELAY = 250;
const AUTOSAVE = 4000;

type Editor = ReturnType<typeof setupEditor>;

function runButton(element: HTMLElement): HTMLButtonElement {
  return element.querySelector('[data-testid="run-pipeline"]');
}

function nodeRunButton(element: HTMLElement, id: string): HTMLButtonElement {
  const node = element.querySelector(`[data-testid="node-${id}"]`);
  return node.querySelector(".item-actions > button.run");
}

/** Makes `window.open` return a stand-in browser tab and records its use. */
function tabDouble() {
  const tab = {
    location: { href: "" },
    closed: false,
    window: null as unknown as Window,
    open: null as unknown as ReturnType<typeof vi.spyOn>,
  };
  tab.window = {
    location: tab.location,
    opener: {},
    close: () => (tab.closed = true),
  } as unknown as Window;
  tab.open = vi.spyOn(window, "open").mockReturnValue(tab.window);
  return tab;
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

type Status = { state: string; error?: string } | null;

/** Answers every pending node read, with `statuses` per node id. */
function answerStatuses(
  { controller }: Editor,
  statuses: Record<string, Status> = {},
) {
  const reads = controller.match(
    (r: HttpRequest<unknown>) =>
      r.method === "GET" && r.url.startsWith(`/api/launches/`),
  );
  for (const read of reads) {
    const [, , , , node, kind] = read.request.url.split("/");
    if (kind === "status") {
      read.flush(statuses[node] ?? null);
    } else if (kind === "progress") {
      read.flush(null);
    } else {
      read.flush({});
    }
  }
  tick();
}

/** Flushes saves `kick()` sends for the sanitized fixture. */
function answerSaves({ controller }: Editor, revision = "rev_a_2") {
  for (const save of controller.match((r) => r.method === "PATCH")) {
    save.flush(patchResponsePlain(revision));
  }
  tick(UI_DELAY);
}

describe("EditPipelineVisualComponent runs", () => {
  it("launches the whole pipeline in a new tab and keeps the canvas free", fakeAsync(() => {
    const tab = tabDouble();
    const editor = setupEditor();
    const { controller, detectChanges, topbar } = editor;

    runButton(topbar).click();
    detectChanges();
    const openedBeforeResponse = tab.open.mock.calls.length;
    const request = controller.expectOne(LAUNCH_URL);
    const busy = isLoading(runButton(topbar));
    request.flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();

    expect(openedBeforeResponse).toBe(1);
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({ options: { bucket: "outputs" } });
    expect(busy).toBe(true);
    expect(tab.location.href).toBe(`/launches/${LAUNCH_ID}`);
    expect(tab.window.opener).toBeNull();
    expect(tab.closed).toBe(false);
    expect(editor.editor.launch).toBeFalsy();
    expect(editor.editor.progress.launching).toBe(false);
    expect(editor.router.url).not.toContain("launch=");
    expect(iconName(runButton(topbar))).toBe("play");
    controller.verify();
    finish();
  }));

  it("waits for a pending save before launching", fakeAsync(() => {
    const tab = tabDouble();
    const editor = setupEditor();
    const { controller, manager, detectChanges, topbar } = editor;
    manager.project.pipeline.nodes.get("node_one").title = "Renamed";
    manager.markDirty();

    runButton(topbar).click();
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

    expect(early.length).toBe(0);
    expect(manager.project.revision).toBe("rev_a_2");
    expect(tab.location.href).toBe(`/launches/${LAUNCH_ID}`);
    controller.verify();
    finish();
  }));

  it("abandons the launch and closes the tab when the save fails", fakeAsync(() => {
    expectConsoleError("Process HTTP error 409");
    const tab = tabDouble();
    const editor = setupEditor();
    const { controller, manager, detectChanges, topbar } = editor;
    manager.project.pipeline.nodes.get("node_one").title = "Renamed";
    manager.markDirty();

    runButton(topbar).click();
    detectChanges();
    tick(AUTOSAVE);
    controller
      .expectOne((r) => r.method === "PATCH")
      .flush("Conflict", { status: 409, statusText: "Conflict" });
    tick(UI_DELAY);
    detectChanges();

    expect(controller.match(LAUNCH_URL).length).toBe(0);
    expect(tab.closed).toBe(true);
    expect(editor.editor.progress.launching).toBe(false);
    expect(isLoading(runButton(topbar))).toBe(false);
    controller.verify();
    finish();
  }));

  it("shows a launch failure, closes the tab and clears progress", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const tab = tabDouble();
    const editor = setupEditor();
    const { controller, detectChanges, topbar } = editor;

    runButton(topbar).click();
    controller.expectOne(LAUNCH_URL).flush("Launch request is invalid", {
      status: 400,
      statusText: "Bad Request",
    });
    tick(UI_DELAY);
    detectChanges();

    expect(openDialog()?.textContent).toContain("Launch request is invalid");
    expect(tab.closed).toBe(true);
    expect(editor.editor.progress.launching).toBe(false);
    expect(isLoading(runButton(topbar))).toBe(false);
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
    expect(editor.editor.progress.nodes.launching["node_two"]).toBe(false);
    expect(decodeURIComponent(editor.router.url)).toContain(
      "launches=node_two:launch_node_two",
    );
    expect(reads.every((url) => url.includes("launch_node_two"))).toBe(true);
    expect(editor.socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toContain(
      LAUNCH_ROOM("launch_node_two"),
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
      LAUNCH_ROOM("launch_node_two"),
    );
    controller.verify();
    finish();
  }));

  it("releases its rooms and socket listeners when destroyed", fakeAsync(() => {
    const editor = setupEditor();
    const { element, controller, detectChanges, socket, fixture } = editor;
    const live = TestBed.inject(LiveService);
    nodeRunButton(element, "node_two").click();
    detectChanges();
    answerSaves(editor);
    controller.expectOne(LAUNCH_URL).flush(launchResponsePlain());
    tick(UI_DELAY);
    detectChanges();
    answerNodeReads(editor);
    const userRefs = live.rooms.get(USER_ROOM(USER_IDS.owner)).size;

    fixture.destroy();
    socket.receive("node_done", { launch: LAUNCH_ID, node: "node_one" });

    // The editor holds no user room; only MeManager's remains.
    expect(userRefs).toBe(1);
    expect(socket.listenerCount()).toBe(0);
    expect(live.rooms.get(USER_ROOM(USER_IDS.owner)).size).toBe(1);
    expect(live.rooms.has(LAUNCH_ROOM(LAUNCH_ID))).toBe(false);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      LAUNCH_ROOM(LAUNCH_ID),
    ]);
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

describe("EditPipelineVisualComponent launch page", () => {
  function interruptButton(element: HTMLElement): HTMLButtonElement | null {
    return element.querySelector('[data-testid="interrupt-launch"]');
  }

  const RUNNING = {
    node_one: { state: "done" },
    node_two: { state: "running" },
  };

  it("interrupts the running launch and hides the interrupt button", fakeAsync(() => {
    const editor = setupEditor({ launch: launch() });
    const { controller, detectChanges, topbar } = editor;
    answerStatuses(editor, RUNNING);
    detectChanges();

    interruptButton(topbar).click();
    detectChanges();
    const interrupt = controller.expectOne(INTERRUPT_URL);
    const busy = isLoading(interruptButton(topbar));
    interrupt.flush(null);
    tick(UI_DELAY);
    detectChanges();

    expect(interrupt.request.method).toBe("POST");
    expect(busy).toBe(true);
    expect(interruptButton(topbar)).toBeNull();
    expect(editor.editor.launch._id).toBe(LAUNCH_ID);
    answerStatuses(editor);
    controller.verify();
    finish();
  }));

  it("keeps the interrupt button and shows the error when interrupting fails", fakeAsync(() => {
    expectConsoleError("Process HTTP error 404");
    const editor = setupEditor({ launch: launch() });
    const { controller, detectChanges, topbar } = editor;
    answerStatuses(editor, RUNNING);
    detectChanges();

    interruptButton(topbar).click();
    controller
      .expectOne(INTERRUPT_URL)
      .flush("Not found", { status: 404, statusText: "Not Found" });
    tick(UI_DELAY);
    detectChanges();

    expect(interruptButton(topbar)).not.toBeNull();
    expect(isLoading(interruptButton(topbar))).toBe(false);
    expect(openDialog()).not.toBeNull();
    answerStatuses(editor);
    controller.verify();
    finish();
  }));

  const loaded: [string, Record<string, Status>, boolean][] = [
    ["a running node", RUNNING, true],
    [
      "a finished launch",
      { node_one: { state: "done" }, node_two: { state: "done" } },
      false,
    ],
    [
      "a failed launch",
      { node_one: { state: "error", error: "Boom" }, node_two: null },
      false,
    ],
    ["no node states, e.g. expired", {}, false],
  ];
  for (const [name, statuses, offered] of loaded) {
    it(`offers Stop on load only for ${name}`, fakeAsync(() => {
      const editor = setupEditor({ launch: launch() });
      const { controller, detectChanges, topbar } = editor;

      answerStatuses(editor, statuses);
      detectChanges();

      expect(interruptButton(topbar) !== null).toBe(offered);
      answerStatuses(editor);
      controller.verify();
      finish();
    }));
  }

  it("hides Stop once the last running node finishes", fakeAsync(() => {
    const editor = setupEditor({ launch: launch() });
    const { controller, detectChanges, topbar } = editor;
    answerStatuses(editor, RUNNING);
    detectChanges();
    const running = interruptButton(topbar) !== null;

    tick(2000);
    answerStatuses(editor, { node_two: { state: "done" } });
    answerStatuses(editor);
    detectChanges();

    expect(running).toBe(true);
    expect(interruptButton(topbar)).toBeNull();
    controller.verify();
    finish();
  }));
});

describe("EditPipelineVisualComponent run feedback", () => {
  function pill(element: HTMLElement) {
    return element.querySelector<HTMLElement>('[data-testid="launch-state"]');
  }

  /** The fixture's only node-to-node wire, node_one → node_two. */
  function nodeWire(element: HTMLElement) {
    return element.querySelector(".pane > svg path:not(.param):not(.pending)");
  }

  it("shows a failed node inline, marks the launch failed and opens its log", fakeAsync(() => {
    const editor = setupEditor({ launch: launch() });
    const { element, detectChanges, router, controller, topbar } = editor;

    answerStatuses(editor, {
      node_one: { state: "error", error: "Boom" },
      node_two: { state: "done" },
    });
    detectChanges();
    const node = element.querySelector('[data-testid="node-node_one"]');
    const message = node.querySelector('[role="alert"] p')?.textContent;
    const retry = node.querySelector('[data-testid="node-retry"]');
    node.querySelector<HTMLElement>('[data-testid="node-show-log"]').click();
    tick();
    detectChanges();

    expect(node.querySelector('[data-testid="node-failed"]')).not.toBeNull();
    expect(message?.trim()).toBe("Boom");
    expect(retry).toBeNull();
    expect(pill(topbar).dataset["state"]).toBe("failed");
    expect(pill(topbar).textContent).toContain("Failed");
    expect(router.url).toContain("(right:nodes/node_one/logs)");
    answerStatuses(editor);
    controller.verify();
    finish();
  }));

  it("counts the elapsed time while a node runs and animates its wires", fakeAsync(() => {
    const editor = setupEditor({ launch: launch() });
    const { element, detectChanges, controller, topbar } = editor;
    editor.editor.launch.startedAt = new Date(Date.now() - 42_000);

    answerStatuses(editor, {
      node_one: { state: "done" },
      node_two: { state: "running" },
    });
    detectChanges();
    const running = {
      state: pill(topbar).dataset["state"],
      elapsed: topbar.querySelector('[data-testid="launch-elapsed"]')
        .textContent,
      wire: nodeWire(element).classList.contains("running"),
    };
    tick(1000);
    detectChanges();
    const ticked = topbar.querySelector(
      '[data-testid="launch-elapsed"]',
    ).textContent;
    tick(1000);
    answerStatuses(editor, { node_two: { state: "done" } });
    answerStatuses(editor);
    detectChanges();
    tick(5000);
    detectChanges();

    expect(running).toEqual({ state: "running", elapsed: "0:42", wire: true });
    expect(ticked).toBe("0:43");
    expect(pill(topbar).dataset["state"]).toBe("done");
    expect(
      topbar.querySelector('[data-testid="launch-elapsed"]').textContent,
    ).toBe("0:44");
    expect(nodeWire(element).classList.contains("running")).toBe(false);
    controller.verify();
    finish();
  }));

  it("follows a node through the queue and waiting for its inputs", fakeAsync(() => {
    const editor = setupEditor({ launch: launch() });
    const { detectChanges, controller, socket, topbar } = editor;
    const event = { launch: LAUNCH_ID, node: "node_two" };
    editor.editor.launch.launchRequest.inclusive = undefined;

    answerStatuses(editor, { node_one: { state: "done" } });
    detectChanges();
    const skipped = pill(topbar).dataset["state"];
    socket.receive("node_flow", event);
    answerStatuses(editor);
    detectChanges();
    const queued = pill(topbar).dataset["state"];
    socket.receive("node_not_ready", event);
    tick();
    detectChanges();
    const waiting = {
      state: pill(topbar).dataset["state"],
      title: pill(topbar).querySelector("[title]")?.getAttribute("title"),
    };

    expect(skipped).toBe("done");
    expect(queued).toBe("running");
    expect(waiting).toEqual({
      state: "idle",
      title: "Nothing is running and the workflow isn't finished",
    });
    controller.verify();
    finish();
  }));

  it("offers Retry on a node that failed in the editor and runs it again", fakeAsync(() => {
    const editor = setupEditor();
    const { element, detectChanges, controller, topbar } = editor;
    editor.editor.launches = { node_one: launch() };
    detectChanges();

    answerStatuses(editor, { node_one: { state: "error", error: "Boom" } });
    detectChanges();
    element
      .querySelector<HTMLElement>(
        '[data-testid="node-node_one"] [data-testid="node-retry"]',
      )
      .click();
    detectChanges();
    answerSaves(editor);
    const request = controller.expectOne(LAUNCH_URL);
    request.flush(launchResponsePlain("launch_retry"));
    tick(UI_DELAY);
    detectChanges();
    answerStatuses(editor);
    detectChanges();

    expect(request.request.body).toEqual({
      options: { bucket: "outputs" },
      inclusive: { nodes: ["node_one"] },
    });
    expect(editor.editor.launches["node_one"]._id).toBe("launch_retry");
    expect(element.querySelector('[data-testid="node-failed"]')).toBeNull();
    expect(topbar.querySelector('[data-testid="launch-state"]')).toBeNull();
    controller.verify();
    finish();
  }));
});
