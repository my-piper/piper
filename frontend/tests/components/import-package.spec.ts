import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { ImportPackageComponent } from "src/app/node-packages/import/import-package.component";
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
 * Wire contract (backend/api/node-packages/upload-archive.ts, admin only):
 * POST /api/node-packages/actions/upload-archive, multipart `file` →
 * `{ nodePackage, version, nodes, dropped }`; rejections are DataErrors with
 * `details` listing the offending files.
 */
const UPLOAD_URL = "/api/node-packages/actions/upload-archive";

function setup() {
  seedAuthorization(userPlain("admin"));
  configureAppTestingModule([
    { path: "", component: OutletStubComponent },
    { path: "packages/import", component: ImportPackageComponent },
    { path: "packages", component: OutletStubComponent },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl("/packages/import");
  tick();
  fixture.detectChanges();
  const element = fixture.debugElement.query(
    By.directive(ImportPackageComponent),
  ).nativeElement as HTMLElement;

  return {
    fixture,
    element,
    controller,
    router,
    choose: (file: File) => {
      const input = element.querySelector(
        "input[type=file]",
      ) as HTMLInputElement;
      const files = new DataTransfer();
      files.items.add(file);
      input.files = files.files;
      input.dispatchEvent(new Event("change"));
      fixture.detectChanges();
    },
    settle: () => {
      tick(UI_DELAY);
      fixture.detectChanges();
    },
  };
}

describe("ImportPackageComponent", () => {
  it("uploads a chosen zip as a package archive and returns to packages", fakeAsync(() => {
    const page = setup();
    const zip = new File(["PK"], "artworks.zip", { type: "application/zip" });

    page.choose(zip);
    const request = page.controller.expectOne(UPLOAD_URL);
    request.flush({
      nodePackage: "artworks",
      version: 3,
      nodes: ["ask_llm_agent"],
      dropped: [],
    });
    page.settle();

    expect(request.request.method).toBe("POST");
    expect((request.request.body as FormData).get("file")).toEqual(zip);
    expect(page.router.url).toBe("/packages");
    page.controller.verify();
    finish();
  }));

  it("shows why an archive was rejected", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const page = setup();

    page.choose(new File(["PK"], "artworks.zip"));
    page.controller.expectOne(UPLOAD_URL).flush(
      {
        message: "Archive imports files outside of it",
        details: ["utils.js:2: ../../utils/node.js"],
      },
      { status: 400, statusText: "Bad Request" },
    );
    page.settle();

    expect(page.router.url).toBe("/packages/import");
    const informer = page.element.querySelector("app-informer");
    expect(informer.textContent).toContain(
      "Archive imports files outside of it",
    );
    expect(informer.textContent).toContain("utils.js:2: ../../utils/node.js");
    finish();
  }));
});
