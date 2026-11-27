import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { SelectNodeComponent } from "src/app/select-node/select-node.component";
import { UI_DELAY } from "src/consts/ui";
import { Plain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

/**
 * Wire contract (backend/api/nodes/list.ts): GET /api/nodes?search= → the
 * node catalog, each node with its `package` and, when the Node Package is
 * stored, its `packageTitle`. The Script Node comes first in a Built-in
 * category and has no package.
 */
const NODES_URL = "/api/nodes";
/** backend/api/me/list-deploys.ts: the user's Deploys with pipeline outputs. */
const DEPLOYS_URL = "/api/me/deploys";
const SEARCH_DEBOUNCE = 500;
/** Longer than the accordion expand transition. */
const TRANSITION = 1000;

function catalogPlain(): Plain[] {
  return [
    {
      _id: "script",
      title: "en=Script",
      version: 1,
      order: 0,
      category: { _id: "builtin", title: "en=Built-in", order: -1 },
    },
    {
      _id: "translate_text",
      title: "en=Translate text",
      version: 1,
      order: 5,
      package: "artworks",
      packageTitle: "ArtWorks",
      tags: ["en=cheap"],
    },
    {
      _id: "detect_nsfw",
      title: "en=Detect NSFW",
      version: 1,
      order: 1,
      package: "artworks",
      packageTitle: "ArtWorks",
    },
  ];
}

function deployPlain(): Plain {
  return {
    prefix: "owner",
    slug: "summarizer",
    title: "Summarizer",
    deployedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Renders the node catalog sidebar. Call in `fakeAsync`. */
function setup(deploys: Plain[] = []) {
  seedAuthorization(userPlain("admin"));
  configureAppTestingModule([]);
  const controller = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SelectNodeComponent);
  fixture.detectChanges();
  controller.expectOne(DEPLOYS_URL).flush(deploys);
  const element = fixture.nativeElement as HTMLElement;

  /** Lets the UI delay and accordion transitions pass; admin checks read /api/me. */
  const settle = () => {
    tick(UI_DELAY);
    fixture.detectChanges();
    controller
      .match("/api/me")
      .forEach((request) => request.flush(userPlain("admin")));
    tick(TRANSITION);
    fixture.detectChanges();
  };

  return {
    fixture,
    element,
    controller,
    settle,
    respond: (nodes = catalogPlain()) => {
      controller.expectOne((request) => request.url === NODES_URL).flush(nodes);
      settle();
    },
    groups: () =>
      Array.from(
        element.querySelectorAll<HTMLButtonElement>("button[tuiAccordion]"),
      ).map((button) => ({
        title: button.querySelector(".title")?.textContent.trim(),
        count: button.querySelector(".count")?.textContent.trim(),
        expanded: button.getAttribute("aria-expanded") === "true",
        button,
      })),
    visibleNodes: () =>
      Array.from(element.querySelectorAll(".node .name")).map((title) =>
        title.textContent.trim(),
      ),
    deployRows: () =>
      Array.from(element.querySelectorAll<HTMLElement>(".node")).map((row) => ({
        name: row.querySelector(".name")?.textContent.trim(),
        ref:
          row.querySelector('[data-testid="deploy-ref"]')?.textContent.trim() ??
          null,
        hint: row.getAttribute("title"),
      })),
  };
}

describe("SelectNodeComponent", () => {
  it("titles each Node Package group and lists its nodes once opened", fakeAsync(() => {
    const page = setup();
    page.respond();

    const closed = page.groups();
    closed[1].button.click();
    page.settle();

    expect(
      closed.map(({ title, count, expanded }) => ({ title, count, expanded })),
    ).toEqual([
      { title: "Built-in", count: "1", expanded: false },
      { title: "ArtWorks", count: "2", expanded: false },
    ]);
    expect(page.groups()[1].expanded).toBe(true);
    expect(page.visibleNodes()).toEqual(["Detect NSFW", "Translate text"]);
    page.controller.verify();
    finish();
  }));

  it("keeps several groups open at once", fakeAsync(() => {
    const page = setup();
    page.respond();

    page.groups()[0].button.click();
    page.settle();
    page.groups()[1].button.click();
    page.settle();

    expect(page.groups().map(({ expanded }) => expanded)).toEqual([true, true]);
    expect(page.visibleNodes()).toEqual([
      "Script",
      "Detect NSFW",
      "Translate text",
    ]);
    page.controller.verify();
    finish();
  }));

  it("opens every group while searching", fakeAsync(() => {
    const page = setup();
    page.respond();
    const search = page.element.querySelector("input") as HTMLInputElement;

    search.value = "t";
    search.dispatchEvent(new Event("input"));
    tick(SEARCH_DEBOUNCE);
    page.respond();

    expect(page.groups().map(({ expanded }) => expanded)).toEqual([true, true]);
    expect(page.visibleNodes()).toEqual([
      "Script",
      "Detect NSFW",
      "Translate text",
    ]);
    page.controller.verify();
    finish();
  }));

  it("closes every group again once the search is cleared", fakeAsync(() => {
    const page = setup();
    page.respond();
    const search = page.element.querySelector("input") as HTMLInputElement;
    const type = (value: string) => {
      search.value = value;
      search.dispatchEvent(new Event("input"));
      tick(SEARCH_DEBOUNCE);
      page.respond();
    };

    type("t");
    type("");

    expect(page.groups().map(({ expanded }) => expanded)).toEqual([
      false,
      false,
    ]);
    expect(page.visibleNodes()).toEqual([]);
    page.controller.verify();
    finish();
  }));

  it("opens the only group without a click", fakeAsync(() => {
    const page = setup();

    page.respond(catalogPlain().slice(1));

    expect(
      page.groups().map(({ title, expanded }) => ({ title, expanded })),
    ).toEqual([{ title: "ArtWorks", expanded: true }]);
    expect(page.visibleNodes()).toEqual(["Detect NSFW", "Translate text"]);
    page.controller.verify();
    finish();
  }));

  it("lists the user's Deploys in their own group, dragged as Deploys", fakeAsync(() => {
    const page = setup([deployPlain()]);
    page.respond();

    page.groups()[2].button.click();
    page.settle();

    expect(page.groups().map(({ title, count }) => ({ title, count }))).toEqual(
      [
        { title: "Built-in", count: "1" },
        { title: "ArtWorks", count: "2" },
        { title: "Deploys", count: "1" },
      ],
    );
    expect(page.visibleNodes()).toEqual(["Summarizer"]);
    expect(
      page.fixture.componentInstance.dragPayload(
        page.fixture.componentInstance.groups[2].nodes[0],
      ),
    ).toEqual({ deploy: { prefix: "owner", slug: "summarizer" } });
    page.controller.verify();
    finish();
  }));

  it("tells apart two Deploys of one project by their names", fakeAsync(() => {
    const page = setup([
      { ...deployPlain(), prefix: null, slug: "violations-detector-v6" },
      { ...deployPlain(), prefix: null, slug: "violations-detector-v5" },
    ]);
    page.respond();

    page.groups()[2].button.click();
    page.settle();

    expect(page.deployRows()).toEqual([
      {
        name: "Summarizer",
        ref: "violations-detector-v6",
        hint: "Summarizer · violations-detector-v6",
      },
      {
        name: "Summarizer",
        ref: "violations-detector-v5",
        hint: "Summarizer · violations-detector-v5",
      },
    ]);
    page.controller.verify();
    finish();
  }));

  it("offers another user's Deploy named by its link in the search", fakeAsync(() => {
    const page = setup();
    page.respond();

    page.fixture.componentInstance.searchControl.setValue(
      "https://piper.example/api/other-user/translator/launch",
    );
    tick(SEARCH_DEBOUNCE);
    page.respond([]);

    expect(
      page.groups().map(({ title, expanded }) => ({ title, expanded })),
    ).toEqual([{ title: "Deploys", expanded: true }]);
    expect(page.deployRows()).toEqual([
      {
        name: "other-user/translator",
        ref: null,
        hint: "other-user/translator",
      },
    ]);
    page.controller.verify();
    finish();
  }));
});
