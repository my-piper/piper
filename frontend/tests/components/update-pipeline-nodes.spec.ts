import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { UpdatePipelineNodesComponent } from "src/app/update-pipeline-nodes/update-pipeline-nodes.component";
import { UI_DELAY } from "src/consts/ui";
import { ProjectManager } from "src/services/project.manager";
import { projectA } from "../fixtures/models";
import { PROJECT_A_ID, smallGraphPipeline, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

/**
 * GET /api/projects/:id/check-node-updates lists, per node id, the node in
 * the pipeline (`current`), the catalog version (`updated`) and a diff.
 */
const UPDATES_URL = `/api/projects/${PROJECT_A_ID}/check-node-updates`;

function setup() {
  seedAuthorization(userPlain("owner"));
  const project = projectA();
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { data: of({ project }) },
  });
  const manager = TestBed.inject(ProjectManager);
  manager.project = project;
  const fixture = TestBed.createComponent(UpdatePipelineNodesComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  const element: HTMLElement = fixture.nativeElement;
  const button = (label: string) =>
    Array.from(element.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === label,
    );
  return { fixture, controller, element, project, manager, button };
}

describe("UpdatePipelineNodesComponent", () => {
  it("updates every listed node with Update all", fakeAsync(() => {
    const page = setup();
    const { node_one } = (
      smallGraphPipeline() as { nodes: Record<string, object> }
    ).nodes;
    const updated = { ...node_one, title: "Generate text v2", version: 2 };
    page.controller.expectOne(UPDATES_URL).flush({
      updates: {
        node_one: { current: node_one, updated, changes: updated },
      },
    });
    tick(UI_DELAY);
    page.fixture.detectChanges();

    page.button("Update all").click();
    page.fixture.detectChanges();

    expect(page.project.pipeline.nodes.get("node_one").title).toBe(
      "Generate text v2",
    );
    expect(page.manager.status.value).toBe("dirty");
    expect(page.button("Update all").disabled).toBe(true);
    page.controller.verify();
    finish();
  }));

  it("drops the Flows of the sockets an updated node no longer has", fakeAsync(() => {
    const page = setup();
    const { node_two } = (
      smallGraphPipeline() as {
        nodes: Record<string, { outputs: Record<string, unknown> }>;
      }
    ).nodes;
    const updated = { ...node_two, outputs: {}, version: 2 };
    page.controller.expectOne(UPDATES_URL).flush({
      updates: {
        node_two: { current: node_two, updated, changes: updated },
      },
    });
    tick(UI_DELAY);
    page.fixture.detectChanges();

    page.button("Update all").click();
    page.fixture.detectChanges();

    const { pipeline } = page.project;
    expect(pipeline.nodes.get("node_two").version).toBe(2);
    expect(pipeline.outputs.get("result").flows.size).toBe(0);
    expect([...pipeline.flows.keys()]).toEqual(["one_to_two"]);
    expect(page.manager.status.value).toBe("dirty");
    page.controller.verify();
    finish();
  }));

  it("says so when no catalog node has an update", fakeAsync(() => {
    const page = setup();

    page.controller.expectOne(UPDATES_URL).flush({ updates: {} });
    tick(UI_DELAY);
    page.fixture.detectChanges();

    expect(page.element.textContent).toContain(
      "No updates in nodes from catalog.",
    );
    expect(page.button("Update all")).toBeUndefined();
    page.controller.verify();
    finish();
  }));
});
