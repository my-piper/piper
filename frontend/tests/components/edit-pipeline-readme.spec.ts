import { fakeAsync, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of } from "rxjs";
import { vi } from "vitest";
import { EditPipelineReadmeComponent } from "src/app/edit-pipeline-readme/edit-pipeline-readme.component";
import { ProjectManager } from "src/services/project.manager";
import { projectA } from "../fixtures/models";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { typeInto } from "../helpers/editor-stubs";

function setup() {
  seedAuthorization(userPlain("owner"));
  const project = projectA();
  project.pipeline.readme = "# Old";
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { data: of({ project }) },
  });
  const manager = TestBed.inject(ProjectManager);
  manager.project = project;
  const fixture = TestBed.createComponent(EditPipelineReadmeComponent);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const footer = () => element.querySelector("form footer");
  return { fixture, element, project, manager, footer };
}

describe("EditPipelineReadmeComponent", () => {
  it("saves the edited README into the pipeline", fakeAsync(() => {
    const page = setup();
    typeInto(page.element.querySelector("textarea"), "# New");
    page.fixture.detectChanges();
    const save = Array.from(page.footer().querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Save",
    );

    save.click();

    expect(page.project.pipeline.readme).toBe("# New");
    expect(page.manager.status.value).toBe("dirty");
    finish();
  }));

  it("offers the preview and closes it with Escape", fakeAsync(() => {
    const page = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate");
    const view = Array.from(page.footer().querySelectorAll("a")).find(
      (a) => a.textContent.trim() === "View",
    );
    page.fixture.componentInstance.modal = {} as never;
    page.fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(view).toBeDefined();
    expect(navigate).toHaveBeenCalledWith(["./"], expect.anything());
    finish();
  }));
});
