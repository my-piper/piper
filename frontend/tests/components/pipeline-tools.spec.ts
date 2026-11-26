import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { PipelineToolsComponent } from "src/app/pipeline-tools/pipeline-tools.component";
import { NodeCatalog } from "src/models/node";
import { ProjectManager } from "src/services/project.manager";
import { toInstance } from "src/utils/models";
import { projectA } from "../fixtures/models";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

function setup() {
  seedAuthorization(userPlain("owner"));
  const project = projectA();
  project.pipeline.nodes.get("node_one").catalog = toInstance(
    { _id: "generate_text", version: 3, package: "tools" },
    NodeCatalog,
  );
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { data: of({ project }) },
  });
  TestBed.inject(ProjectManager).project = project;
  const fixture = TestBed.createComponent(PipelineToolsComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    version: () => element.querySelector<HTMLInputElement>("form input"),
    publish: () => {
      element.querySelector<HTMLButtonElement>("form button").click();
      fixture.detectChanges();
    },
  };
}

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

describe("PipelineToolsComponent", () => {
  it("starts the version at 10", fakeAsync(() => {
    const page = setup();

    expect(page.version().value).toBe("10");
    finish();
  }));

  it("publishes catalog nodes with the typed version", fakeAsync(() => {
    const page = setup();
    type(page.version(), "7");

    page.publish();
    const request = page.controller.expectOne(
      (r) => r.method === "POST" && r.url === "/api/nodes",
    );
    const body = request.request.body as { catalog: { version: unknown } };
    request.flush({});
    tick();
    page.fixture.detectChanges();

    expect(body.catalog.version).toBe(7);
    expect(
      Array.from(page.element.querySelectorAll("tbody tr")).map((row) =>
        row.lastElementChild.textContent.trim(),
      ),
    ).toEqual(["7", "-"]);
    page.controller.verify();
    finish();
  }));
});
