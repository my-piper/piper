import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { ImportV1ProjectComponent } from "src/app/projects/import-v1/import-v1-project.component";
import { UI_DELAY } from "src/consts/ui";
import { Project } from "src/models/project";
import { projectAPlain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";

/**
 * Wire contract (backend/api/pipelines/import-v1-pipeline.ts, admin only):
 * POST /api/pipelines/import/v1 `{ yaml }` → the new Project with `warnings`
 * about Script Nodes to rewrite; a Pipeline that can't be brought over is a
 * DataError whose `details` list every problem.
 */
const IMPORT_URL = "/api/pipelines/import/v1";

function setup() {
  seedAuthorization(userPlain());
  configureAppTestingModule([
    { path: "", component: OutletStubComponent },
    { path: "projects", component: OutletStubComponent },
    { path: "projects/import-v1", component: ImportV1ProjectComponent },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl("/projects/import-v1");
  tick();
  fixture.detectChanges();
  const debug = fixture.debugElement.query(
    By.directive(ImportV1ProjectComponent),
  );
  const component = debug.componentInstance as ImportV1ProjectComponent;
  const element = debug.nativeElement as HTMLElement;

  return {
    controller,
    router,
    component,
    element,
    importYaml: (yaml: string) => {
      component.form.patchValue({ yaml });
      (element.querySelector("footer button") as HTMLButtonElement).click();
      fixture.detectChanges();
    },
    settle: () => {
      tick(UI_DELAY);
      fixture.detectChanges();
    },
  };
}

describe("ImportV1ProjectComponent", () => {
  it("says it imports Pipelines from Piper v1", fakeAsync(() => {
    const page = setup();

    expect(page.element.querySelector("h1").textContent).toContain(
      "Import a Pipeline from Piper v1",
    );
    finish();
  }));

  it("lists every problem that kept the Pipeline out and keeps the pasted YAML", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const page = setup();

    page.importYaml("name: Duo");
    page.controller.expectOne(IMPORT_URL).flush(
      {
        message: "Pipeline can't be imported",
        details: [
          "Node resize: uses require('sharp'), which scripts can't load any more",
          "Node qwen_edit (artworks): no installed Node Definition matches it",
        ],
      },
      { status: 400, statusText: "Bad Request" },
    );
    page.settle();

    const alert = page.element.querySelector("[role=alert]");
    expect(alert.textContent).toContain("Pipeline can't be imported");
    expect(alert.textContent).toContain("Node resize: uses require('sharp')");
    expect(alert.textContent).toContain("Node qwen_edit (artworks)");
    expect(page.component.form.getRawValue().yaml).toBe("name: Duo");
    expect(page.component.progress.importing).toBe(false);
    page.controller.verify();
    finish();
  }));

  it("clears the last error when the Pipeline is imported again", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const page = setup();
    page.importYaml("name: [broken");
    page.controller
      .expectOne(IMPORT_URL)
      .flush(
        { message: "Pipeline YAML is invalid" },
        { status: 400, statusText: "Bad Request" },
      );
    page.settle();

    page.importYaml("name: Fixed pipeline");

    expect(page.element.querySelector("[role=alert]")).toBeNull();
    page.controller.expectOne(IMPORT_URL);
    page.controller.verify();
    finish();
  }));

  it("closes once the Pipeline is imported with nothing to rewrite", fakeAsync(() => {
    const page = setup();
    const imported: Project[] = [];
    page.component.imported.subscribe((project) => imported.push(project));

    page.importYaml("name: Duo");
    page.controller
      .expectOne(IMPORT_URL)
      .flush({ ...projectAPlain(), warnings: [] });
    page.settle();

    expect(imported.map((project) => project._id)).toEqual([
      projectAPlain()["_id"],
    ]);
    expect(page.router.url).toBe("/projects");
    page.controller.verify();
    finish();
  }));

  it("lists the Nodes to rewrite after the import and closes when they are read", fakeAsync(() => {
    const page = setup();
    const imported: Project[] = [];
    page.component.imported.subscribe((project) => imported.push(project));

    page.importYaml("name: Duo");
    page.controller.expectOne(IMPORT_URL).flush({
      ...projectAPlain(),
      warnings: [
        "Node resize: uses require('sharp'), which scripts can't load: rewrite the Node before it runs",
      ],
    });
    page.settle();

    expect(imported.length).toBe(1);
    expect(page.router.url).toBe("/projects/import-v1");
    const alert = page.element.querySelector("[role=status]");
    expect(alert.textContent).toContain("Pipeline imported");
    expect(alert.textContent).toContain("Node resize: uses require('sharp')");
    expect(
      (page.element.querySelector("footer button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    (alert.querySelector("button") as HTMLButtonElement).click();
    page.settle();

    expect(page.router.url).toBe("/projects");
    page.controller.verify();
    finish();
  }));
});
