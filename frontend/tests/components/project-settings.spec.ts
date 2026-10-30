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
 * GET /api/projects/groups suggests existing groups and
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
      Project
    );
    element = fixture.nativeElement;
    fixture.detectChanges();
    controller.expectOne("/api/projects/groups").flush(["Marketing", "Sales"]);
    fixture.detectChanges();
  }

  function input(): HTMLInputElement {
    return element.querySelector("input[formControlName=group]");
  }

  function save(value: string) {
    const field = input();
    field.value = value;
    field.dispatchEvent(new Event("input"));
    element.querySelector<HTMLButtonElement>("footer button").click();
    return controller.expectOne(`/api/projects/${PROJECT_A_ID}/settings`);
  }

  afterEach(() => controller.verify());

  it("shows the current group and suggests existing ones", fakeAsync(() => {
    setup("Marketing");

    const options = element.querySelectorAll("datalist option");
    expect(input().value).toBe("Marketing");
    expect(Array.from(options).map((o) => o.getAttribute("value"))).toEqual([
      "Marketing",
      "Sales",
    ]);
    fixture.destroy();
    finish();
  }));

  it("saves a trimmed group and emits the update", fakeAsync(() => {
    setup();
    const emitted: Project[] = [];
    fixture.componentInstance.updated.subscribe((p) => emitted.push(p));

    const request = save("  Sales ");
    request.flush({ group: "Sales" });
    tick(UI_DELAY);

    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual(
      jasmine.objectContaining({ group: "Sales" })
    );
    expect(emitted.map((p) => p.group)).toEqual(["Sales"]);
    fixture.destroy();
    finish();
  }));

  it("removes the group when the field is cleared", fakeAsync(() => {
    setup("Marketing");

    const request = save("   ");
    request.flush({ group: null });
    tick(UI_DELAY);

    expect(request.request.body).toEqual(
      jasmine.objectContaining({ group: null })
    );
    fixture.destroy();
    finish();
  }));
});
