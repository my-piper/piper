import { openDialog } from "../helpers/taiga";
import { fakeAsync, tick } from "@angular/core/testing";
import { diff, patch } from "jsondiffpatch/with-text-diffs";
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

      const ownerAdd = owner.element.querySelector(".actions a[tuiIconButton]");
      const ownerDisabled = owner.element.querySelectorAll(".node.disabled");

      expect(ownerAdd).not.toBeNull();
      expect(ownerDisabled.length).toBe(0);
      finish();
    }));

    it("hides editing controls from another user", fakeAsync(() => {
      const { element } = setupEditor({ user: "stranger" });

      const add = element.querySelector(".actions a[tuiIconButton]");
      const buttons = element.querySelectorAll("button.edit, button.delete");

      expect(add).toBeNull();
      expect(buttons.length).toBe(0);
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
        expect.objectContaining({ output: "text", input: "words" }),
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
        expect.objectContaining({ type: "array", index: 0 }),
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
        expect.objectContaining({ x: 120, y: 80 }),
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
      const { editor, controller, detectChanges } = setupEditor({
        project,
      });

      editor.addNode(0, 0, { node: "missing" });
      controller
        .expectOne("/api/nodes/missing")
        .flush("Node not found", { status: 404, statusText: "Not Found" });
      detectChanges();

      expect(project.pipeline.nodes.size).toBe(2);
      expect(openDialog()).not.toBeNull();
      finish();
    }));

    it("removes a node through its menu and sanitation drops dangling references", fakeAsync(() => {
      const project = projectA();
      const { editor, manager, detectChanges } = setupEditor({ project });

      editor.removeNode("node_one");
      detectChanges();
      tick(1000);

      expect(project.pipeline.nodes.has("node_one")).toBe(false);
      expect(project.pipeline.start.nodes).toEqual([]);
      expect(project.pipeline.flows.size).toBe(0);
      expect(project.pipeline.inputs.has("topic")).toBe(false);
      expect(project.launchRequest.nodes.has("node_one")).toBe(false);
      expect(project.launchRequest.inputs.has("topic")).toBe(false);
      expect(project.pipeline.outputs.has("result")).toBe(true);
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
        expect.objectContaining({ to: "node_two", input: "flag" }),
      ]);
      expect(input.arrange).toEqual(
        expect.objectContaining({
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
        expect.objectContaining({ from: "node_one", output: "text" }),
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

  describe("inline edit and delete buttons", () => {
    function nodeBox(element: HTMLElement, id: string) {
      return element.querySelector(`.node[data-node="${id}"]`) as HTMLElement;
    }

    function inputBox(element: HTMLElement, id: string) {
      return element.querySelector(
        `.input[data-pick="input:${id}"]`,
      ) as HTMLElement;
    }

    function outputBox(element: HTMLElement, id: string) {
      return element.querySelector(
        `.output[data-pick="output:${id}"]`,
      ) as HTMLElement;
    }

    function click(target: Element, detectChanges: () => void) {
      (target as HTMLElement).click();
      detectChanges();
      tick(UI_DELAY);
      detectChanges();
    }

    function dialogButton(label: string) {
      return Array.from(openDialog().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === label,
      );
    }

    function scriptNodeProject() {
      const pipeline = smallGraphPipeline() as {
        nodes: Record<string, Record<string, unknown>>;
      };
      pipeline.nodes["node_one"]["source"] = "script";
      return projectWith(pipeline);
    }

    it("offers Edit on script nodes only to a non-engineer owner", fakeAsync(() => {
      const { element } = setupEditor({ project: scriptNodeProject() });

      const one = nodeBox(element, "node_one");
      const two = nodeBox(element, "node_two");

      expect(one.querySelector("button.edit")).not.toBeNull();
      expect(two.querySelector("button.edit")).toBeNull();
      expect(one.querySelector("button.delete")).not.toBeNull();
      expect(two.querySelector("button.delete")).not.toBeNull();
      finish();
    }));

    it("opens the node's script editor from Edit", fakeAsync(() => {
      const { element, router, detectChanges } = setupEditor({
        project: scriptNodeProject(),
      });

      click(
        nodeBox(element, "node_one").querySelector("button.edit"),
        detectChanges,
      );

      expect(router.url).toBe(`${EDITOR_URL}/nodes/node_one/edit/script`);
      finish();
    }));

    it("deletes a node only after the confirmation", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges } = setupEditor({ project });

      click(
        nodeBox(element, "node_one").querySelector("button.delete"),
        detectChanges,
      );
      const asked = project.pipeline.nodes.has("node_one");
      click(dialogButton("Delete"), detectChanges);

      expect(asked).toBe(true);
      expect(project.pipeline.nodes.has("node_one")).toBe(false);
      finish();
    }));

    it("shows a node title with markup as text in the confirmation", fakeAsync(() => {
      const pipeline = smallGraphPipeline() as {
        nodes: Record<string, Record<string, unknown>>;
      };
      pipeline.nodes["node_one"]["title"] = "<b>bold</b> & co";
      const { element, detectChanges } = setupEditor({
        project: projectWith(pipeline),
      });

      click(
        nodeBox(element, "node_one").querySelector("button.delete"),
        detectChanges,
      );

      expect(openDialog().querySelector("b")).toBeNull();
      expect(openDialog().textContent).toContain("«<b>bold</b> & co»");
      finish();
    }));

    it("keeps the node when the confirmation is cancelled", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges, manager } = setupEditor({ project });

      click(
        nodeBox(element, "node_one").querySelector("button.delete"),
        detectChanges,
      );
      click(dialogButton("Cancel"), detectChanges);

      expect(project.pipeline.nodes.has("node_one")).toBe(true);
      expect(manager.status.value).not.toBe("dirty");
      finish();
    }));

    it("gives a pipeline input Delete but no Edit", fakeAsync(() => {
      const { element } = setupEditor();

      const input = inputBox(element, "topic");

      expect(input.querySelector("button.delete")).not.toBeNull();
      expect(input.querySelector("button.edit")).toBeNull();
      finish();
    }));

    it("deletes a pipeline input after the confirmation", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges } = setupEditor({ project });

      click(
        inputBox(element, "topic").querySelector("button.delete"),
        detectChanges,
      );
      click(dialogButton("Delete"), detectChanges);

      expect(project.pipeline.inputs.has("topic")).toBe(false);
      finish();
    }));

    it("deletes a pipeline output after the confirmation", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges } = setupEditor({ project });

      click(
        outputBox(element, "result").querySelector("button.delete"),
        detectChanges,
      );
      click(dialogButton("Delete"), detectChanges);

      expect(project.pipeline.outputs.has("result")).toBe(false);
      finish();
    }));

    it("deletes flows on one click, without a confirmation", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges } = setupEditor({ project });

      for (const button of Array.from(
        element.querySelectorAll(".flow > button.delete"),
      )) {
        click(button, detectChanges);
      }

      expect(openDialog()).toBeNull();
      expect(project.pipeline.flows.size).toBe(0);
      expect(project.pipeline.inputs.get("topic").flows.size).toBe(0);
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

      // e^(20 × 0.01) ≈ 1.221
      expect(project.pipeline.layout.zoom).toBe(1.221);
      expect(pane.style.transform).toBe("scale(1.221)");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("zooms from the toolbar and shows the zoom level", fakeAsync(() => {
      const project = projectA();
      const { element, fixture } = setupEditor({ project });
      const button = (id: string) =>
        element.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;

      button("zoom-in").click();
      fixture.detectChanges();
      const zoomedIn = project.pipeline.layout.zoom;
      const label = button("zoom-reset").textContent.trim();
      button("zoom-reset").click();
      fixture.detectChanges();

      expect(zoomedIn).toBe(1.2);
      expect(label).toBe("120%");
      expect(project.pipeline.layout.zoom).toBe(1);
      expect(button("zoom-reset").textContent.trim()).toBe("100%");
      finish();
    }));
  });

  describe("selection and drawers", () => {
    function shiftPointer(
      target: Element,
      type: "pointerdown" | "pointermove" | "pointerup",
      {
        x,
        y,
      }: {
        x: number;
        y: number;
      },
    ) {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          shiftKey: true,
          pointerType: "mouse",
          pointerId: 1,
        }),
      );
    }

    function nodeBox(element: HTMLElement, id: string) {
      return element.querySelector(`.node[data-node="${id}"]`) as HTMLElement;
    }

    it("selects nodes touched by a Shift + drag marquee", fakeAsync(() => {
      const { element, detectChanges, router } = setupEditor();
      const grid = element.querySelector(".pane > svg rect");
      const one = nodeBox(element, "node_one").getBoundingClientRect();
      const two = nodeBox(element, "node_two").getBoundingClientRect();
      const from = {
        x: Math.min(one.left, two.left) - 5,
        y: Math.min(one.top, two.top) - 5,
      };
      const to = {
        x: Math.max(one.right, two.right) + 5,
        y: Math.max(one.bottom, two.bottom) + 5,
      };

      shiftPointer(grid, "pointerdown", from);
      shiftPointer(grid, "pointermove", to);
      shiftPointer(grid, "pointerup", to);
      detectChanges();
      tick();

      expect(nodeBox(element, "node_one").classList).toContain("picked");
      expect(nodeBox(element, "node_two").classList).toContain("picked");
      expect(router.url).toBe(EDITOR_URL);
      finish();
    }));

    it("toggles a node with Shift + click without opening its drawer", fakeAsync(() => {
      const { element, detectChanges, router } = setupEditor();
      const title = nodeElement(element, "node_two").querySelector("h2");
      const click = () =>
        title.dispatchEvent(
          new MouseEvent("click", { bubbles: true, shiftKey: true }),
        );

      click();
      detectChanges();
      const picked = nodeBox(element, "node_two").classList.contains("picked");
      click();
      detectChanges();
      tick();

      expect(picked).toBe(true);
      expect(nodeBox(element, "node_two").classList).not.toContain("picked");
      expect(router.url).toBe(EDITOR_URL);
      finish();
    }));

    it("moves selected nodes together and clears the selection on Escape", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges, manager } = setupEditor({ project });
      const { nodes } = project.pipeline;
      const shiftClick = (id: string) =>
        nodeElement(element, id)
          .querySelector("h2")
          .dispatchEvent(
            new MouseEvent("click", { bubbles: true, shiftKey: true }),
          );
      shiftClick("node_one");
      shiftClick("node_two");
      detectChanges();
      const before = {
        one: { ...nodes.get("node_one").arrange },
        two: { ...nodes.get("node_two").arrange },
      };
      const title = nodeElement(element, "node_one").querySelector("h2");
      const start = title.getBoundingClientRect();

      mouse(title, "mousedown", { x: start.left + 5, y: start.top + 5 });
      tick(100);
      mouse(document, "mousemove", { x: start.left + 48, y: start.top + 64 });
      mouse(document, "mouseup", { x: start.left + 48, y: start.top + 64 });
      detectChanges();
      tick(100);
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      detectChanges();

      const one = nodes.get("node_one").arrange;
      const two = nodes.get("node_two").arrange;
      expect(one.x - before.one.x).not.toBe(0);
      expect(two.x - before.two.x).toBe(one.x - before.one.x);
      expect(two.y - before.two.y).toBe(one.y - before.one.y);
      expect(nodeBox(element, "node_two").style.left).toBe(`${two.x}px`);
      expect(nodeBox(element, "node_one").classList).not.toContain("picked");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("opens the node drawer when a node is clicked", fakeAsync(() => {
      const { element, router } = setupEditor();

      nodeElement(element, "node_two").querySelector("h2").click();
      tick();

      expect(router.url).toBe(`${EDITOR_URL}/(right:nodes/node_two)`);
      finish();
    }));

    it("clears the selection when a node is clicked without a modifier", fakeAsync(() => {
      const { element, detectChanges, router } = setupEditor();
      nodeElement(element, "node_one")
        .querySelector("h2")
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, shiftKey: true }),
        );
      detectChanges();
      const pickedBefore = nodeBox(element, "node_one").classList.contains(
        "picked",
      );

      nodeElement(element, "node_two").querySelector("h2").click();
      detectChanges();
      tick();

      expect(pickedBefore).toBe(true);
      expect(nodeBox(element, "node_one").classList).not.toContain("picked");
      expect(router.url).toBe(`${EDITOR_URL}/(right:nodes/node_two)`);
      finish();
    }));

    it("clears the selection and closes the drawer when the empty canvas is clicked", fakeAsync(() => {
      const { element, detectChanges, router } = setupEditor();
      nodeElement(element, "node_two").querySelector("h2").click();
      tick();
      nodeElement(element, "node_one")
        .querySelector("h2")
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, shiftKey: true }),
        );
      detectChanges();
      const opened = router.url;
      const pickedBefore = nodeBox(element, "node_one").classList.contains(
        "picked",
      );

      (element.querySelector(".pane > svg rect") as SVGElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      detectChanges();
      tick();

      expect(opened).toBe(`${EDITOR_URL}/(right:nodes/node_two)`);
      expect(pickedBefore).toBe(true);
      expect(nodeBox(element, "node_one").classList).not.toContain("picked");
      expect(router.url).toBe(EDITOR_URL);
      finish();
    }));

    it("keeps the drawer open when a non-empty canvas element is clicked", fakeAsync(() => {
      const { element, detectChanges, router } = setupEditor();
      nodeElement(element, "node_two").querySelector("h2").click();
      tick();

      element
        .querySelector("app-pipeline-input")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      detectChanges();
      tick();

      expect(router.url).toBe(`${EDITOR_URL}/(right:nodes/node_two)`);
      finish();
    }));

    it("does not select a node when one of its buttons is clicked", fakeAsync(() => {
      const { element, router } = setupEditor();

      (
        nodeElement(element, "node_two").querySelector(
          "ul.inputs button.port",
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
      const body = request.request.body as {
        pipeline: object;
      };
      request.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);

      const rebuilt = patch(cloneDeep(baseline), body.pipeline as never);
      const added = toInstance(rebuilt as object, NodeFlow as never);
      expect(request.request.method).toBe("PATCH");
      expect(Object.keys(body)).toEqual(["pipeline"]);
      expect(rebuilt).toEqual(toPlain(project.pipeline));
      expect(
        diff(baseline, rebuilt) as unknown as {
          flows: object;
        },
      ).toEqual(expect.objectContaining({ flows: expect.any(Object) }));
      expect(added).toBeDefined();
      expect(project.revision).toBe("rev_a_2");
      controller.verify();
      finish();
    }));
  });
});
