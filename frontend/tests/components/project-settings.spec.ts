import { HttpTestingController } from "@angular/common/http/testing";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ProjectSettingsComponent } from "src/app/project-settings/project-settings.component";
import { Project } from "src/models/project";
import { toInstance } from "src/utils/models";
import { PROJECT_A_ID, projectAPlain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

/**
 * GET /api/projects/groups lists existing groups for the dropdown and
 * POST /api/projects/:_id/settings stores the trimmed group or null
 * (backend/api/projects/update-project-settings.ts).
 */
const UI_DELAY = 250;

describe("ProjectSettingsComponent", () => {
  let fixture: ComponentFixture<ProjectSettingsComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  function setup(group?: string) {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule();
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectSettingsComponent);
    fixture.componentInstance.project = toInstance(
      { ...projectAPlain(), group },
      Project,
    );
    element = fixture.nativeElement;
    fixture.detectChanges();
    controller.expectOne("/api/projects/groups").flush(["Marketing", "Sales"]);
    fixture.detectChanges();
  }

  function select(): HTMLSelectElement {
    return element.querySelector("select[formControlName=group]");
  }

  function pick(label: string) {
    const field = select();
    field.selectedIndex = Array.from(field.options).findIndex(
      (o) => o.textContent.trim() === label,
    );
    field.dispatchEvent(new Event("change"));
    fixture.detectChanges();
  }

  function newGroup(): HTMLInputElement {
    return element.querySelector("input[formControlName=newGroup]");
  }

  function saveButton(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>("footer button");
  }

  function save() {
    saveButton().click();
    return controller.expectOne(`/api/projects/${PROJECT_A_ID}/settings`);
  }

  afterEach(() => controller.verify());

  it("selects the current group among existing ones", fakeAsync(() => {
    setup("Marketing");

    const options = Array.from(select().options).map((o) =>
      o.textContent.trim(),
    );
    expect(options).toEqual(["No group", "Marketing", "Sales", "+ New group…"]);
    expect(select().selectedOptions[0].textContent.trim()).toBe("Marketing");
    expect(newGroup()).toBeNull();
    fixture.destroy();
    finish();
  }));

  it("keeps a current group missing from the suggestions", fakeAsync(() => {
    setup("Legacy");

    const options = Array.from(select().options).map((o) =>
      o.textContent.trim(),
    );
    expect(options).toContain("Legacy");
    expect(select().selectedOptions[0].textContent.trim()).toBe("Legacy");
    fixture.destroy();
    finish();
  }));

  it("saves a selected group and emits the update", fakeAsync(() => {
    setup();
    const emitted: Project[] = [];
    fixture.componentInstance.updated.subscribe((p) => emitted.push(p));
    pick("Sales");

    const request = save();
    request.flush({ group: "Sales" });
    tick(UI_DELAY);

    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual(
      jasmine.objectContaining({ group: "Sales" }),
    );
    expect(emitted.map((p) => p.group)).toEqual(["Sales"]);
    fixture.destroy();
    finish();
  }));

  it("saves a trimmed new group", fakeAsync(() => {
    setup("Marketing");
    pick("+ New group…");
    newGroup().value = "  Support ";
    newGroup().dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const request = save();
    request.flush({ group: "Support" });
    tick(UI_DELAY);

    expect(request.request.body).toEqual(
      jasmine.objectContaining({ group: "Support" }),
    );
    fixture.destroy();
    finish();
  }));

  it("requires a name for a new group", fakeAsync(() => {
    setup();
    pick("+ New group…");
    newGroup().value = "   ";
    newGroup().dispatchEvent(new Event("input"));

    fixture.detectChanges();

    expect(saveButton().disabled).toBeTrue();
    fixture.destroy();
    finish();
  }));

  it("removes the group when no group is selected", fakeAsync(() => {
    setup("Marketing");
    pick("No group");

    const request = save();
    request.flush({ group: null });
    tick(UI_DELAY);

    expect(request.request.body).toEqual(
      jasmine.objectContaining({ group: null }),
    );
    fixture.destroy();
    finish();
  }));
});
