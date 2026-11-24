import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { ImportProjectComponent } from "src/app/projects/import/import-project.component";
import { UI_DELAY } from "src/consts/ui";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";

/**
 * Wire contract (backend/api/pipelines/import-pipeline.ts):
 * POST /api/pipelines/import `{ yaml }` → the new Project; a Pipeline that
 * can't be imported is a DataError whose `details` list every problem.
 */
const IMPORT_URL = "/api/pipelines/import";

function setup() {
  seedAuthorization(userPlain());
  configureAppTestingModule([
    { path: "", component: OutletStubComponent },
    { path: "projects/import", component: ImportProjectComponent },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl("/projects/import");
  tick();
  fixture.detectChanges();
  const debug = fixture.debugElement.query(
    By.directive(ImportProjectComponent),
  );
  const component = debug.componentInstance as ImportProjectComponent;
  const element = debug.nativeElement as HTMLElement;

  return {
    controller,
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

describe("ImportProjectComponent", () => {
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
});
