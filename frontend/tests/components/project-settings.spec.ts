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
import { expectConsoleError } from "../helpers/console";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { optionLabels, selectByLabel, selectedLabel } from "../helpers/taiga";

/**
 * GET /api/projects/groups lists existing Folders for the dropdown and
 * POST /api/projects/:_id/settings stores the trimmed Folder (`group` on the
 * wire) or null (backend/api/projects/update-project-settings.ts).
 */
const UI_DELAY = 250;

describe("ProjectSettingsComponent", () => {
  let fixture: ComponentFixture<ProjectSettingsComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  function setup(group?: string) {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule([], { nativeSelect: true });
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
    selectByLabel(select(), label);
    fixture.detectChanges();
  }

  function newGroup(): HTMLInputElement {
    return element.querySelector("input[formControlName=newGroup]");
  }

  function saveButton(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>("button[type=submit]");
  }

  function save() {
    saveButton().click();
    return controller.expectOne(`/api/projects/${PROJECT_A_ID}/settings`);
  }

  afterEach(() => controller.verify());

  it("selects the current folder among existing ones", fakeAsync(() => {
    setup("Marketing");

    expect(
      element.querySelector("label[for=project-folder]").textContent.trim(),
    ).toBe("Folder");
    expect(optionLabels(select())).toEqual([
      "No folder",
      "Marketing",
      "Sales",
      "+ New folder…",
    ]);
    expect(selectedLabel(select())).toBe("Marketing");
    expect(newGroup()).toBeNull();
    fixture.destroy();
    finish();
  }));

  it("keeps a current folder missing from the suggestions", fakeAsync(() => {
    setup("Legacy");

    expect(optionLabels(select())).toContain("Legacy");
    expect(selectedLabel(select())).toBe("Legacy");
    fixture.destroy();
    finish();
  }));

  it("shows a project outside any folder as in no folder", fakeAsync(() => {
    setup();

    expect(selectedLabel(select())).toBe("No folder");
    fixture.destroy();
    finish();
  }));

  it("saves a selected folder and emits the update", fakeAsync(() => {
    setup();
    const emitted: Project[] = [];
    fixture.componentInstance.updated.subscribe((p) => emitted.push(p));
    pick("Sales");

    const request = save();
    request.flush({ group: "Sales" });
    tick(UI_DELAY);

    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual(
      expect.objectContaining({ group: "Sales" }),
    );
    expect(emitted.map((p) => p.group)).toEqual(["Sales"]);
    fixture.destroy();
    finish();
  }));

  it("saves a trimmed new folder", fakeAsync(() => {
    setup("Marketing");
    pick("+ New folder…");
    newGroup().value = "  Support ";
    newGroup().dispatchEvent(new Event("input"));
    fixture.detectChanges();

    const request = save();
    request.flush({ group: "Support" });
    tick(UI_DELAY);

    expect(request.request.body).toEqual(
      expect.objectContaining({ group: "Support" }),
    );
    fixture.destroy();
    finish();
  }));

  it("requires a name for a new folder", fakeAsync(() => {
    setup();
    pick("+ New folder…");
    newGroup().value = "   ";
    newGroup().dispatchEvent(new Event("input"));

    fixture.detectChanges();

    expect(saveButton().disabled).toBe(true);
    fixture.destroy();
    finish();
  }));

  it("removes the folder when no folder is selected", fakeAsync(() => {
    setup("Marketing");
    pick("No folder");

    const request = save();
    request.flush({ group: null });
    tick(UI_DELAY);

    expect(request.request.body).toEqual(
      expect.objectContaining({ group: null }),
    );
    fixture.destroy();
    finish();
  }));

  it("tells that a rejected folder was not saved", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    setup();
    pick("Sales");

    save().flush("Folder name is too long", {
      status: 400,
      statusText: "Bad Request",
    });
    tick(UI_DELAY);
    fixture.detectChanges();

    const alert = element.querySelector("[role=alert]");
    expect(alert.textContent).toContain("Folder name is too long");
    expect(alert.textContent).toContain("Your data were not saved!");
    fixture.destroy();
    finish();
  }));
});
