import {
  ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing";
import { AppComponent } from "src/app/app.component";
import { EditFlowTransformerComponent } from "src/app/edit-flow-transformer/edit-flow-transformer.component";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { projectWith } from "../fixtures/models";
import {
  Plain,
  smallGraphWithImageTransformer,
  smallGraphWithJsonTransformer,
} from "../fixtures/plain";
import { configureAppTestingModule } from "../helpers/editor";

describe("EditFlowTransformerComponent", () => {
  let project: Project;
  let manager: ProjectManager;
  let root: ComponentFixture<AppComponent>;

  function render(flowId: string) {
    const flow = project.pipeline.flows.get(flowId);
    const fixture = TestBed.createComponent(EditFlowTransformerComponent);
    Object.assign(fixture.componentInstance, {
      project,
      launchRequest: project.launchRequest,
      id: flowId,
      flow,
      from: { id: flow.from, node: project.pipeline.nodes.get(flow.from) },
      to: { id: flow.to, node: project.pipeline.nodes.get(flow.to) },
    });
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, flow };
  }

  function buttons(element: HTMLElement) {
    return element.querySelectorAll<HTMLButtonElement>("fieldset button");
  }

  function finish() {
    discardPeriodicTasks();
    flush();
  }

  function setup(pipeline: Plain, images?: string) {
    configureAppTestingModule();
    project = projectWith(pipeline);
    if (images !== undefined) {
      project.launchRequest.nodes.get("node_two").outputs.set("images", images);
    }
    manager = TestBed.inject(ProjectManager);
    manager.project = project;
    // The real root registers the popover host used by the JSON path picker.
    root = TestBed.createComponent(AppComponent);
    root.detectChanges();
  }

  describe("image array transformer", () => {
    it("steps the index within the bounds of the sample output", fakeAsync(() => {
      setup(smallGraphWithImageTransformer(1), "a.png|b.png|c.png");
      const { fixture, element, flow } = render("two_to_four");
      const [down, up] = Array.from(buttons(element));

      up.click();
      up.click();
      fixture.detectChanges();
      const afterUp = flow.transformer.index;
      down.click();
      down.click();
      down.click();
      fixture.detectChanges();

      expect(afterUp).toBe(2);
      expect(flow.transformer.index).toBe(0);
      expect(element.querySelector(".index").textContent.trim()).toBe("1");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("does not advance the index without a sample output", fakeAsync(() => {
      setup(smallGraphWithImageTransformer(0), "");
      const { element, flow } = render("two_to_four");

      buttons(element)[1].click();

      expect(flow.transformer.index).toBe(0);
      expect(manager.status.value).toBeNull();
      finish();
    }));
  });

  describe("JSON transformer", () => {
    it("picks a path from the sample JSON output", fakeAsync(() => {
      setup(smallGraphWithJsonTransformer(""));
      const { fixture, element, flow } = render("two_to_three");
      const other = project.pipeline.flows.get("one_to_two");

      (element.querySelector(".json button") as HTMLButtonElement).click();
      root.detectChanges();
      tick();
      const paths = Array.from(
        (root.nativeElement as HTMLElement).querySelectorAll(".paths a"),
      );
      const answer = paths.find(
        (a) => a.textContent.trim() === "data.answer",
      ) as HTMLElement;
      answer.click();
      fixture.detectChanges();

      expect(paths.map((a) => a.textContent.trim())).toContain("data.answer");
      expect(flow.transformer.path).toBe("data.answer");
      expect(other.transformer).toBeUndefined();
      expect(element.querySelector(".json button").textContent.trim()).toBe(
        "data.answer",
      );
      expect(manager.status.value).toBe("dirty");
      finish();
    }));
  });
});
