import { HttpRequest } from "@angular/common/http";
import { fakeAsync, tick } from "@angular/core/testing";
import { LAUNCH_INFO_KEY } from "src/app/launch-info/launch-info.component";
import { Launch } from "src/models/launch";
import { toInstance } from "src/utils/models";
import {
  LAUNCH_ID,
  launchPlain,
  PROJECT_A_ID,
  USER_IDS,
} from "../fixtures/plain";
import { finish, setupEditor } from "../helpers/editor";

type Editor = ReturnType<typeof setupEditor>;
type Status = { state: string } | null;

/** The Launch page's Launch (GET /api/launches/:id) with `overrides`. */
function launchWith(overrides: object = {}): Launch {
  return toInstance(
    {
      ...launchPlain(),
      launchedBy: { _id: USER_IDS.owner },
      comment: "UI call",
      ...overrides,
    },
    Launch,
  );
}

/**
 * Answers the node reads of the canvas (status per node id, null for the
 * rest) and the recorded run (GET /api/launches/:id/run, a launch_runs row
 * or null until the launch finished; backend/api/launches/launch-run.ts).
 */
function answerReads(
  { controller }: Editor,
  statuses: Record<string, Status> = {},
  run: object | null = null,
) {
  const reads = controller.match(
    (r: HttpRequest<unknown>) =>
      r.method === "GET" && r.url.startsWith("/api/launches/"),
  );
  for (const read of reads) {
    const url = read.request.url;
    if (url.endsWith("/run")) {
      read.flush(run);
      continue;
    }
    const [, , , , node, kind] = url.split("/");
    read.flush(kind === "status" ? (statuses[node] ?? null) : null);
  }
  tick();
}

function byTestId(root: HTMLElement, id: string) {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

describe("LaunchInfoComponent on the Launch page", () => {
  beforeEach(() => localStorage.removeItem(LAUNCH_INFO_KEY));

  it("puts the Launch's breadcrumbs in the app top bar", fakeAsync(() => {
    const editor = setupEditor({ launch: launchWith() });
    const { topbar, detectChanges } = editor;
    answerReads(editor);
    detectChanges();

    const crumbs = byTestId(topbar, "launch-crumbs");
    const links = [...crumbs.querySelectorAll("a")].map((a) => [
      a.textContent.trim(),
      a.getAttribute("href"),
    ]);
    const current = byTestId(topbar, "launch-crumb-current");

    expect(links).toEqual([
      ["Pipelines", "/projects"],
      ["Project A", `/projects/${PROJECT_A_ID}`],
      ["Launches", `/projects/${PROJECT_A_ID}/launches`],
    ]);
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.textContent.trim()).toMatch(/^1 Mar, \d\d:\d\d$/);
    finish();
  }));

  it("shows who started the Launch, how, and how far its nodes got", fakeAsync(() => {
    const editor = setupEditor({ launch: launchWith() });
    const { element, detectChanges } = editor;
    answerReads(editor, { node_one: { state: "done" } });
    detectChanges();

    const text = (id: string) => byTestId(element, id)?.textContent.trim();
    const total = editor.editor.pipeline.nodes.size;

    expect(text("launch-info-by")).toBe(USER_IDS.owner);
    expect(text("launch-info-source")).toBe("Canvas");
    expect(text("launch-info-nodes")).toContain(`1/${total} done`);
    expect(text("launch-info-id")).toBe(LAUNCH_ID);
    expect(byTestId(element, "launch-info-parent")).toBeNull();
    expect(byTestId(element, "launch-info-errors")).toBeNull();
    finish();
  }));

  it("shows the finish time once the run is recorded", fakeAsync(() => {
    const editor = setupEditor({ launch: launchWith() });
    const { element, detectChanges } = editor;
    answerReads(editor, {
      node_one: { state: "done" },
      node_two: { state: "done" },
    });
    detectChanges();

    answerReads(
      editor,
      {},
      {
        launch: LAUNCH_ID,
        status: "done",
        finishedAt: "2026-03-01 12:01:46.500",
        durationMs: 105500,
      },
    );
    detectChanges();

    expect(byTestId(element, "launch-info-finished")).not.toBeNull();
    expect(byTestId(element, "launch-info-status").textContent).toContain(
      "1:45",
    );
    finish();
  }));

  it("links a Child Launch to its parent and its errors to the logs", fakeAsync(() => {
    const launch = launchWith({
      parent: "launch_parent",
      depth: 1,
      comment: "Child of launch launch_parent node deploy",
      errors: ["Boom"],
    });
    const editor = setupEditor({ launch });
    const { element, detectChanges } = editor;
    answerReads(editor);
    detectChanges();

    const parent = byTestId(element, "launch-info-parent");
    const errors = byTestId(element, "launch-info-errors");

    expect(byTestId(element, "launch-info-source").textContent.trim()).toBe(
      "Child launch",
    );
    expect(parent.getAttribute("href")).toBe("/launches/launch_parent");
    expect(errors.textContent.trim()).toBe("1");
    expect(errors.getAttribute("href")).toContain("right:logs");
    finish();
  }));

  it("collapses the card and remembers it", fakeAsync(() => {
    const editor = setupEditor({ launch: launchWith() });
    const { element, detectChanges } = editor;
    answerReads(editor);
    detectChanges();

    byTestId(element, "launch-info-toggle").click();
    detectChanges();

    expect(byTestId(element, "launch-info-details")).toBeNull();
    expect(
      byTestId(element, "launch-info-toggle").getAttribute("aria-expanded"),
    ).toBe("false");
    expect(localStorage.getItem(LAUNCH_INFO_KEY)).toBe("collapsed");
    finish();
  }));
});
