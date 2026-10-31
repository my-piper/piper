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
import { ProjectsComponent } from "src/app/projects/projects.component";
import { projectAPlain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

/**
 * GET /api/projects/tags/available lists tags of visible projects and
 * GET /api/projects?tags=… returns projects having all of them
 * (backend/api/projects/tags/list-available-tags.ts, backend/api/projects/list.ts).
 * GET /api/projects/groups/counts counts visible projects per group and
 * GET /api/projects?group=… returns projects of that group while
 * GET /api/projects?ungrouped=true returns projects outside any group
 * (backend/api/projects/groups/list-group-counts.ts).
 */
const UI_DELAY = 250;

function taggedProject() {
  return { ...projectAPlain(), tags: ["image", "video"], group: "Marketing" };
}

describe("ProjectsComponent tags and groups", () => {
  let fixture: ComponentFixture<ProjectsComponent>;
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

  function setup() {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule();
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectsComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
    controller
      .expectOne("/api/projects/tags/available")
      .flush(["image", "video"]);
    controller.expectOne("/api/projects/groups/counts").flush([
      { group: "Marketing", count: 1 },
      { group: "Sales", count: 3 },
    ]);
    const list = expectList();
    answer(list, [taggedProject()]);
    return list;
  }

  afterEach(() => controller.verify());

  it("lists available tags without filtering initially", fakeAsync(() => {
    const list = setup();

    const chips =
      element.querySelectorAll<HTMLButtonElement>("form.tags button");
    expect(Array.from(chips).map((c) => c.textContent.trim())).toEqual([
      "#image",
      "#video",
    ]);
    expect(list.request.params.has("tags")).toBeFalse();
    fixture.destroy();
    finish();
  }));

  it("filters by every selected tag chip", fakeAsync(() => {
    setup();
    const chips =
      element.querySelectorAll<HTMLButtonElement>("form.tags button");

    chips[0].click();
    answer(expectList(), [taggedProject()]);
    chips[1].click();
    const list = expectList();
    answer(list, [taggedProject()]);

    expect(list.request.params.getAll("tags")).toEqual(["image", "video"]);
    expect(chips[1].classList).toContain("selected");
    fixture.destroy();
    finish();
  }));

  it("toggles the filter from a project row tag", fakeAsync(() => {
    setup();
    const rowTag = (): HTMLButtonElement =>
      element.querySelector("td button.tag");

    rowTag().click();
    const selected = expectList();
    answer(selected, [taggedProject()]);
    rowTag().click();
    const cleared = expectList();
    answer(cleared, [taggedProject()]);

    expect(selected.request.params.getAll("tags")).toEqual(["image"]);
    expect(cleared.request.params.has("tags")).toBeFalse();
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
    expect(list.request.params.has("group")).toBeFalse();
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
    expect(opened.request.params.has("ungrouped")).toBeFalse();
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
    const tag = element.querySelector<HTMLButtonElement>("form.tags button");

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

    expect(found.request.params.has("ungrouped")).toBeFalse();
    expect(folders).toBe(0);
    expect(groupText).toBe("Marketing");
    expect(root.request.params.get("ungrouped")).toBe("true");
    expect(root.request.params.has("tags")).toBeFalse();
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
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule();
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectsComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
    controller.expectOne("/api/projects/tags/available").flush([]);
    controller
      .expectOne("/api/projects/groups/counts")
      .flush([{ group: "Marketing/Video", count: 2 }]);
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
});
