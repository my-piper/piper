import {
  HttpTestingController,
  TestRequest,
} from "@angular/common/http/testing";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { Type } from "@angular/core";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { ImportProjectComponent } from "src/app/projects/import/import-project.component";
import { ProjectsComponent } from "src/app/projects/projects.component";
import {
  PROJECT_A_ID,
  projectAPlain,
  projectBPlain,
  userPlain,
  UserKind,
} from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";
import { typeInto } from "../helpers/editor-stubs";

/**
 * GET /api/projects/tags/available lists tags of the user's own projects and
 * GET /api/projects?tags=… returns projects having all of them
 * (backend/api/projects/tags/list-available-tags.ts, backend/api/projects/list.ts).
 * GET /api/projects/groups/counts counts the user's own projects per group and
 * GET /api/projects?group=… returns projects of that group while
 * GET /api/projects?ungrouped=true returns projects outside any group
 * (backend/api/projects/groups/list-group-counts.ts).
 * GET /api/projects/stats?projects=… summarises the last 30 days of runs per
 * visible project (backend/api/projects/stats/list-projects-stats.ts).
 */
const UI_DELAY = 250;

function taggedProject() {
  return { ...projectAPlain(), tags: ["image", "video"], group: "Marketing" };
}

describe("ProjectsComponent tags and groups", () => {
  let fixture: ComponentFixture<AppComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  function expectList(): TestRequest {
    return controller.expectOne((r) => r.url === "/api/projects");
  }

  function answer(list: TestRequest, projects: object[]) {
    list.flush(projects);
    tick(UI_DELAY);
    fixture.detectChanges();
  }

  /** Renders the projects page inside the real app root, where Taiga popups live. */
  function mount(
    tags: string[],
    counts: object[],
    url = "/projects",
    importPage: Type<unknown> = OutletStubComponent,
    user: UserKind = "owner",
  ) {
    seedAuthorization(userPlain(user));
    configureAppTestingModule([
      { path: "", component: OutletStubComponent },
      {
        path: "projects",
        component: ProjectsComponent,
        children: [{ path: "import", component: importPage }],
      },
    ]);
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AppComponent);
    TestBed.inject(Router).navigateByUrl(url);
    tick();
    fixture.detectChanges();
    element = fixture.debugElement.query(By.directive(ProjectsComponent))
      .nativeElement as HTMLElement;
    controller.match("/api/me").forEach((r) => r.flush(userPlain(user)));
    controller.expectOne("/api/projects/tags/available").flush(tags);
    controller.expectOne("/api/projects/groups/counts").flush(counts);
  }

  function setup() {
    mount(
      ["image", "video"],
      [
        { group: "Marketing", count: 1 },
        { group: "Sales", count: 3 },
      ],
    );
    const list = expectList();
    answer(list, [taggedProject()]);
    return list;
  }

  function deleteFromMenu(row: number) {
    const rows = element.querySelectorAll("tbody tr:not(.folder)");
    rows[row]
      .querySelector<HTMLButtonElement>("button[aria-label=Actions]")
      .click();
    fixture.detectChanges();
    Array.from(
      document.querySelectorAll<HTMLButtonElement>("tui-data-list button"),
    )
      .find((b) => b.textContent.includes("Delete"))
      .click();
  }

  function tagChips(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll("tui-filter input"));
  }

  function expectStats(): TestRequest[] {
    return controller.match((r) => r.url === "/api/projects/stats");
  }

  afterEach(() => {
    // every loaded page asks for its run stats
    expectStats();
    controller.verify();
  });

  it("lists available tags without filtering initially", fakeAsync(() => {
    const list = setup();

    const chips = element.querySelectorAll("tui-filter label");
    expect(Array.from(chips).map((c) => c.textContent.trim())).toEqual([
      "#image",
      "#video",
    ]);
    expect(list.request.params.has("tags")).toBe(false);
    fixture.destroy();
    finish();
  }));

  it("filters by every selected tag chip", fakeAsync(() => {
    setup();
    const chips = tagChips();

    chips[0].click();
    answer(expectList(), [taggedProject()]);
    chips[1].click();
    const list = expectList();
    answer(list, [taggedProject()]);

    expect(list.request.params.getAll("tags")).toEqual(["image", "video"]);
    expect(chips.map((c) => c.checked)).toEqual([true, true]);
    fixture.destroy();
    finish();
  }));

  it("toggles the filter from a project row tag", fakeAsync(() => {
    setup();
    const rowTag = (): HTMLButtonElement =>
      element.querySelector("td button[tuiChip]:not(.group)");

    rowTag().click();
    const selected = expectList();
    answer(selected, [taggedProject()]);
    rowTag().click();
    const cleared = expectList();
    answer(cleared, [taggedProject()]);

    expect(selected.request.params.getAll("tags")).toEqual(["image"]);
    expect(cleared.request.params.has("tags")).toBe(false);
    fixture.destroy();
    finish();
  }));

  it("filters by the tags of the link it was opened with", fakeAsync(() => {
    mount(
      ["image", "video"],
      [],
      "/projects?tag=image&tag=gone&tag=image&tag=",
    );

    const list = expectList();
    answer(list, []);

    expect(list.request.params.getAll("tags")).toEqual(["image", "gone"]);
    const chips = element.querySelectorAll("tui-filter label");
    expect(Array.from(chips).map((c) => c.textContent.trim())).toEqual([
      "#image",
      "#video",
      "#gone",
    ]);
    expect(tagChips().map((c) => c.checked)).toEqual([true, false, true]);
    fixture.destroy();
    finish();
  }));

  it("opens the import page without dropping the selected tags", fakeAsync(() => {
    mount(["image"], [], "/projects?tag=image", OutletStubComponent, "admin");
    answer(expectList(), []);

    const link = Array.from(element.querySelectorAll("a")).find(
      (a) => a.textContent.trim() === "Import",
    );

    expect(link.getAttribute("href")).toBe("/projects/import?tag=image");
    fixture.destroy();
    finish();
  }));

  it("follows the tags of a link that opens it again", fakeAsync(() => {
    mount(["image", "video"], [], "/projects?tag=image");
    answer(expectList(), []);
    const router = TestBed.inject(Router);

    router.navigateByUrl("/projects?tag=video");
    tick();
    const other = expectList();
    answer(other, []);
    router.navigateByUrl("/projects");
    tick();
    const cleared = expectList();
    answer(cleared, []);

    expect(other.request.params.getAll("tags")).toEqual(["video"]);
    expect(cleared.request.params.has("tags")).toBe(false);
    expect(tagChips().map((c) => c.checked)).toEqual([false, false]);
    fixture.destroy();
    finish();
  }));

  it("keeps the selected tags in the URL", fakeAsync(() => {
    mount(["image", "video"], [], "/projects?folder=Marketing");
    answer(expectList(), []);
    const router = TestBed.inject(Router);

    tagChips()[0].click();
    tick();
    answer(expectList(), []);
    const selected = router.url;
    tagChips()[1].click();
    tick();
    answer(expectList(), []);
    const both = router.url;
    tagChips()[0].click();
    tagChips()[1].click();
    tick();
    controller.match((r) => r.url === "/api/projects");

    expect(selected).toBe("/projects?folder=Marketing&tag=image");
    expect(both).toBe("/projects?folder=Marketing&tag=image&tag=video");
    expect(router.url).toBe("/projects?folder=Marketing");
    fixture.destroy();
    finish();
  }));

  it("deletes a project through its row menu", fakeAsync(() => {
    setup();
    const rows = () => element.querySelectorAll("tbody tr:not(.folder)");

    deleteFromMenu(0);
    const request = controller.expectOne(`/api/projects/${PROJECT_A_ID}`);
    request.flush(null);
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(request.request.method).toBe("DELETE");
    expect(rows().length).toBe(0);
    fixture.destroy();
    finish();
  }));

  it("keeps the project and shows an alert when deleting fails", fakeAsync(() => {
    setup();
    expectConsoleError("Process HTTP error 404");

    deleteFromMenu(0);
    controller
      .expectOne(`/api/projects/${PROJECT_A_ID}`)
      .flush("Not found", { status: 404, statusText: "Not Found" });
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(element.querySelectorAll("tbody tr:not(.folder)").length).toBe(1);
    expect(element.querySelector("[role=alert]").textContent).toContain(
      "Not found",
    );
    fixture.destroy();
    finish();
  }));

  it("lists folders with counts above root projects", fakeAsync(() => {
    const list = setup();

    const folders = element.querySelectorAll("tr.folder");
    expect(
      Array.from(folders).map((f) => [
        f.querySelector(".name").textContent.trim(),
        f.querySelector(".count").textContent.trim(),
      ]),
    ).toEqual([
      ["Marketing", "1"],
      ["Sales", "3"],
    ]);
    expect(list.request.params.get("ungrouped")).toBe("true");
    expect(list.request.params.has("group")).toBe(false);
    fixture.destroy();
    finish();
  }));

  it("expands a folder in place and pages through it", fakeAsync(() => {
    setup();
    const toggle = (): HTMLButtonElement =>
      element.querySelectorAll<HTMLButtonElement>("button.folder")[1];

    toggle().click();
    const opened = expectList();
    answer(opened, [{ ...projectAPlain(), group: "Sales", cursor: "c1" }]);
    const nested = element.querySelectorAll("tr.nested:not(.more)").length;
    element.querySelector<HTMLButtonElement>("tr.more button").click();
    const more = expectList();
    answer(more, []);
    const moreAfterEmpty = element.querySelectorAll("tr.more").length;
    toggle().click();
    fixture.detectChanges();

    expect(opened.request.params.get("group")).toBe("Sales");
    expect(opened.request.params.has("ungrouped")).toBe(false);
    expect(nested).toBe(1);
    expect(more.request.params.get("cursor")).toBe("c1");
    expect(moreAfterEmpty).toBe(0);
    expect(element.querySelectorAll("tr.nested").length).toBe(0);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    fixture.destroy();
    finish();
  }));

  it("searches across folders and reveals a result in its folder", fakeAsync(() => {
    setup();
    const [tag] = tagChips();

    tag.click();
    const found = expectList();
    answer(found, [taggedProject()]);
    const folders = element.querySelectorAll("tr.folder").length;
    const rowGroup =
      element.querySelector<HTMLButtonElement>("td button.group");
    const groupText = rowGroup.textContent.trim();
    rowGroup.click();
    const root = controller.expectOne(
      (r) => r.url === "/api/projects" && r.params.has("ungrouped"),
    );
    const opened = controller.expectOne(
      (r) => r.url === "/api/projects" && r.params.get("group") === "Marketing",
    );
    answer(root, []);
    answer(opened, [taggedProject()]);

    expect(found.request.params.has("ungrouped")).toBe(false);
    expect(folders).toBe(0);
    expect(groupText).toBe("Marketing");
    expect(root.request.params.get("ungrouped")).toBe("true");
    expect(root.request.params.has("tags")).toBe(false);
    expect(element.querySelectorAll("tr.nested").length).toBe(1);
    fixture.destroy();
    finish();
  }));

  it("renames a folder inline and reloads the tree", fakeAsync(() => {
    setup();
    const renameButtons = () =>
      element.querySelectorAll<HTMLButtonElement>("tr.folder button.rename");
    const nameInput = () =>
      element.querySelector<HTMLInputElement>("tr.folder .rename input");

    renameButtons()[1].click();
    fixture.detectChanges();
    const initial = nameInput().value;
    nameInput().value = " Deals ";
    nameInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const rename = controller.expectOne("/api/projects/groups/rename");
    rename.flush({ renamed: 3 });
    tick(UI_DELAY);
    controller.expectOne("/api/projects/groups/counts").flush([
      { group: "Deals", count: 3 },
      { group: "Marketing", count: 1 },
    ]);
    fixture.detectChanges();

    expect(initial).toBe("Sales");
    expect(rename.request.method).toBe("POST");
    expect(rename.request.body).toEqual({ from: "Sales", to: "Deals" });
    expect(nameInput()).toBeNull();
    expect(
      Array.from(element.querySelectorAll("tr.folder .name")).map((n) =>
        n.textContent.trim(),
      ),
    ).toEqual(["Deals", "Marketing"]);
    fixture.destroy();
    finish();
  }));

  it("cancels a folder rename on escape", fakeAsync(() => {
    setup();
    element.querySelector<HTMLButtonElement>("tr.folder button.rename").click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>(
      "tr.folder .rename input",
    );

    input.value = "Other";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    fixture.detectChanges();

    controller.expectNone("/api/projects/groups/rename");
    expect(element.querySelector("tr.folder .rename input")).toBeNull();
    expect(element.querySelectorAll("tr.nested").length).toBe(0);
    fixture.destroy();
    finish();
  }));

  it("nests folders by path and unfolds them level by level", fakeAsync(() => {
    mount([], [{ group: "Marketing/Video", count: 2 }]);
    answer(expectList(), []);
    const names = () =>
      Array.from(element.querySelectorAll("tr.folder")).map((f) => [
        f.querySelector(".name").textContent.trim(),
        f.querySelector(".count").textContent.trim(),
        (f as HTMLElement).style.getPropertyValue("--depth"),
      ]);

    const collapsed = names();
    element.querySelector<HTMLButtonElement>("button.folder").click();
    const unfolded = names();
    element.querySelectorAll<HTMLButtonElement>("button.folder")[1].click();
    const opened = expectList();
    answer(opened, [{ ...projectAPlain(), group: "Marketing/Video" }]);

    expect(collapsed).toEqual([["Marketing", "2", "0"]]);
    expect(unfolded).toEqual([
      ["Marketing", "2", "0"],
      ["Video", "2", "1"],
    ]);
    expect(opened.request.params.get("group")).toBe("Marketing/Video");
    const nested = element.querySelector<HTMLElement>("tr.nested");
    expect(nested.style.getPropertyValue("--depth")).toBe("2");
    fixture.destroy();
    finish();
  }));

  it("shows 30-day run stats of each loaded project", fakeAsync(() => {
    setup();
    const [stats] = expectStats();

    stats.flush([
      {
        project: PROJECT_A_ID,
        runs: 12,
        succeeded: 9,
        failed: 2,
        interrupted: 1,
        successRate: 0.75,
        avgDurationMs: 4200,
        lastRunAt: "2026-11-09T10:00:00.000Z",
      },
    ]);
    fixture.detectChanges();

    expect(stats.request.params.getAll("projects")).toEqual([PROJECT_A_ID]);
    const cell = element.querySelector<HTMLElement>(
      "tr:not(.folder) [data-testid=project-runs]",
    );
    expect(
      cell.querySelector("div").textContent.replace(/\s+/g, " ").trim(),
    ).toBe("12 · 75%");
    expect(cell.querySelector("small").textContent.trim()).toBe("4.2s");
    fixture.destroy();
    finish();
  }));

  it("leaves the run stats empty when they fail to load", fakeAsync(() => {
    setup();
    const [stats] = expectStats();
    expectConsoleError("Process HTTP error 500");

    stats.flush("boom", { status: 500, statusText: "Server Error" });
    fixture.detectChanges();

    const cell = element.querySelector<HTMLElement>(
      "tr:not(.folder) [data-testid=project-runs]",
    );
    expect(cell.textContent.trim()).toBe("—");
    expect(element.querySelector("[role=alert]")).toBeNull();
    fixture.destroy();
    finish();
  }));

  it("loads the next page after the last project once the end of the list is in view", async () => {
    const nextPage = () =>
      controller.match(
        (r) =>
          r.url === "/api/projects" && r.params.get("cursor") === "cursor_a",
      );
    fakeAsync(() => {
      mount([], []);
      answer(expectList(), [{ ...projectAPlain(), cursor: "cursor_a" }]);
      finish();
    })();

    element.querySelector("[data-testid=load-more]").scrollIntoView();

    await expect.poll(() => nextPage().length).toBe(1);
  });

  it("shows the import page in a dialog and returns to projects on close", async () => {
    const modal = () => document.querySelector("tui-dialog");
    fakeAsync(() => {
      mount([], [], "/projects/import");
      answer(expectList(), []);
      finish();
    })();
    const router = TestBed.inject(Router);

    await expect
      .poll(() => {
        fixture.detectChanges();
        return modal()?.textContent;
      })
      .toContain("outlet");
    modal().querySelector<HTMLElement>("button[tuiButtonX]").click();
    await expect
      .poll(() => {
        fixture.detectChanges();
        return router.url;
      })
      .toBe("/projects");

    await expect.poll(modal).toBeNull();
    controller.verify();
  });

  it("adds an imported project on top of the filtered list and closes the dialog", async () => {
    const modal = () => document.querySelector("tui-dialog");
    const titles = () =>
      Array.from(element.querySelectorAll("tbody td.title a")).map((a) =>
        a.textContent.trim(),
      );
    fakeAsync(() => {
      mount(
        ["image"],
        [],
        "/projects/import?tag=image",
        ImportProjectComponent,
      );
      answer(expectList(), [projectAPlain()]);
      finish();
    })();
    const router = TestBed.inject(Router);
    await expect
      .poll(() => {
        fixture.detectChanges();
        return modal()?.querySelector("textarea");
      })
      .toBeTruthy();

    typeInto(modal().querySelector("textarea"), "name: Imported");
    fixture.detectChanges();
    modal()
      .querySelector<HTMLButtonElement>("footer button[tuiButton]:last-child")
      .click();
    const request = controller.expectOne("/api/pipelines/import");
    request.flush(projectBPlain());
    await expect
      .poll(() => {
        fixture.detectChanges();
        return router.url;
      })
      .toBe("/projects?tag=image");

    expect(request.request.body).toEqual({ yaml: "name: Imported" });
    expect(titles()).toEqual(["Project B", "Project A"]);
    await expect
      .poll(() => {
        fixture.detectChanges();
        return modal();
      })
      .toBeNull();
    // the short list leaves the scroll sentinel in view, so it asks for a next page
    controller
      .match((r) => r.url === "/api/projects")
      .forEach((r) => r.flush([]));
  });
});
