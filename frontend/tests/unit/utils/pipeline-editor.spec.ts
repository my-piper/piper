import { Node } from "src/models/node";
import { FlowTransformer } from "src/models/node-flow";
import { Project } from "src/models/project";
import { copyNodes } from "src/utils/canvas-clipboard";
import { toInstance, toPlain } from "src/utils/models";
import { dropDangling, PipelineEditor } from "src/utils/pipeline-editor";
import { projectA, projectWith } from "../../fixtures/models";
import { smallGraphPipeline } from "../../fixtures/plain";

/** Small graph plus node_three with typed ports for the connection rules. */
function typedProject(): Project {
  const pipeline = smallGraphPipeline() as { nodes: Record<string, unknown> };
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
        title: "Other",
        type: "json",
        featured: true,
        schema: { id: "other" },
      },
    },
    outputs: {
      answer: { title: "Answer", type: "json", schema: "answer" },
      cover: { title: "Cover", type: "image" },
    },
  };
  return projectWith(pipeline);
}

function emptyProject(): Project {
  return projectWith({
    ...smallGraphPipeline(),
    nodes: {},
    flows: {},
    inputs: {},
    outputs: {},
    start: { nodes: [] },
  });
}

function catalogNode(_id = "catalog") {
  return toInstance(
    {
      _id,
      title: "Catalog",
      version: 1,
      execution: "rapid",
      arrange: { x: 0, y: 0 },
      inputs: { text: { title: "Text", type: "string", featured: true } },
      outputs: { text: { title: "Text", type: "string" } },
    },
    Node,
  );
}

function editorOf(project: Project) {
  const editor = new PipelineEditor(project.pipeline, project.launchRequest);
  const changed = vi.fn();
  editor.changed.subscribe(changed);
  return { editor, changed, pipeline: project.pipeline };
}

/** Every node id a Flow of the pipeline points at. */
function flowEnds({ pipeline }: Project) {
  return [
    ...[...pipeline.flows.values()].flatMap((f) => [f.from, f.to]),
    ...[...pipeline.inputs.values()].flatMap((i) =>
      [...i.flows.values()].map((f) => f.to),
    ),
    ...[...pipeline.outputs.values()].flatMap((o) =>
      [...o.flows.values()].map((f) => f.from),
    ),
  ];
}

describe("PipelineEditor", () => {
  describe("adding Nodes", () => {
    it("makes the first Node of an empty pipeline its Start Node", () => {
      const project = emptyProject();
      const { editor, changed, pipeline } = editorOf(project);

      const first = editor.addNode(catalogNode(), { at: { x: 120, y: 80 } });
      const second = editor.addNode(catalogNode());

      expect(first).toMatch(/^catalog_[0-9a-f]{10}$/);
      expect(second).not.toBe(first);
      expect(pipeline.start.nodes).toEqual([first]);
      expect(pipeline.nodes.get(first).arrange).toEqual(
        expect.objectContaining({ x: 120, y: 80 }),
      );
      expect(changed).toHaveBeenCalledTimes(2);
    });

    it("keeps existing Start Nodes and takes a given id", () => {
      const project = projectA();
      const { editor, pipeline } = editorOf(project);

      const id = editor.addNode(catalogNode(), { id: "mine" });

      expect(id).toBe("mine");
      expect(pipeline.nodes.has("mine")).toBe(true);
      expect(pipeline.start.nodes).toEqual(["node_one"]);
    });
  });

  describe("removing Nodes", () => {
    it("removes a wired Node with its Flows, Start Node mark and launch values", () => {
      const project = projectA();
      const { editor, changed, pipeline } = editorOf(project);

      editor.removeNode("node_one");

      expect(pipeline.nodes.has("node_one")).toBe(false);
      expect(flowEnds(project)).not.toContain("node_one");
      expect(pipeline.flows.size).toBe(0);
      expect(pipeline.inputs.get("topic").flows.size).toBe(0);
      expect(pipeline.outputs.get("result").flows.size).toBe(1);
      expect(pipeline.start.nodes).toEqual([]);
      expect(project.launchRequest.nodes.has("node_one")).toBe(false);
      expect(project.launchRequest.nodes.has("node_two")).toBe(true);
      expect(changed).toHaveBeenCalledTimes(1);
    });
  });

  describe("replacing Nodes", () => {
    it("keeps the Node's place and drops the Flows and values of gone sockets", () => {
      const project = projectA();
      const { editor, changed, pipeline } = editorOf(project);
      const plain = toPlain(pipeline.nodes.get("node_two")) as {
        inputs: Record<string, unknown>;
        outputs: Record<string, unknown>;
        arrange: object;
      };
      delete plain.inputs["flag"];
      delete plain.outputs["result"];
      plain.arrange = { x: 0, y: 0 };

      const replaced = editor.replaceNode("node_two", toInstance(plain, Node));

      const node = pipeline.nodes.get("node_two");
      expect(replaced).toBe(true);
      expect(node.arrange).toEqual(expect.objectContaining({ x: 560, y: 40 }));
      expect([...pipeline.flows.keys()]).toEqual(["one_to_two"]);
      expect(pipeline.outputs.get("result").flows.size).toBe(0);
      const values = project.launchRequest.nodes.get("node_two");
      expect([...values.inputs.keys()]).toEqual(["count", "label"]);
      expect(values.outputs.size).toBe(0);
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it("leaves the pipeline alone for an unknown Node", () => {
      const project = projectA();
      const { editor, changed, pipeline } = editorOf(project);
      const before = toPlain(pipeline);

      const replaced = editor.replaceNode("ghost", catalogNode());

      expect(replaced).toBe(false);
      expect(toPlain(pipeline)).toEqual(before);
      expect(changed).not.toHaveBeenCalled();
    });
  });

  describe("connecting", () => {
    it("adds a JSON transformer when a JSON output feeds a scalar input", () => {
      const { editor, pipeline } = editorOf(typedProject());

      const key = editor.connect(
        { node: "node_two", output: "result" },
        { node: "node_three", input: "amount" },
      );

      expect(pipeline.flows.get(key).transformer.type).toBe("json");
    });

    it("connects JSON ports only when their schemas match", () => {
      const { editor, pipeline } = editorOf(typedProject());
      const source = { node: "node_three", output: "answer" };

      const other = editor.connect(source, {
        node: "node_three",
        input: "other",
      });
      const doc = editor.connect(source, { node: "node_three", input: "doc" });

      expect(other).toBeNull();
      expect(pipeline.flows.get(doc).transformer).toBeUndefined();
    });

    it("adds an array transformer between image and image[] ports only", () => {
      const { editor, pipeline } = editorOf(typedProject());
      const images = { node: "node_two", output: "images" };

      const picture = editor.connect(images, {
        node: "node_three",
        input: "picture",
      });
      const pictures = editor.connect(images, {
        node: "node_three",
        input: "pictures",
      });
      const words = editor.connect(
        { node: "node_three", output: "cover" },
        { node: "node_three", input: "words" },
      );

      expect(pipeline.flows.get(picture).transformer).toEqual(
        expect.objectContaining({ type: "array", index: 0 }),
      );
      expect(pipeline.flows.get(pictures).transformer).toBeUndefined();
      expect(words).toBeNull();
    });

    it("keeps the settings of a given transformer of the kind the types need", () => {
      const { editor, pipeline } = editorOf(typedProject());
      const path = toInstance(
        { type: "json", path: "data.amount" },
        FlowTransformer,
      );
      const array = toInstance({ type: "array", index: 2 }, FlowTransformer);

      const amount = editor.connect(
        { node: "node_two", output: "result" },
        { node: "node_three", input: "amount" },
        path,
      );
      const words = editor.connect(
        { node: "node_one", output: "text" },
        { node: "node_three", input: "words" },
        array,
      );

      expect(pipeline.flows.get(amount).transformer).toEqual(
        expect.objectContaining({ type: "json", path: "data.amount" }),
      );
      expect(pipeline.flows.get(words).transformer).toBeUndefined();
    });

    it("connects a pipeline input only to an input of the same type", () => {
      const project = typedProject();
      const { editor, pipeline } = editorOf(project);

      const amount = editor.connect(
        { input: "topic" },
        { node: "node_three", input: "amount" },
      );
      const words = editor.connect(
        { input: "topic" },
        { node: "node_three", input: "words" },
      );

      const targets = [...pipeline.inputs.get("topic").flows.values()].map(
        (f) => `${f.to}.${f.input}`,
      );
      expect(amount).toBeNull();
      expect(words).toMatch(/^to_node_three_words_[0-9a-f]{5}$/);
      expect(targets).toEqual(["node_one.prompt", "node_three.words"]);
    });

    it("gives repeated connections distinct keys", () => {
      const { editor } = editorOf(typedProject());
      const source = { node: "node_one", output: "text" };
      const target = { node: "node_three", input: "words" };

      const first = editor.connect(source, target);
      const second = editor.connect(source, target);

      expect(first).toMatch(/^node_one_to_node_three_[0-9a-f]{5}$/);
      expect(second).not.toBe(first);
    });

    it("refuses unknown ends without a change", () => {
      const { editor, changed, pipeline } = editorOf(typedProject());
      const flows = pipeline.flows.size;

      const results = [
        editor.connect(
          { node: "ghost", output: "text" },
          { node: "node_three", input: "words" },
        ),
        editor.connect(
          { node: "node_one", output: "text" },
          { node: "ghost", input: "words" },
        ),
        editor.connect(
          { input: "ghost" },
          { node: "node_three", input: "words" },
        ),
      ];

      expect(results).toEqual([null, null, null]);
      expect(pipeline.flows.size).toBe(flows);
      expect(changed).not.toHaveBeenCalled();
    });

    it("tells which input types a source can connect to", () => {
      const { editor } = editorOf(typedProject());

      const accepted = [
        editor.accepts({ node: "node_two", output: "result" }),
        editor.accepts({ node: "node_two", output: "images" }),
        editor.accepts({ node: "node_one", output: "text" }),
        editor.accepts({ input: "topic" }),
        editor.accepts({ node: "ghost", output: "text" }),
      ];

      expect(accepted).toEqual([
        ["json", "string", "integer", "float", "boolean"],
        ["image", "image[]"],
        ["string"],
        ["string"],
        null,
      ]);
    });
  });

  describe("pasting", () => {
    it("pastes with new ids, remapped Flows, moved positions and input values", () => {
      const project = projectA();
      const { editor, changed, pipeline } = editorOf(project);
      const clip = copyNodes(pipeline, project.launchRequest, [
        "node_one",
        "node_two",
      ]);
      const flows = pipeline.flows.size;

      const [one, two] = editor.paste(clip, { x: 1000, y: 500 });

      expect(one).toMatch(/^node_one_[0-9a-f]{10}$/);
      expect(pipeline.nodes.get(one).arrange).toEqual(
        expect.objectContaining({ x: 1000, y: 500 }),
      );
      expect(pipeline.nodes.get(two).arrange).toEqual(
        expect.objectContaining({ x: 1360, y: 500 }),
      );
      expect(pipeline.flows.size).toBe(flows + 1);
      expect(
        [...pipeline.flows.values()].some(
          (f) => f.from === one && f.to === two && f.input === "text",
        ),
      ).toBe(true);
      expect(
        project.launchRequest.nodes.get(one).inputs.get("temperature"),
      ).toBe(0);
      expect(pipeline.nodes.get("node_one").arrange).toEqual(
        expect.objectContaining({ x: 200, y: 40 }),
      );
      expect(pipeline.start.nodes).toEqual(["node_one"]);
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it("pastes 40px off the originals without a point, sharing no objects", () => {
      const project = projectA();
      const { editor, pipeline } = editorOf(project);
      const clip = copyNodes(pipeline, null, ["node_one"]);

      const [first] = editor.paste(clip);
      const [second] = editor.paste(clip);

      expect(pipeline.nodes.get(first)).not.toBe(pipeline.nodes.get(second));
      expect(pipeline.nodes.get(first).arrange).toEqual(
        expect.objectContaining({ x: 240, y: 80 }),
      );
    });

    it("makes the first pasted Node the Start Node of an empty pipeline", () => {
      const source = projectA();
      const clip = copyNodes(source.pipeline, null, ["node_two", "node_one"]);
      const project = emptyProject();
      const { editor, pipeline } = editorOf(project);

      const ids = editor.paste(clip, { x: 0, y: 0 });

      expect(pipeline.start.nodes).toEqual([ids[0]]);
    });
  });

  describe("dropping dangling references", () => {
    it("drops Flows into inputs that are not featured", () => {
      const project = projectA();
      project.pipeline.nodes.get("node_two").inputs.get("text").featured =
        false;

      dropDangling(project.pipeline, project.launchRequest);

      expect(project.pipeline.flows.size).toBe(0);
      expect(project.pipeline.inputs.get("topic").flows.size).toBe(1);
    });
  });
});
