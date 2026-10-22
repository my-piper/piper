import { fakeAsync, tick } from "@angular/core/testing";
import { diff, patch } from "jsondiffpatch";
import { cloneDeep } from "lodash";
import { NodeFlow } from "src/models/node-flow";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { toInstance, toPlain } from "src/utils/models";
import { projectA, projectWith } from "../fixtures/models";
import { patchResponsePlain, smallGraphPipeline } from "../fixtures/plain";
import {
  EDITOR_URL,
  finish,
  inputPin,
  mouse,
  nodeElement,
  outputPin,
  setupEditor,
} from "../helpers/editor";
import { expectConsoleError } from "../helpers/console";

/** Debounce chain of ProjectManager.markDirty → PATCH (1000 + 3000 ms). */
const AUTOSAVE = 4000;
const UI_DELAY = 250;

function flowsBetween(project: Project, from: string, to: string) {
  return [...project.pipeline.flows.values()].filter(
    (f) => f.from === from && f.to === to,
  );
}

/** Graph with node_three exposing extra typed ports for connection rules. */
function connectionProject(): Project {
  const pipeline = smallGraphPipeline() as {
    nodes: Record<string, unknown>;
  };
  pipeline.nodes["node_three"] = {
    _id: "node_three",
    title: "Typed ports",
    version: 1,
    execution: "rapid",
    arrange: { x: 900, y: 240 },
    inputs: {
      words: { order: 1, title: "Words", type: "string", featured: true },
      amount: { order: 2, title: "Amount", type: "integer", featured: true },
      picture: { order: 3, title: "Picture", type: "image", featured: true },
      pictures: {
        order: 4,
        title: "Pictures",
        type: "image[]",
        featured: true,
      },
      doc: {
        order: 5,
        title: "Doc",
        type: "json",
        featured: true,
        schema: { id: "answer" },
      },
      other: {
        order: 6,
        title: "Other doc",
        type: "json",
        featured: true,
        schema: { id: "other" },
      },
    },
    outputs: {
      cover: { title: "Cover", type: "image" },
      answer: { title: "Answer", type: "json", schema: "answer" },
    },
  };
  return projectWith(pipeline);
}

describe("EditPipelineVisualComponent", () => {
  describe("rendering", () => {
    it("renders nodes, pipeline inputs and outputs from the project", fakeAsync(() => {
      const { element, controller } = setupEditor();

      const titles = Array.from(element.querySelectorAll("app-node h2")).map(
        (h) => h.textContent.trim(),
      );

      expect(titles).toEqual(["Generate text", "Make JSON"]);
      expect(element.querySelectorAll("app-pipeline-input").length).toBe(1);
      expect(element.querySelectorAll("app-pipeline-output").length).toBe(1);
      controller.verify();
      finish();
    }));

    it("offers editing controls to the owner only", fakeAsync(() => {
      const owner = setupEditor({ user: "owner" });

      const ownerAdd = owner.element.querySelector(".actions a.circle");
      const ownerDisabled = owner.element.querySelectorAll(".node.disabled");

      expect(ownerAdd).not.toBeNull();
      expect(ownerDisabled.length).toBe(0);
      finish();
    }));

    it("hides editing controls from another user", fakeAsync(() => {
      const { element } = setupEditor({ user: "stranger" });

      const add = element.querySelector(".actions a.circle");
      const menus = element.querySelectorAll(".node button.more");

      expect(add).toBeNull();
      expect(menus.length).toBe(0);
      expect(element.querySelectorAll(".node.disabled").length).toBe(2);
      finish();
    }));

    it("opens the add-node drawer for an empty project", fakeAsync(() => {
      const project = projectWith({
        ...smallGraphPipeline(),
        start: { nodes: [] },
        inputs: {},
        outputs: {},
        flows: {},
        nodes: {},
      });
      const { router } = setupEditor({ project });

      tick(500);

      expect(router.url).toBe(`${EDITOR_URL}/(left:add-node)`);
      finish();
    }));
  });

  describe("connecting ports through the canvas", () => {
    it("connects a scalar output to a matching input and marks the project dirty", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges, manager } = setupEditor({ project });
      const one = nodeElement(element, "node_one");
      const three = nodeElement(element, "node_three");

      mouse(outputPin(one, "Text"), "mousedown");
      detectChanges();
      mouse(inputPin(three, "Words"), "mouseup");
      detectChanges();

      const flows = flowsBetween(project, "node_one", "node_three");
      expect(flows.length).toBe(1);
      expect(flows[0]).toEqual(
        jasmine.objectContaining({ output: "text", input: "words" }),
      );
      expect(flows[0].transformer).toBeUndefined();
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("rejects a scalar connection between different types", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges, manager } = setupEditor({ project });
      const before = toPlain(project.pipeline);

      mouse(outputPin(nodeElement(element, "node_one"), "Text"), "mousedown");
      detectChanges();
      mouse(inputPin(nodeElement(element, "node_three"), "Amount"), "mouseup");
      detectChanges();

      expect(toPlain(project.pipeline)).toEqual(before);
      expect(manager.status.value).toBeNull();
      finish();
    }));

    it("cancels a pending connection when the mouse is released elsewhere", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges, editor } = setupEditor({ project });
      const flowsBefore = project.pipeline.flows.size;

      mouse(outputPin(nodeElement(element, "node_one"), "Text"), "mousedown");
      detectChanges();
      mouse(document, "mouseup");
      detectChanges();
      mouse(inputPin(nodeElement(element, "node_three"), "Words"), "mouseup");

      expect(editor.state).toBe("default");
      expect(editor.flow).toBeNull();
      expect(project.pipeline.flows.size).toBe(flowsBefore);
      finish();
    }));

    it("adds a JSON transformer when a JSON output feeds a scalar input", fakeAsync(() => {
      const project = connectionProject();
      const { editor } = setupEditor({ project });

      editor.addNodeFlow("node_two", "result", "node_three", "amount");

      const [flow] = flowsBetween(project, "node_two", "node_three");
      expect(flow.transformer.type).toBe("json");
      finish();
    }));

    it("connects JSON ports only when their schemas match", fakeAsync(() => {
      const project = connectionProject();
      const { editor } = setupEditor({ project });

      editor.addNodeFlow("node_three", "answer", "node_three", "other");
      editor.addNodeFlow("node_three", "answer", "node_three", "doc");

      const flows = flowsBetween(project, "node_three", "node_three");
      expect(flows.map((f) => f.input)).toEqual(["doc"]);
      expect(flows[0].transformer).toBeUndefined();
      finish();
    }));

    it("adds an array transformer between image and image[] ports", fakeAsync(() => {
      const project = connectionProject();
      const { editor } = setupEditor({ project });

      editor.addNodeFlow("node_two", "images", "node_three", "picture");
      editor.addNodeFlow("node_two", "images", "node_three", "pictures");
      editor.addNodeFlow("node_three", "cover", "node_three", "words");

      const flows = flowsBetween(project, "node_two", "node_three");
      const byInput = new Map(flows.map((f) => [f.input, f]));
      expect(byInput.get("picture").transformer).toEqual(
        jasmine.objectContaining({ type: "array", index: 0 }),
      );
      expect(byInput.get("pictures").transformer).toBeUndefined();
      expect(flowsBetween(project, "node_three", "node_three")).toEqual([]);
      finish();
    }));

    it("connects a pipeline input only to an input of the same type", fakeAsync(() => {
      const project = connectionProject();
      const { editor } = setupEditor({ project });
      const flows = project.pipeline.inputs.get("topic").flows;

      editor.addInputFlow("topic", "node_three", "amount");
      editor.addInputFlow("topic", "node_three", "words");

      const targets = [...flows.values()].map((f) => `${f.to}.${f.input}`);
      expect(targets).toEqual(["node_one.prompt", "node_three.words"]);
      finish();
    }));

    it("generates distinct flow keys for repeated connections", fakeAsync(() => {
      const project = connectionProject();
      const { editor } = setupEditor({ project });

      editor.addNodeFlow("node_one", "text", "node_three", "words");
      editor.addNodeFlow("node_one", "text", "node_three", "words");

      const keys = [...project.pipeline.flows.keys()];
      expect(new Set(keys).size).toBe(keys.length);
      expect(flowsBetween(project, "node_one", "node_three").length).toBe(2);
      finish();
    }));
  });

  describe("adding and removing graph elements", () => {
    it("adds a dropped catalog node, making it the first start node", fakeAsync(() => {
      const project = projectWith({
        ...smallGraphPipeline(),
        start: { nodes: [] },
      });
      const { editor, controller } = setupEditor({ project });

      editor.addNode(120, 80, { node: "catalog_node" });
      controller.expectOne("/api/nodes/catalog_node").flush({
        _id: "catalog_node",
        title: "Catalog",
        arrange: { x: 0, y: 0 },
        inputs: {},
        outputs: {},
      });
      tick(UI_DELAY);

      const added = [...project.pipeline.nodes.keys()].filter((k) =>
        k.startsWith("catalog_node_"),
      );
      expect(added.length).toBe(1);
      expect(project.pipeline.nodes.get(added[0]).arrange).toEqual(
        jasmine.objectContaining({ x: 120, y: 80 }),
      );
      expect(project.pipeline.start.nodes).toEqual(added);
      finish();
    }));

    it("keeps existing start nodes and gives each added node a unique id", fakeAsync(() => {
      const project = projectA();
      const { editor, controller } = setupEditor({ project });
      const catalog = {
        _id: "catalog_node",
        title: "C",
        arrange: { x: 0, y: 0 },
        inputs: {},
        outputs: {},
      };

      editor.addNode(0, 0, { node: "catalog_node" });
      controller.expectOne("/api/nodes/catalog_node").flush(catalog);
      editor.addNode(10, 10, { node: "catalog_node" });
      controller.expectOne("/api/nodes/catalog_node").flush(catalog);
      tick(UI_DELAY);

      expect(project.pipeline.start.nodes).toEqual(["node_one"]);
      expect(project.pipeline.nodes.size).toBe(4);
      finish();
    }));

    it("shows a visible error when the node cannot be loaded", fakeAsync(() => {
      expectConsoleError("Process HTTP error 404");
      const project = projectA();
      const { editor, controller, detectChanges, element } = setupEditor({
        project,
      });

      editor.addNode(0, 0, { node: "missing" });
      controller
        .expectOne("/api/nodes/missing")
        .flush("Node not found", { status: 404, statusText: "Not Found" });
      detectChanges();

      expect(project.pipeline.nodes.size).toBe(2);
      expect(element.querySelector("app-informer")).not.toBeNull();
      finish();
    }));

    it("removes a node through its menu and sanitation drops dangling references", fakeAsync(() => {
      const project = projectA();
      const { editor, manager, detectChanges } = setupEditor({ project });

      editor.removeNode("node_one");
      detectChanges();
      tick(1000);

      expect(project.pipeline.nodes.has("node_one")).toBeFalse();
      expect(project.pipeline.start.nodes).toEqual([]);
      expect(project.pipeline.flows.size).toBe(0);
      expect(project.pipeline.inputs.has("topic")).toBeFalse();
      expect(project.launchRequest.nodes.has("node_one")).toBeFalse();
      expect(project.launchRequest.inputs.has("topic")).toBeFalse();
      expect(project.pipeline.outputs.has("result")).toBeTrue();
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("removes flows, pipeline inputs and outputs and marks dirty", fakeAsync(() => {
      const project = projectA();
      const { editor, manager } = setupEditor({ project });

      editor.removeFlow("one_to_two");
      editor.removeInputFlow("topic", "topic_to_prompt");
      editor.removeOutput("result");

      expect(project.pipeline.flows.size).toBe(0);
      expect(project.pipeline.inputs.get("topic").flows.size).toBe(0);
      expect(project.pipeline.outputs.size).toBe(0);
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("takes a node input out as a pipeline input with its explicit falsy default", fakeAsync(() => {
      const project = projectA();
      const { editor } = setupEditor({ project });
      const node = project.pipeline.nodes.get("node_two");

      editor.takeOutPipelineInput({
        input: { id: "flag", input: node.inputs.get("flag") },
        node: { id: "node_two", node },
      });

      const input = project.pipeline.inputs.get("flag");
      expect(input).toBeInstanceOf(PipelineInput);
      expect(input.default).toBe(false);
      expect(input.type).toBe("boolean");
      expect([...input.flows.values()]).toEqual([
        jasmine.objectContaining({ to: "node_two", input: "flag" }),
      ]);
      expect(input.arrange).toEqual(
        jasmine.objectContaining({
          x: node.arrange.x - 100,
          y: node.arrange.y,
        }),
      );
      finish();
    }));

    it("takes the same input out twice under distinct ids", fakeAsync(() => {
      const project = projectA();
      const { editor } = setupEditor({ project });
      const node = project.pipeline.nodes.get("node_two");
      const event = {
        input: { id: "count", input: node.inputs.get("count") },
        node: { id: "node_two", node },
      };

      editor.takeOutPipelineInput(event);
      editor.takeOutPipelineInput(event);

      const ids = [...project.pipeline.inputs.keys()].filter((k) =>
        k.startsWith("count"),
      );
      expect(ids.length).toBe(2);
      expect(project.pipeline.inputs.get(ids[0])).not.toBe(
        project.pipeline.inputs.get(ids[1]),
      );
      finish();
    }));

    it("takes a node output out as a pipeline output", fakeAsync(() => {
      const project = projectA();
      const { editor } = setupEditor({ project });
      const node = project.pipeline.nodes.get("node_one");

      editor.takeOutPipelineOutput({
        output: { id: "text", output: node.outputs.get("text") },
        node: { id: "node_one", node },
      });

      const output = project.pipeline.outputs.get("text");
      expect(output.type).toBe("string");
      expect([...output.flows.values()]).toEqual([
        jasmine.objectContaining({ from: "node_one", output: "text" }),
      ]);
      finish();
    }));

    it("keeps explicit falsy defaults when adding a pipeline input", fakeAsync(() => {
      const project = projectA();
      const { editor } = setupEditor({ project });

      editor.addInput(
        "enabled",
        toInstance(
          {
            type: "boolean",
            default: false,
            flows: {},
            arrange: { x: 0, y: 0 },
          },
          PipelineInput,
        ),
      );
      editor.addInput(
        "size",
        toInstance(
          {
            type: "integer",
            default: 0,
            flows: {},
            arrange: { x: 0, y: 0 },
          },
          PipelineInput,
        ),
      );
      editor.addInput(
        "note",
        toInstance(
          {
            type: "string",
            default: "",
            flows: {},
            arrange: { x: 0, y: 0 },
          },
          PipelineInput,
        ),
      );

      expect(project.launchRequest.inputs.get("enabled")).toBe(false);
      expect(project.launchRequest.inputs.get("size")).toBe(0);
      expect(project.launchRequest.inputs.get("note")).toBe("");
      finish();
    }));

    it("stores a manually set node output only on that node", fakeAsync(() => {
      const project = projectA();
      const { editor } = setupEditor({ project });
      const twoBefore = toPlain(project.launchRequest.nodes.get("node_two"));

      editor.setNodeOutput("node_one", "text", "");

      expect(
        project.launchRequest.nodes.get("node_one").outputs.get("text"),
      ).toBe("");
      expect(toPlain(project.launchRequest.nodes.get("node_two"))).toEqual(
        twoBefore,
      );
      finish();
    }));
  });

  describe("moving and zooming", () => {
    it("moves a node by dragging it on the canvas grid", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges, manager } = setupEditor({ project });
      const node = nodeElement(element, "node_one").closest(
        ".node",
      ) as HTMLElement;
      const title = node.querySelector("h2");
      const start = title.getBoundingClientRect();

      mouse(title, "mousedown", { x: start.left + 5, y: start.top + 5 });
      tick(100);
      mouse(document, "mousemove", { x: start.left + 48, y: start.top + 64 });
      mouse(document, "mouseup", { x: start.left + 48, y: start.top + 64 });
      detectChanges();
      tick(100);

      const { x, y } = project.pipeline.nodes.get("node_one").arrange;
      expect(x % 10).toBe(0);
      expect(y % 10).toBe(0);
      expect(x).toBeGreaterThan(200);
      expect(y).toBeGreaterThan(40);
      expect(node.style.left).toBe(`${x}px`);
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("does not move nodes in a read-only scheme", fakeAsync(() => {
      const project = projectA();
      const { element, manager } = setupEditor({ project, mode: "scheme" });
      const title = nodeElement(element, "node_one").querySelector("h2");
      const before = { ...project.pipeline.nodes.get("node_one").arrange };

      mouse(title, "mousedown", { x: 10, y: 10 });
      tick(100);
      mouse(document, "mousemove", { x: 300, y: 300 });
      mouse(document, "mouseup", { x: 300, y: 300 });
      tick(100);

      expect({ ...project.pipeline.nodes.get("node_one").arrange }).toEqual(
        before,
      );
      expect(manager.status.value).toBeNull();
      finish();
    }));

    it("stores ctrl+wheel zoom in the pipeline layout", fakeAsync(() => {
      const project = projectA();
      const { element, manager } = setupEditor({ project });
      const pane = element.querySelector(".pane") as HTMLElement;

      pane.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -20, ctrlKey: true, bubbles: true }),
      );

      expect(project.pipeline.layout.zoom).toBeCloseTo(1.2, 5);
      expect(pane.style.transform).toBe("scale(1.2)");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));
  });

  describe("selection and drawers", () => {
    it("opens the node drawer when a node is clicked", fakeAsync(() => {
      const { element, router } = setupEditor();

      nodeElement(element, "node_two").querySelector("h2").click();
      tick();

      expect(router.url).toBe(`${EDITOR_URL}/(right:nodes/node_two)`);
      finish();
    }));

    it("does not select a node when one of its buttons is clicked", fakeAsync(() => {
      const { element, router } = setupEditor();

      (
        nodeElement(element, "node_two").querySelector(
          "ul.inputs button.circle",
        ) as HTMLElement
      ).click();
      tick();

      expect(router.url).toBe(EDITOR_URL);
      finish();
    }));
  });

  describe("persistence", () => {
    it("saves a canvas connection as a PATCH whose delta rebuilds the edit", fakeAsync(() => {
      const project = connectionProject();
      const baseline = cloneDeep(toPlain(project.pipeline));
      const { element, detectChanges, controller } = setupEditor({ project });

      mouse(outputPin(nodeElement(element, "node_one"), "Text"), "mousedown");
      detectChanges();
      mouse(inputPin(nodeElement(element, "node_three"), "Words"), "mouseup");
      tick(AUTOSAVE);
      const request = controller.expectOne(
        "/api/projects/project_aaaa/patch/rev_a_1",
      );
      const body = request.request.body as { pipeline: object };
      request.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);

      const rebuilt = patch(cloneDeep(baseline), body.pipeline as never);
      const added = toInstance(rebuilt as object, NodeFlow as never);
      expect(request.request.method).toBe("PATCH");
      expect(Object.keys(body)).toEqual(["pipeline"]);
      expect(rebuilt).toEqual(toPlain(project.pipeline));
      expect(diff(baseline, rebuilt) as unknown as { flows: object }).toEqual(
        jasmine.objectContaining({ flows: jasmine.any(Object) }),
      );
      expect(added).toBeDefined();
      expect(project.revision).toBe("rev_a_2");
      controller.verify();
      finish();
    }));
  });
});
