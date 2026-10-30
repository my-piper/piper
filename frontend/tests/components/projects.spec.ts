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
 * GET /api/projects/groups lists groups of visible projects and
 * GET /api/projects?group=… returns projects of that group
 * (backend/api/projects/groups/list-groups.ts).
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
    controller.expectOne("/api/projects/groups").flush(["Marketing", "Sales"]);
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

  it("lists groups with all projects selected initially", fakeAsync(() => {
    const list = setup();

    const chips =
      element.querySelectorAll<HTMLButtonElement>("nav.groups button");
    expect(Array.from(chips).map((c) => c.textContent.trim())).toEqual([
      "All",
      "Marketing",
      "Sales",
    ]);
    expect(chips[0].classList).toContain("selected");
    expect(list.request.params.has("group")).toBeFalse();
    fixture.destroy();
    finish();
  }));

  it("filters by the selected group and back to all", fakeAsync(() => {
    setup();
    const chips =
      element.querySelectorAll<HTMLButtonElement>("nav.groups button");

    chips[2].click();
    const selected = expectList();
    answer(selected, []);
    chips[0].click();
    const cleared = expectList();
    answer(cleared, [taggedProject()]);

    expect(selected.request.params.get("group")).toBe("Sales");
    expect(cleared.request.params.has("group")).toBeFalse();
    fixture.destroy();
    finish();
  }));

  it("toggles the group filter from a project row", fakeAsync(() => {
    setup();
    const rowGroup = (): HTMLButtonElement =>
      element.querySelector("td button.group");

    rowGroup().click();
    const selected = expectList();
    answer(selected, [taggedProject()]);
    rowGroup().click();
    const cleared = expectList();
    answer(cleared, [taggedProject()]);

    expect(selected.request.params.get("group")).toBe("Marketing");
    expect(rowGroup().textContent.trim()).toBe("Marketing");
    expect(cleared.request.params.has("group")).toBeFalse();
    fixture.destroy();
    finish();
  }));
});
