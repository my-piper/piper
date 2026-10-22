import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { EditNodeInputsComponent } from "src/app/edit-node-inputs/edit-node-inputs.component";
import { NodeToLaunch } from "src/models/launch-request";
import { Project } from "src/models/project";
import { NodeFromProjectResolver } from "src/resolvers/node";
import { ProjectManager } from "src/services/project.manager";
import { mapTo } from "src/utils/models";
import { projectA, projectWith } from "../fixtures/models";
import { Plain, smallGraphPipeline, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

const PROJECT_URL = "/project";

/** One rendered input row, found by its visible title. */
function inputBlock(element: HTMLElement, title: string): HTMLElement {
  const block = Array.from(
    element.querySelectorAll<HTMLElement>("fieldset.inputs .input"),
  ).find((e) => e.textContent.includes(title));
  if (!block) {
    throw new Error(`Input ${title} is not rendered`);
  }
  return block;
}

function buttonWithText(element: HTMLElement, text: string): HTMLElement {
  const button = Array.from(element.querySelectorAll("button")).find((b) =>
    b.textContent.includes(text),
  );
  if (!button) {
    throw new Error(`Button ${text} is not rendered`);
  }
  return button;
}

/** Project A without per-node launch values, so input defaults apply. */
function projectWithoutNodeValues(): Project {
  const project = projectA();
  project.launchRequest.nodes.clear();
  return project;
}

/** node_two with a dynamic "Image #" input that users can clone. */
function dynamicProject(): Project {
  const pipeline = smallGraphPipeline() as {
    nodes: Record<string, { inputs: Record<string, Plain> }>;
  };
  pipeline.nodes["node_two"].inputs["image"] = {
    order: 5,
    title: "Image",
    type: "image",
    dynamic: { id: "image_#", title: "Image #" },
  };
  return projectWith(pipeline);
}

/**
 * Renders EditNodeInputsComponent through the real NodeFromProjectResolver
 * under a componentless parent route that resolves the project, as the canvas
 * route tree does. Project A's launch request stores node_one
 * `temperature: 0` and node_two `flag: true, count: 3, label: "custom"`.
 * Call inside `fakeAsync`.
 */
function setup(nodeId: string, project: Project = projectA()) {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule([
    {
      path: PROJECT_URL.slice(1),
      resolve: { project: () => project },
      children: [
        {
          path: "nodes/:id",
          component: EditNodeInputsComponent,
          resolve: { node: NodeFromProjectResolver },
        },
      ],
    },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const manager = TestBed.inject(ProjectManager);
  manager.project = project;
  const router = TestBed.inject(Router);

  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl(`${PROJECT_URL}/nodes/${nodeId}`);
  tick();
  fixture.detectChanges();
  controller.expectOne("/api/me").flush(userPlain("owner"));
  fixture.detectChanges();

  const debug = fixture.debugElement.query(
    By.directive(EditNodeInputsComponent),
  );
  const element = debug.nativeElement as HTMLElement;
  const detectChanges = () => fixture.detectChanges();

  return {
    component: debug.componentInstance as EditNodeInputsComponent,
    element,
    project,
    manager,
    router,
    detectChanges,
    type: (field: HTMLInputElement, value: string) => {
      field.value = value;
      field.dispatchEvent(new Event("input"));
      detectChanges();
    },
    click: (target: HTMLElement) => {
      target.click();
      detectChanges();
    },
    title: () => element.querySelector("header input") as HTMLInputElement,
    start: () =>
      element.querySelector("header input[type=checkbox]") as HTMLInputElement,
    field: (title: string) =>
      inputBlock(element, title).querySelector("input") as HTMLInputElement,
    launchInputs: () => project.launchRequest.nodes.get(nodeId)?.inputs,
  };
}

describe("EditNodeInputsComponent", () => {
  describe("rendering", () => {
    it("shows the node title, auto start and every input in order", fakeAsync(() => {
      const { element, title, start } = setup("node_two");

      const titles = Array.from(
        element.querySelectorAll("fieldset.inputs .input"),
      ).map((e) => e.textContent.trim().split("\n")[0].trim());

      expect(title().value).toBe("Make JSON");
      expect(start().checked).toBeFalse();
      expect(titles).toEqual(["Text", "Flag", "Count", "Label"]);
      finish();
    }));

    it("reflects a start node and a stored zero over the default", fakeAsync(() => {
      const { start, field } = setup("node_one");

      expect(start().checked).toBeTrue();
      expect(field("Temperature").value).toBe("0");
      finish();
    }));

    it("falls back to defaults when the launch request has no value", fakeAsync(() => {
      const { field } = setup("node_two", projectWithoutNodeValues());

      expect(field("Count").value).toBe("0");
      expect(field("Flag").checked).toBeFalse();
      finish();
    }));

    it("hides the editor of an input fed by a flow", fakeAsync(() => {
      const { element } = setup("node_two");

      const text = inputBlock(element, "Text");
      const label = inputBlock(element, "Label");

      expect(text.querySelector("app-edit-input")).toBeNull();
      expect(label.querySelector("app-edit-input")).not.toBeNull();
      finish();
    }));
  });

  describe("editing", () => {
    it("renames the node and marks the project dirty", fakeAsync(() => {
      const { title, type, project, manager } = setup("node_two");

      type(title(), "Structured output");

      expect(project.pipeline.nodes.get("node_two").title).toBe(
        "Structured output",
      );
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("ignores a title shorter than three characters", fakeAsync(() => {
      const { title, type, project, manager } = setup("node_two");

      type(title(), "ab");

      expect(project.pipeline.nodes.get("node_two").title).toBe("Make JSON");
      expect(manager.status.value).toBeNull();
      finish();
    }));

    it("adds and removes the node from the auto start list", fakeAsync(() => {
      const { start, click, project } = setup("node_two");

      click(start());
      const added = [...project.pipeline.start.nodes];
      click(start());

      expect(added).toEqual(["node_one", "node_two"]);
      expect(project.pipeline.start.nodes).toEqual(["node_one"]);
      finish();
    }));

    it("stores typed values in a new launch entry for the node", fakeAsync(() => {
      const { field, type, click, launchInputs } = setup(
        "node_two",
        projectWithoutNodeValues(),
      );

      type(field("Label"), "Tag");
      type(field("Count"), "7");
      click(field("Flag"));

      expect(launchInputs().get("label")).toBe("Tag");
      expect(launchInputs().get("count")).toBe(7);
      expect(launchInputs().get("flag")).toBeTrue();
      finish();
    }));

    it("drops a cleared value so the default applies again", fakeAsync(() => {
      const { field, type, launchInputs } = setup("node_two");

      type(field("Label"), "");

      expect(launchInputs().has("label")).toBeFalse();
      finish();
    }));

    it("drops a cleared number so the default applies again", fakeAsync(() => {
      const { field, type, launchInputs } = setup("node_two");

      type(field("Count"), "");

      expect(launchInputs().has("count")).toBeFalse();
      finish();
    }));

    it("keeps a stored zero when another field changes", fakeAsync(() => {
      const { title, type, launchInputs } = setup("node_one");

      type(title(), "Generate more text");

      expect(launchInputs().get("temperature")).toBe(0);
      finish();
    }));

    it("resets the node's launch values to the defaults", fakeAsync(() => {
      const { element, click, field, launchInputs, manager } =
        setup("node_one");

      click(buttonWithText(element, "Reset"));

      expect(launchInputs().size).toBe(0);
      expect(field("Temperature").value).toBe("0.5");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));
  });

  describe("featured inputs", () => {
    it("toggles whether an input is shown on the canvas", fakeAsync(() => {
      const { element, click, project } = setup("node_two");
      const toggle = () =>
        inputBlock(element, "Label").querySelector(
          "button.circle",
        ) as HTMLElement;
      const label = () =>
        project.pipeline.nodes.get("node_two").inputs.get("label");

      click(toggle());
      const featured = label().featured;
      click(toggle());

      expect(featured).toBeTrue();
      expect(label().featured).toBeUndefined();
      finish();
    }));
  });

  describe("dynamic inputs", () => {
    it("clones a dynamic input with the next index and removes the clone", fakeAsync(() => {
      const { element, click, project, manager } = setup(
        "node_two",
        dynamicProject(),
      );
      const inputs = project.pipeline.nodes.get("node_two").inputs;

      click(buttonWithText(element, "Image #"));
      click(buttonWithText(element, "Image #"));
      const clones = [...inputs.keys()].filter((k) => k.startsWith("image_"));
      const titles = clones.map((k) => inputs.get(k).title);
      const status = manager.status.value;
      click(
        inputBlock(element, "Image 1").querySelector(
          "button.circle",
        ) as HTMLElement,
      );

      expect(clones).toEqual(["image_1", "image_2"]);
      expect(titles).toEqual(["Image 1", "Image 2"]);
      expect(inputs.has("image_1")).toBeFalse();
      expect(inputs.get("image_2").cloned).toBeTrue();
      expect(status).toBe("dirty");
      finish();
    }));
  });

  describe("project updates", () => {
    it("rebuilds the form when another editor changes the node", fakeAsync(() => {
      const { project, manager, detectChanges, field } = setup("node_two");

      project.launchRequest.nodes.set(
        "node_two",
        mapTo({ inputs: { label: "From elsewhere" } }, NodeToLaunch),
      );
      manager.updates.next(null);
      detectChanges();

      expect(field("Label").value).toBe("From elsewhere");
      finish();
    }));
  });

  describe("tools", () => {
    it("opens the script editor for the node", fakeAsync(() => {
      const { component, router } = setup("node_two");
      const navigate = spyOn(router, "navigate").and.resolveTo(true);

      component.edit();

      const [commands] = navigate.calls.mostRecent().args;
      expect(commands).toEqual([
        { outlets: { primary: ["nodes", "node_two", "edit", "script"] } },
      ]);
      finish();
    }));

    it("renumbers inputs in their rendered order", fakeAsync(() => {
      const project = projectA();
      const node = project.pipeline.nodes.get("node_two");
      node.inputs.get("text").order = 10;
      node.inputs.get("flag").order = 20;
      node.inputs.get("count").order = 30;
      node.inputs.get("label").order = 40;
      const { component } = setup("node_two", project);

      component.reorder();

      expect([...node.inputs.values()].map((i) => i.order)).toEqual([
        1, 2, 3, 4,
      ]);
      finish();
    }));
  });
});
