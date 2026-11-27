import { getDebugNode } from "@angular/core";
import { hover, openDialog, unhover } from "../helpers/taiga";
import { fakeAsync, tick } from "@angular/core/testing";
import { diff, patch } from "jsondiffpatch/with-text-diffs";
import { cloneDeep } from "lodash";
import { NodeFlow } from "src/models/node-flow";
import { NodeInput } from "src/models/node";
import { Layout, LayoutGroup, PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { toInstance, toPlain } from "src/utils/models";
import { groupMembers } from "src/utils/groups";
import { inputOffset } from "src/utils/node-layout";
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

    it("puts Run, Edit and Delete in one row on the node", fakeAsync(() => {
      const { element } = setupEditor({ project: scriptNodeProject() });

      const row = nodeBox(element, "node_one").querySelectorAll(
        ":scope > .item-actions > [tuiIconButton]",
      );

      const kinds = ["run", "app", "edit", "delete"];
      expect(
        Array.from(row, (b) => kinds.find((k) => b.classList.contains(k))),
      ).toEqual(["run", "edit", "delete"]);
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

    it("keeps the node when the ghost Cancel of the confirmation is chosen", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges, manager } = setupEditor({ project });

      click(
        nodeBox(element, "node_one").querySelector("button.delete"),
        detectChanges,
      );
      const appearances = ["Delete", "Cancel"].map((label) =>
        dialogButton(label).getAttribute("data-appearance"),
      );
      click(dialogButton("Cancel"), detectChanges);

      expect(appearances).toEqual(["primary-destructive", "flat-grayscale"]);
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

    it("takes an input out of a node through its port menu", fakeAsync(() => {
      const { element, editor, detectChanges } = setupEditor();
      const before = editor.pipeline.inputs.size;
      const port = nodeElement(element, "node_two").querySelector(
        "ul.inputs button.port, ul.widgets button.port",
      ) as HTMLElement;

      port.click();
      detectChanges();
      tick();
      Array.from(document.querySelectorAll("tui-data-list button"))
        .find((b) => b.textContent.trim() === "Take out")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      detectChanges();
      tick();

      expect(editor.pipeline.inputs.size).toBe(before + 1);
      expect(
        getDebugNode(nodeElement(element, "node_two").closest("app-node"))
          ?.componentInstance.openMenu,
      ).toBeNull();
      finish();
    }));

    it("does not select a node when one of its buttons is clicked", fakeAsync(() => {
      const { element, router, detectChanges } = setupEditor();
      const port = nodeElement(element, "node_two").querySelector(
        "ul.inputs button.port, ul.widgets button.port",
      ) as HTMLElement;

      port.click();
      tick();
      const url = router.url;
      // the click opens the port's menu; close it, or its iframe outlives the spec
      port.click();
      detectChanges();
      tick();

      expect(url).toBe(EDITOR_URL);
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

  describe("canvas hint", () => {
    it("shows the pan and zoom hint on hover", fakeAsync(() => {
      const { detectChanges, element } = setupEditor();
      const toggle = element.querySelector<HTMLElement>(
        "[data-testid=canvas-hint-toggle]",
      );

      toggle.scrollIntoView();
      hover(toggle);
      tick(1000);
      detectChanges();

      const shown = document.querySelector("tui-hint")?.textContent;
      unhover(toggle);
      tick(1000);
      detectChanges();

      expect(shown).toContain("Drag empty space");
      finish();
    }));
  });

  describe("keyboard shortcuts", () => {
    function press(
      target: EventTarget,
      key: string,
      modifiers: KeyboardEventInit = {},
    ) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      target.dispatchEvent(event);
      return event;
    }

    function settle(detectChanges: () => void) {
      detectChanges();
      tick(UI_DELAY);
      detectChanges();
    }

    function confirmDelete(detectChanges: () => void) {
      Array.from(openDialog().querySelectorAll("button"))
        .find((b) => b.textContent.trim() === "Delete")
        .click();
      settle(detectChanges);
    }

    it("selects every node, input and output with Ctrl + A", fakeAsync(() => {
      const project = projectA();
      const { editor, element } = setupEditor({ project });
      const { nodes, inputs, outputs } = project.pipeline;

      const event = press(element, "a", { ctrlKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(editor.selection.size).toBe(
        nodes.size + (inputs?.size ?? 0) + (outputs?.size ?? 0),
      );
      expect(editor.selection.has("node:node_one")).toBe(true);
      finish();
    }));

    it("deletes the whole selection after one confirmation", fakeAsync(() => {
      const project = projectA();
      const { element, detectChanges, manager } = setupEditor({ project });
      press(element, "a", { metaKey: true });

      press(element, "Delete");
      settle(detectChanges);
      const asked = openDialog().textContent;
      confirmDelete(detectChanges);

      expect(asked).toContain("selected items");
      expect(project.pipeline.nodes.size).toBe(0);
      expect(project.pipeline.inputs?.size ?? 0).toBe(0);
      expect(project.pipeline.outputs?.size ?? 0).toBe(0);
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("asks the item's own question when one item is selected", fakeAsync(() => {
      const project = projectA();
      const { editor, element, detectChanges } = setupEditor({ project });
      editor.toggleSelection("input:topic");

      press(element, "Backspace");
      settle(detectChanges);
      const asked = openDialog().textContent;
      confirmDelete(detectChanges);

      expect(asked).toContain("pipeline input");
      expect(project.pipeline.inputs.has("topic")).toBe(false);
      finish();
    }));

    it("asks a node's own question for a single selected node", fakeAsync(() => {
      const project = projectA();
      const { editor, element, detectChanges } = setupEditor({ project });
      editor.toggleSelection("node:node_two");

      press(element, "Delete");
      settle(detectChanges);
      const asked = openDialog().textContent;
      confirmDelete(detectChanges);

      expect(asked).toContain("Delete node");
      expect(project.pipeline.nodes.has("node_two")).toBe(false);
      finish();
    }));

    it("does nothing on Delete with an empty selection", fakeAsync(() => {
      const { element, detectChanges } = setupEditor();

      const event = press(element, "Delete");
      settle(detectChanges);

      expect(event.defaultPrevented).toBe(false);
      expect(openDialog()).toBeNull();
      finish();
    }));

    it("leaves keys typed into a field alone", fakeAsync(() => {
      const { editor, element } = setupEditor();
      const field = document.createElement("input");
      element.append(field);

      const event = press(field, "a", { ctrlKey: true });

      expect(event.defaultPrevented).toBe(false);
      expect(editor.selection.size).toBe(0);
      field.remove();
      finish();
    }));

    it("ignores presses outside the canvas", fakeAsync(() => {
      const { editor } = setupEditor();
      const outside = document.createElement("div");
      document.body.append(outside);

      press(outside, "a", { ctrlKey: true });

      expect(editor.selection.size).toBe(0);
      outside.remove();
      finish();
    }));

    it("does not select or delete in the read-only scheme", fakeAsync(() => {
      const { editor, element } = setupEditor({ mode: "scheme" });

      const selectAll = press(element, "a", { ctrlKey: true });
      const launch = press(element, "Enter", { ctrlKey: true });

      expect(selectAll.defaultPrevented).toBe(false);
      expect(launch.defaultPrevented).toBe(false);
      expect(editor.selection.size).toBe(0);
      finish();
    }));

    it("launches with Ctrl + Enter unless a launch is under way", fakeAsync(() => {
      const { editor, element } = setupEditor();
      const run = vi.spyOn(editor, "run").mockImplementation(() => {});

      press(element, "Enter", { ctrlKey: true });
      editor.progress.launching = true;
      press(element, "Enter", { ctrlKey: true });

      expect(run).toHaveBeenCalledTimes(1);
      finish();
    }));

    it("opens the shortcut list with ?", fakeAsync(() => {
      const { editor, element, detectChanges } = setupEditor();

      press(element, "?", { shiftKey: true });
      settle(detectChanges);

      expect(editor.shortcutsOpen).toBe(true);
      expect(openDialog().textContent).toContain("Ctrl/⌘ + Enter");
      finish();
    }));
  });
  describe("node search", () => {
    const CATALOG = [
      { _id: "upscale", title: "Upscale image" },
      { _id: "echo", title: "Echo" },
      { _id: "speaker", title: "Speaker" },
    ];

    function grid(element: HTMLElement) {
      return element.querySelector(".pane > svg rect");
    }

    function searchField() {
      return document.querySelector<HTMLInputElement>(
        '[data-testid="node-search-field"]',
      );
    }

    function press(key: string, init: KeyboardEventInit = {}) {
      searchField().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
      );
    }

    function type(text: string) {
      const field = searchField();
      field.value = text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function activeItem() {
      return document.querySelector(".node-search .item.active")?.textContent;
    }

    /** The canvas point under client coordinates, as the editor places nodes. */
    function canvasPoint(element: HTMLElement, x: number, y: number) {
      const rect = element.querySelector(".pane").getBoundingClientRect();
      return { x: Math.round(x - rect.left), y: Math.round(y - rect.top) };
    }

    function catalogNode(_id: string, inputs: object = {}) {
      return { _id, title: _id, arrange: { x: 0, y: 0 }, inputs, outputs: {} };
    }

    function addedIds(project: Project, prefix: string) {
      return [...project.pipeline.nodes.keys()].filter((k) =>
        k.startsWith(`${prefix}_`),
      );
    }

    it("opens on a double-click on empty canvas and adds the best match there", fakeAsync(() => {
      const project = projectA();
      const { element, controller, detectChanges } = setupEditor({ project });
      const box = grid(element).getBoundingClientRect();
      const [x, y] = [box.left + 300, box.top + 400];

      grid(element).dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }),
      );
      detectChanges();
      const list = controller.expectOne((r) => r.url === "/api/nodes");
      list.flush(CATALOG);
      detectChanges();
      const focused = document.activeElement === searchField();
      type("ech");
      detectChanges();
      press("Enter");
      detectChanges();
      controller.expectOne("/api/nodes/echo").flush(catalogNode("echo"));
      tick(UI_DELAY);
      detectChanges();

      const [id] = addedIds(project, "echo");
      expect(list.request.params.get("accepts")).toBeNull();
      expect(focused).toBe(true);
      expect(project.pipeline.nodes.get(id).arrange).toEqual(
        expect.objectContaining(canvasPoint(element, x, y)),
      );
      expect(searchField()).toBeNull();
      finish();
    }));

    it("stays closed on a double-click on a node", fakeAsync(() => {
      const { element, controller, detectChanges } = setupEditor();

      nodeElement(element, "node_one").dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      );
      detectChanges();

      expect(searchField()).toBeNull();
      expect(controller.match((r) => r.url === "/api/nodes").length).toBe(0);
      finish();
    }));

    it("moves with the arrows, keeps open with Shift + Enter and closes with Esc", fakeAsync(() => {
      const project = projectA();
      const { element, controller, detectChanges } = setupEditor({ project });

      grid(element).dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          clientX: 500,
          clientY: 300,
        }),
      );
      detectChanges();
      controller.expectOne((r) => r.url === "/api/nodes").flush(CATALOG);
      detectChanges();
      type("e");
      detectChanges();
      const first = activeItem();
      press("ArrowDown");
      const second = activeItem();
      press("ArrowUp");
      press("ArrowUp");
      const wrapped = activeItem();
      press("Enter", { shiftKey: true });
      detectChanges();
      controller.expectOne("/api/nodes/upscale").flush(catalogNode("upscale"));
      tick(UI_DELAY);
      detectChanges();
      const keptOpen = searchField() !== null;
      press("Escape");
      detectChanges();

      expect(
        [first, second, wrapped].map((t) => t.trim().split(/\s+/)[0]),
      ).toEqual(["Echo", "Speaker", "Upscale"]);
      expect(keptOpen).toBe(true);
      expect(addedIds(project, "upscale").length).toBe(1);
      expect(searchField()).toBeNull();
      finish();
    }));

    it("searches nodes accepting a wire dropped on empty canvas and connects the pick", fakeAsync(() => {
      const project = connectionProject();
      const { element, controller, detectChanges } = setupEditor({ project });
      const box = grid(element).getBoundingClientRect();
      const [x, y] = [box.left + 200, box.top + 600];

      mouse(outputPin(nodeElement(element, "node_one"), "Text"), "mousedown");
      detectChanges();
      mouse(grid(element), "mouseup", { x, y });
      detectChanges();
      const list = controller.expectOne((r) => r.url === "/api/nodes");
      list.flush(CATALOG);
      detectChanges();
      const accepts = document.querySelector(
        '[data-testid="node-search-accepts"]',
      ).textContent;
      type("speak");
      detectChanges();
      press("Enter");
      controller.expectOne("/api/nodes/speaker").flush(
        catalogNode("speaker", {
          voice: { title: "Voice", type: "audio" },
          note: { title: "Note", type: "string" },
          words: { title: "Words", type: "string", featured: true },
        }),
      );
      tick(UI_DELAY);
      detectChanges();

      const [id] = addedIds(project, "speaker");
      const point = canvasPoint(element, x, y);
      expect(list.request.params.get("accepts")).toBe("string");
      expect(accepts).toContain("string");
      expect(project.pipeline.nodes.get(id).arrange).toEqual(
        // The connected `words` socket (a widget row) lands on the drop point.
        expect.objectContaining({
          x: point.x,
          y: point.y - inputOffset(project.pipeline.nodes.get(id), "words"),
        }),
      );
      expect(flowsBetween(project, "node_one", id)).toEqual([
        expect.objectContaining({ output: "text", input: "words" }),
      ]);
      finish();
    }));

    it("adds the node unconnected when none of its inputs fits", fakeAsync(() => {
      const project = connectionProject();
      const { element, controller, detectChanges } = setupEditor({ project });

      mouse(outputPin(nodeElement(element, "node_one"), "Text"), "mousedown");
      detectChanges();
      mouse(grid(element), "mouseup", { x: 600, y: 600 });
      detectChanges();
      controller.expectOne((r) => r.url === "/api/nodes").flush(CATALOG);
      detectChanges();
      type("echo");
      detectChanges();
      press("Enter");
      controller.expectOne("/api/nodes/echo").flush(catalogNode("echo"));
      tick(UI_DELAY);

      const [id] = addedIds(project, "echo");
      expect(id).toBeDefined();
      expect(flowsBetween(project, "node_one", id)).toEqual([]);
      finish();
    }));
  });
  describe("copy, paste and duplicate", () => {
    function clipboardEvent(type: "copy" | "paste", text?: string) {
      const data = new DataTransfer();
      if (text !== undefined) {
        data.setData("text/plain", text);
      }
      return new ClipboardEvent(type, {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
    }

    function copied(target: EventTarget) {
      const event = clipboardEvent("copy");
      target.dispatchEvent(event);
      return {
        prevented: event.defaultPrevented,
        text: event.clipboardData.getData("text/plain"),
      };
    }

    function addedFlows(project: Project, before: Set<string>) {
      return [...project.pipeline.flows.entries()].filter(
        ([key]) => !before.has(key),
      );
    }

    it("copies the selected nodes and pastes them with new ids and their flow", fakeAsync(() => {
      const project = projectA();
      const { editor, element, manager, detectChanges } = setupEditor({
        project,
      });
      const flowsBefore = new Set(project.pipeline.flows.keys());
      const nodesBefore = new Set(project.pipeline.nodes.keys());
      editor.selection = new Set(["node:node_one", "node:node_two"]);

      const copy = copied(element);
      const paste = clipboardEvent("paste", copy.text);
      element.dispatchEvent(paste);
      detectChanges();

      const pasted = [...project.pipeline.nodes.keys()].filter(
        (id) => !nodesBefore.has(id),
      );
      const [[, flow]] = addedFlows(project, flowsBefore);
      const one = project.pipeline.nodes.get("node_one").arrange;
      expect(copy.prevented).toBe(true);
      expect(copy.text).toContain("piper/canvas-clip");
      expect(paste.defaultPrevented).toBe(true);
      expect(pasted.length).toBe(2);
      expect(pasted.every((id) => /^\w+_[0-9a-f]{10}$/.test(id))).toBe(true);
      expect(pasted).toContain(flow.from);
      expect(pasted).toContain(flow.to);
      expect(
        Math.min(
          ...pasted.map((id) => project.pipeline.nodes.get(id).arrange.x),
        ),
      ).toBe(
        Math.min(one.x, project.pipeline.nodes.get("node_two").arrange.x) + 40,
      );
      expect([...editor.selection]).toEqual(pasted.map((id) => `node:${id}`));
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("leaves copy alone without selected nodes or in a field", fakeAsync(() => {
      const { editor, element } = setupEditor();
      const empty = copied(element);
      editor.selection = new Set(["node:node_one"]);
      const field = document.createElement("input");
      element.appendChild(field);

      const inField = copied(field);

      expect([empty, inField]).toEqual([
        { prevented: false, text: "" },
        { prevented: false, text: "" },
      ]);
      finish();
    }));

    it("neither copies nor pastes nodes outside the project editor", fakeAsync(() => {
      const project = projectA();
      const { editor, element } = setupEditor({ project, mode: "scheme" });
      editor.selection = new Set(["node:node_one"]);
      const nodes = project.pipeline.nodes.size;

      const copy = copied(element);
      const paste = clipboardEvent(
        "paste",
        '{"piper/canvas-clip":1,"nodes":[["x",{"_id":"x"}]]}',
      );
      element.dispatchEvent(paste);

      expect(copy).toEqual({ prevented: false, text: "" });
      expect(paste.defaultPrevented).toBe(false);
      expect(project.pipeline.nodes.size).toBe(nodes);
      finish();
    }));

    it("duplicates the selection with Ctrl + D, 40px off the originals", fakeAsync(() => {
      const project = projectA();
      const { editor, element, detectChanges } = setupEditor({ project });
      const one = project.pipeline.nodes.get("node_one").arrange;
      editor.selection = new Set(["node:node_one"]);

      const event = new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      detectChanges();

      const [id] = [...editor.selection].map((k) => k.slice("node:".length));
      expect(event.defaultPrevented).toBe(true);
      expect(id).not.toBe("node_one");
      expect(project.pipeline.nodes.get(id).arrange).toEqual(
        expect.objectContaining({ x: one.x + 40, y: one.y + 40 }),
      );
      finish();
    }));
  });
  describe("inline widgets", () => {
    function widget(element: HTMLElement, input: string) {
      return nodeElement(element, "node_three").querySelector<HTMLInputElement>(
        `[data-testid="widget-${input}"]`,
      );
    }

    function stepButton(element: HTMLElement, label: string) {
      return nodeElement(element, "node_three").querySelector<HTMLElement>(
        `button[aria-label="${label}"]`,
      );
    }

    function requested(project: Project, input: string) {
      return project.launchRequest.nodes.get("node_three")?.inputs?.get(input);
    }

    it("steps a number widget and writes the value like the drawer", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges, manager } = setupEditor({ project });

      stepButton(element, "Increase Amount").click();
      detectChanges();
      stepButton(element, "Increase Amount").click();
      detectChanges();
      stepButton(element, "Decrease Amount").click();
      detectChanges();

      expect(requested(project, "amount")).toBe(1);
      expect(widget(element, "amount").value).toBe("1");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("takes typed numbers, clears to the default and ignores junk", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges } = setupEditor({ project });
      const field = () => widget(element, "amount");
      const type = (text: string) => {
        field().value = text;
        field().dispatchEvent(new Event("change"));
        detectChanges();
      };

      type("42");
      const typed = requested(project, "amount");
      type("forty");
      const kept = [requested(project, "amount"), field().value];
      type("");

      expect(typed).toBe(42);
      expect(kept).toEqual([42, "42"]);
      expect(requested(project, "amount")).toBeUndefined();
      finish();
    }));

    /** node_three with a choice, a switch and a multi-line text added. */
    function widgetProject() {
      const project = connectionProject();
      const node = project.pipeline.nodes.get("node_three");
      const add = (id: string, plain: object) =>
        node.inputs.set(id, toInstance(plain, NodeInput));
      add("mode", {
        order: 7,
        title: "Mode",
        type: "string",
        featured: true,
        enum: ["fast", "best"],
      });
      add("hires", {
        order: 8,
        title: "Hires",
        type: "boolean",
        featured: true,
      });
      add("notes", {
        order: 9,
        title: "Notes",
        type: "string",
        featured: true,
        multiline: true,
        required: true,
      });
      node.build();
      return project;
    }

    it("edits text, choice and switch widgets", fakeAsync(() => {
      const project = widgetProject();
      const { element, detectChanges } = setupEditor({ project });
      const words = widget(element, "words");
      const mode = widget(element, "mode") as unknown as HTMLSelectElement;
      const notes = widget(element, "notes") as unknown as HTMLTextAreaElement;

      words.value = "hello";
      words.dispatchEvent(new Event("change"));
      mode.selectedIndex = 2;
      mode.dispatchEvent(new Event("change"));
      notes.value = "line one\nline two";
      notes.dispatchEvent(new Event("change"));
      widget(element, "hires").click();
      detectChanges();

      expect(requested(project, "words")).toBe("hello");
      expect(requested(project, "mode")).toBe("best");
      expect(requested(project, "notes")).toBe("line one\nline two");
      expect(requested(project, "hires")).toBe(true);
      expect(widget(element, "hires").getAttribute("aria-checked")).toBe(
        "true",
      );
      finish();
    }));

    it("clears a choice and a text back to their defaults", fakeAsync(() => {
      const project = widgetProject();
      const { element, detectChanges } = setupEditor({ project });
      const mode = () =>
        widget(element, "mode") as unknown as HTMLSelectElement;
      mode().selectedIndex = 1;
      mode().dispatchEvent(new Event("change"));
      detectChanges();

      mode().selectedIndex = 0;
      mode().dispatchEvent(new Event("change"));
      widget(element, "words").value = "";
      widget(element, "words").dispatchEvent(new Event("change"));
      detectChanges();

      expect(requested(project, "mode")).toBeUndefined();
      expect(requested(project, "words")).toBeUndefined();
      finish();
    }));

    it("marks a required widget left empty and gives multi-line text three rows", fakeAsync(() => {
      const project = widgetProject();
      const { element } = setupEditor({ project });

      const notes = widget(element, "notes").closest("li") as HTMLElement;

      expect(notes.querySelector(".area.missing")).not.toBeNull();
      expect(notes.style.height).toBe("66px");
      expect(widget(element, "words").closest(".missing")).toBeNull();
      finish();
    }));

    it("gives way to a wire: the row names its source", fakeAsync(() => {
      const project = connectionProject();
      const { editor, element, detectChanges } = setupEditor({ project });
      const before = widget(element, "words");

      editor.addNodeFlow("node_one", "text", "node_three", "words");
      detectChanges();

      const wired = nodeElement(element, "node_three").querySelector(
        '[data-testid="wired-words"]',
      );
      expect(before).not.toBeNull();
      expect(widget(element, "words")).toBeNull();
      expect(wired?.textContent).toContain("← Generate text");
      finish();
    }));

    it("names a pipeline input as the source and drops the missing mark", fakeAsync(() => {
      const { element } = setupEditor();

      const node = nodeElement(element, "node_one");
      const wired = node.querySelector('[data-testid="wired-prompt"]');

      expect(wired?.textContent).toContain("← Topic");
      expect(node.querySelector(".missing")).toBeNull();
      finish();
    }));

    it("shows widgets read-only to someone who can't edit the project", fakeAsync(() => {
      const project = connectionProject();
      const { element } = setupEditor({ project, user: "stranger" });

      expect(widget(element, "amount").readOnly).toBe(true);
      expect(stepButton(element, "Increase Amount")).toBeNull();
      finish();
    }));

    it("shows widgets read-only outside the editor", fakeAsync(() => {
      const project = connectionProject();
      const { element } = setupEditor({ project, mode: "scheme" });

      expect(widget(element, "amount").readOnly).toBe(true);
      expect(stepButton(element, "Increase Amount")).toBeNull();
      finish();
    }));

    it("puts a widget input's wire end on its socket", fakeAsync(() => {
      const project = connectionProject();
      const { editor, element, detectChanges } = setupEditor({ project });

      editor.addNodeFlow("node_one", "text", "node_three", "words");
      detectChanges();

      const node = project.pipeline.nodes.get("node_three");
      const wire = Array.from(
        element.querySelectorAll(".pane > svg path:not(.param):not(.pending)"),
      )
        .map((p) => p.getAttribute("d"))
        .find((d) =>
          d.endsWith(
            `${node.arrange.x},${node.arrange.y + inputOffset(node, "words")}`,
          ),
        );
      expect(wire).toBeDefined();
      finish();
    }));
  });
  describe("collapsed nodes", () => {
    function toggle(element: HTMLElement, id: string) {
      return nodeElement(element, id).querySelector<HTMLButtonElement>(
        '[data-testid="node-collapse"]',
      );
    }

    it("collapses a node to its title bar and expands it again", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges, manager } = setupEditor({ project });
      const node = project.pipeline.nodes.get("node_three");

      toggle(element, "node_three").click();
      detectChanges();
      const collapsed = {
        stored: node.arrange.collapsed,
        ports: nodeElement(element, "node_three").querySelector(".ports"),
        count: nodeElement(element, "node_three")
          .querySelector('[data-testid="node-title"]')
          ?.getAttribute("title"),
        label: toggle(element, "node_three").getAttribute("aria-label"),
      };
      toggle(element, "node_three").click();
      detectChanges();

      expect(collapsed).toEqual({
        stored: true,
        ports: null,
        count: "Typed ports · 6 in · 2 out",
        label: "Expand node",
      });
      expect(node.arrange.collapsed).toBeUndefined();
      expect(
        nodeElement(element, "node_three").querySelector(".ports"),
      ).not.toBeNull();
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("ends a collapsed node's wires on its title bar", fakeAsync(() => {
      const project = connectionProject();
      const node = project.pipeline.nodes.get("node_two");
      node.arrange.collapsed = true;
      const { element } = setupEditor({ project });

      const { x, y } = node.arrange;
      const ends = Array.from(
        element.querySelectorAll(".pane > svg path:not(.param):not(.pending)"),
      )
        .map((p) => p.getAttribute("d"))
        .filter((d) => d.endsWith(`${x},${y + 14}`));

      expect(ends.length).toBe(1);
      finish();
    }));

    it("joins a wire dropped on a collapsed node to its first free fitting input", fakeAsync(() => {
      const project = connectionProject();
      project.pipeline.nodes.get("node_three").arrange.collapsed = true;
      const { element, detectChanges } = setupEditor({ project });

      mouse(outputPin(nodeElement(element, "node_one"), "Text"), "mousedown");
      detectChanges();
      mouse(
        nodeElement(element, "node_three").querySelector(
          '[data-testid="collapsed-input"]',
        ),
        "mouseup",
      );
      detectChanges();

      expect(flowsBetween(project, "node_one", "node_three")).toEqual([
        expect.objectContaining({ output: "text", input: "words" }),
      ]);
      finish();
    }));

    it("shows a collapsed node to a viewer without letting them expand it", fakeAsync(() => {
      const project = connectionProject();
      project.pipeline.nodes.get("node_three").arrange.collapsed = true;
      const { element } = setupEditor({ project, user: "stranger" });

      expect(toggle(element, "node_three").disabled).toBe(true);
      expect(toggle(element, "node_two")).toBeNull();
      finish();
    }));
  });
  describe("resizing nodes", () => {
    function edge(element: HTMLElement, id: string) {
      return nodeElement(element, id).querySelector<HTMLElement>(
        '[data-testid="node-resize"]',
      );
    }

    function pointer(target: Element, type: string, clientX: number) {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          button: 0,
          pointerId: 1,
        }),
      );
    }

    it("drags the right edge to a snapped width and saves it on release", fakeAsync(() => {
      const project = connectionProject();
      const { element, detectChanges, manager } = setupEditor({ project });
      const node = project.pipeline.nodes.get("node_one");
      const handle = edge(element, "node_one");

      pointer(handle, "pointerdown", 100);
      pointer(handle, "pointermove", 197);
      detectChanges();
      const during = {
        tip: nodeElement(element, "node_one").querySelector(
          '[data-testid="node-resize-tip"]',
        )?.textContent,
        status: manager.status.value,
        live: node.arrange.w,
        liveStyle: nodeElement(element, "node_one").style.width,
      };
      pointer(handle, "pointerup", 197);
      detectChanges();

      expect(during).toEqual({
        tip: "320",
        status: null,
        live: 320,
        liveStyle: "320px",
      });
      expect(node.arrange.w).toBe(320);
      expect(nodeElement(element, "node_one").style.width).toBe("320px");
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("starts the node's wires at its new right edge", fakeAsync(() => {
      const project = connectionProject();
      const node = project.pipeline.nodes.get("node_one");
      node.arrange.w = 400;
      const { element } = setupEditor({ project });

      const starts = Array.from(
        element.querySelectorAll(".pane > svg path:not(.param):not(.pending)"),
      )
        .map((p) => p.getAttribute("d"))
        .filter((d) => d.startsWith(`M ${node.arrange.x + 400},`));

      expect(starts.length).toBeGreaterThan(0);
      finish();
    }));

    it("keeps a saved width when a DOM resize event bubbles out of the node", fakeAsync(() => {
      const project = connectionProject();
      const node = project.pipeline.nodes.get("node_one");
      node.arrange.w = 400;
      const { element, detectChanges } = setupEditor({ project });

      nodeElement(element, "node_one")
        .querySelector(".head")
        .dispatchEvent(new Event("resize", { bubbles: true }));
      detectChanges();

      expect(node.arrange.w).toBe(400);
      finish();
    }));

    it("goes back to the default width on a double-click", fakeAsync(() => {
      const project = connectionProject();
      const node = project.pipeline.nodes.get("node_one");
      node.arrange.w = 400;
      const { element, detectChanges } = setupEditor({ project });

      edge(element, "node_one").dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      );
      detectChanges();

      expect(node.arrange.w).toBeUndefined();
      expect(nodeElement(element, "node_one").style.width).toBe("220px");
      finish();
    }));

    it("shows a viewer the width without an edge to drag", fakeAsync(() => {
      const project = connectionProject();
      project.pipeline.nodes.get("node_one").arrange.w = 300;
      const { element } = setupEditor({ project, user: "stranger" });

      expect(edge(element, "node_one")).toBeNull();
      expect(nodeElement(element, "node_one").style.width).toBe("300px");
      finish();
    }));
  });
  describe("groups", () => {
    function groupedProject() {
      const project = projectA();
      const one = project.pipeline.nodes.get("node_one").arrange;
      project.pipeline.layout ??= toInstance(
        { left: 0, top: 0, zoom: 1 },
        Layout,
      );
      project.pipeline.layout.groups = new Map([
        [
          "prepare",
          toInstance(
            {
              title: "Prepare",
              color: "blue",
              x: one.x - 20,
              y: one.y - 40,
              w: 300,
              h: 200,
            },
            LayoutGroup,
          ),
        ],
        [
          "empty",
          toInstance(
            { title: "Later", x: -2000, y: -2000, w: 200, h: 120 },
            LayoutGroup,
          ),
        ],
      ]);
      return project;
    }

    it("draws each group as a frame with its title, colour and node count", fakeAsync(() => {
      const { element } = setupEditor({ project: groupedProject() });

      const prepare = element.querySelector<HTMLElement>(
        '[data-testid="group-prepare"]',
      );
      const later = element.querySelector<HTMLElement>(
        '[data-testid="group-empty"]',
      );

      expect(prepare.querySelector(".group-title").textContent).toBe("Prepare");
      expect(prepare.dataset["color"]).toBe("blue");
      expect(prepare.querySelector(".group-count").textContent).toBe("1 node");
      expect(prepare.style.width).toBe("300px");
      expect(later.dataset["color"]).toBe("gray");
      expect(later.querySelector(".group-count").textContent).toBe("0 nodes");
      finish();
    }));

    function drag(
      target: Element,
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) {
      const fire = (type: string, at: { x: number; y: number }) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: at.x,
            clientY: at.y,
            button: 0,
            pointerId: 1,
          }),
        );
      fire("pointerdown", from);
      fire("pointermove", to);
      fire("pointerup", to);
    }

    it("groups the selected nodes with Ctrl + G around their boxes", fakeAsync(() => {
      const project = projectA();
      const { editor, element, detectChanges, manager } = setupEditor({
        project,
      });
      editor.selection = new Set(["node:node_one", "node:node_two"]);
      detectChanges();
      const button = element.querySelector('[data-testid="group-selection"]');

      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "g",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      detectChanges();

      const [group] = [...project.pipeline.layout.groups.values()];
      const one = project.pipeline.nodes.get("node_one").arrange;
      expect(button).not.toBeNull();
      expect(group.title).toBe("Group");
      expect([group.x, group.y]).toEqual([
        Math.max(0, one.x - 24),
        Math.max(0, one.y - 52),
      ]);
      expect(groupMembers(project.pipeline, group).sort()).toEqual([
        "node_one",
        "node_two",
      ]);
      expect(element.querySelectorAll(".pane > .group").length).toBe(1);
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("offers Group only while nodes are selected", fakeAsync(() => {
      const { element } = setupEditor();

      expect(
        element.querySelector('[data-testid="group-selection"]'),
      ).toBeNull();
      finish();
    }));

    it("moves a group and the nodes it holds by its bar", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges, manager } = setupEditor({ project });
      const group = project.pipeline.layout.groups.get("prepare");
      const one = { ...project.pipeline.nodes.get("node_one").arrange };
      const two = { ...project.pipeline.nodes.get("node_two").arrange };
      const frame = { x: group.x, y: group.y };

      drag(
        element.querySelector('[data-testid="group-bar-prepare"]'),
        { x: 10, y: 10 },
        { x: 60, y: 40 },
      );
      detectChanges();

      expect([group.x, group.y]).toEqual([frame.x + 50, frame.y + 30]);
      expect(project.pipeline.nodes.get("node_one").arrange).toEqual(
        expect.objectContaining({ x: one.x + 50, y: one.y + 30 }),
      );
      expect(project.pipeline.nodes.get("node_two").arrange).toEqual(
        expect.objectContaining({ x: two.x, y: two.y }),
      );
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("resizes a group by its corner, no smaller than 120 × 80", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({ project });
      const group = project.pipeline.layout.groups.get("prepare");
      const corner = () =>
        element.querySelector('[data-testid="group-resize-prepare"]');

      drag(corner(), { x: 0, y: 0 }, { x: 40, y: 20 });
      detectChanges();
      const grown = [group.w, group.h];
      drag(corner(), { x: 0, y: 0 }, { x: -1000, y: -1000 });
      detectChanges();

      expect(grown).toEqual([340, 220]);
      expect([group.w, group.h]).toEqual([120, 80]);
      finish();
    }));

    it("lets a viewer see groups but not move or resize them", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({
        project,
        user: "stranger",
      });
      const group = project.pipeline.layout.groups.get("prepare");
      const x = group.x;

      drag(
        element.querySelector('[data-testid="group-bar-prepare"]'),
        { x: 0, y: 0 },
        { x: 80, y: 0 },
      );
      detectChanges();

      expect(group.x).toBe(x);
      expect(
        element.querySelector('[data-testid="group-resize-prepare"]'),
      ).toBeNull();
      finish();
    }));

    function chooseFromGroupMenu(
      element: HTMLElement,
      detectChanges: () => void,
      label: string,
    ) {
      element
        .querySelector<HTMLElement>('[data-testid="group-menu-prepare"]')
        .click();
      detectChanges();
      Array.from(
        document.querySelectorAll<HTMLElement>("tui-data-list [tuiOption]"),
      )
        .find((o) => o.textContent.trim() === label)
        .click();
      detectChanges();
      tick(UI_DELAY);
      detectChanges();
    }

    it("tints a group from its colour dot", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges, manager } = setupEditor({ project });
      // A closed palette stays in the DOM while it leaves: take the newest.
      const swatch = (color: string) =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-testid="group-color-${color}"]`,
          ),
        ).at(-1);

      element
        .querySelector<HTMLElement>('[data-testid="group-dot-prepare"]')
        .click();
      detectChanges();
      swatch("green").click();
      detectChanges();
      const green = project.pipeline.layout.groups.get("prepare").color;
      element
        .querySelector<HTMLElement>('[data-testid="group-dot-prepare"]')
        .click();
      detectChanges();
      swatch("gray").click();
      detectChanges();

      expect(green).toBe("green");
      expect(
        project.pipeline.layout.groups.get("prepare").color,
      ).toBeUndefined();
      expect(manager.status.value).toBe("dirty");
      finish();
    }));

    it("renames a group from its title; Esc and a blank title keep it", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({ project });
      const group = project.pipeline.layout.groups.get("prepare");
      const field = () =>
        element.querySelector<HTMLInputElement>(
          '[data-testid="group-title-field-prepare"]',
        );
      const rename = () => {
        element
          .querySelector('[data-testid="group-title-prepare"]')
          .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        detectChanges();
      };
      const key = (k: string) =>
        field().dispatchEvent(
          new KeyboardEvent("keydown", { key: k, bubbles: true }),
        );

      rename();
      field().value = "Ignored";
      key("Escape");
      detectChanges();
      const afterEsc = group.title;
      rename();
      field().value = "   ";
      key("Enter");
      detectChanges();
      const afterBlank = group.title;
      rename();
      field().value = "Inputs";
      key("Enter");
      detectChanges();

      expect([afterEsc, afterBlank]).toEqual(["Prepare", "Prepare"]);
      expect(group.title).toBe("Inputs");
      expect(field()).toBeNull();
      finish();
    }));

    it("opens a new group's title for naming", fakeAsync(() => {
      const { editor, element, detectChanges } = setupEditor();
      editor.selection = new Set(["node:node_one"]);
      detectChanges();

      editor.groupSelection();
      detectChanges();

      const field =
        element.querySelector<HTMLInputElement>(".group-title-field");
      expect(field?.value).toBe("Group");
      expect(document.activeElement).toBe(field);
      finish();
    }));

    it("fits a group to the nodes it holds", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({ project });
      const group = project.pipeline.layout.groups.get("prepare");
      const one = project.pipeline.nodes.get("node_one").arrange;

      chooseFromGroupMenu(element, detectChanges, "Fit to nodes");

      expect([group.x, group.y]).toEqual([
        Math.max(0, one.x - 24),
        Math.max(0, one.y - 52),
      ]);
      expect(group.w).toBe(
        nodeElement(element, "node_one").offsetWidth +
          48 -
          Math.max(0, 24 - one.x),
      );
      finish();
    }));

    it("ungroups and keeps the nodes", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({ project });
      const nodes = project.pipeline.nodes.size;

      chooseFromGroupMenu(element, detectChanges, "Ungroup");

      expect(project.pipeline.layout.groups.has("prepare")).toBe(false);
      expect(project.pipeline.nodes.size).toBe(nodes);
      expect(element.querySelector('[data-testid="group-prepare"]')).toBeNull();
      finish();
    }));

    it("deletes a group with its nodes after one confirmation", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({ project });

      chooseFromGroupMenu(element, detectChanges, "Delete with nodes");
      const message = openDialog().textContent;
      Array.from(openDialog().querySelectorAll("button"))
        .find((b) => b.textContent.trim() === "Delete")
        .click();
      detectChanges();
      tick(UI_DELAY);
      detectChanges();

      expect(message).toContain("Delete group «Prepare» and its 1 nodes?");
      expect(project.pipeline.layout.groups.has("prepare")).toBe(false);
      expect(project.pipeline.nodes.has("node_one")).toBe(false);
      expect(project.pipeline.nodes.has("node_two")).toBe(true);
      finish();
    }));

    it("gives a viewer no colour, rename or menu", fakeAsync(() => {
      const project = groupedProject();
      const { element, detectChanges } = setupEditor({
        project,
        user: "stranger",
      });

      element
        .querySelector('[data-testid="group-title-prepare"]')
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      detectChanges();

      expect(
        element.querySelector('[data-testid="group-dot-prepare"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="group-menu-prepare"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="group-title-field-prepare"]'),
      ).toBeNull();
      finish();
    }));

    it("draws no frames for a pipeline without groups", fakeAsync(() => {
      const { element } = setupEditor();

      expect(element.querySelectorAll(".pane > .group").length).toBe(0);
      finish();
    }));
  });
  describe("minimap", () => {
    afterEach(() => localStorage.removeItem("canvas_minimap"));

    it("shows the minimap until it is turned off, and remembers that", fakeAsync(() => {
      const { element, detectChanges } = setupEditor();
      tick();
      detectChanges();
      const shown = !!element.querySelector("app-canvas-minimap");

      element
        .querySelector<HTMLElement>('[data-testid="minimap-toggle"]')
        .click();
      detectChanges();

      expect(shown).toBe(true);
      expect(element.querySelector("app-canvas-minimap")).toBeNull();
      expect(localStorage.getItem("canvas_minimap")).toBe("false");
      finish();
    }));
  });
});
