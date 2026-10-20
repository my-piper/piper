import { fakeAsync, tick } from "@angular/core/testing";
import { NodeToLaunch } from "src/models/launch-request";
import { InputFlow } from "src/models/input-flow";
import { NodeFlow } from "src/models/node-flow";
import { OutputFlow } from "src/models/output-flow";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { mapTo } from "src/utils/models";
import {
  setupProjectManager,
  UPDATE_DEBOUNCE,
} from "../../helpers/project-manager";
import { projectA, projectWith } from "../../fixtures/models";
import {
  smallGraphWithImageTransformer,
  smallGraphWithJsonTransformer,
} from "../../fixtures/plain";

/**
 * `sanitize` is private to project.manager.ts; it runs through the public
 * `markDirty` → `updates` path (immediately after a quiet period).
 */
function sanitizeVia(manager: ProjectManager, project: Project) {
  manager.project = project;
  tick(UPDATE_DEBOUNCE + 1);
  manager.markDirty();
  manager.project = null;
  tick(UPDATE_DEBOUNCE * 4);
}

function sanitized(project: Project): Project {
  const { manager } = setupProjectManager();
  sanitizeVia(manager, project);
  return project;
}

function launchInputs(project: Project, node: string) {
  return project.launchRequest.nodes.get(node)?.inputs;
}

describe("ProjectManager graph sanitation", () => {
  it("removes unknown start nodes and keeps known ones in order", fakeAsync(() => {
    const project = projectA();
    project.pipeline.start.nodes = ["ghost", "node_one", "ghost_2", "node_two"];

    sanitized(project);

    expect(project.pipeline.start.nodes).toEqual(["node_one", "node_two"]);
  }));

  describe("pipeline inputs", () => {
    it("drops flows to unknown nodes, deleted ports and non-featured inputs", fakeAsync(() => {
      const project = projectA();
      const { flows } = project.pipeline.inputs.get("topic");
      flows.set("to_ghost", new InputFlow({ to: "ghost", input: "prompt" }));
      flows.set(
        "to_deleted_port",
        new InputFlow({ to: "node_one", input: "deleted" }),
      );
      flows.set(
        "to_not_featured",
        new InputFlow({ to: "node_one", input: "temperature" }),
      );

      sanitized(project);

      expect(Array.from(flows.keys())).toEqual(["topic_to_prompt"]);
    }));

    it("removes an input left without flows together with its launch value", fakeAsync(() => {
      const project = projectA();
      project.pipeline.nodes.get("node_one").inputs.delete("prompt");

      sanitized(project);

      expect(project.pipeline.inputs.has("topic")).toBeFalse();
      expect(project.launchRequest.inputs.has("topic")).toBeFalse();
      expect(project.launchRequest.inputs.get("zero")).toBe(0);
      expect(project.launchRequest.inputs.get("off")).toBeFalse();
      expect(project.launchRequest.inputs.get("empty")).toBe("");
    }));
  });

  describe("pipeline outputs", () => {
    it("removes flows from unknown nodes and outputs left empty", fakeAsync(() => {
      const project = projectA();
      project.pipeline.nodes.delete("node_two");

      sanitized(project);

      expect(project.pipeline.outputs.has("result")).toBeFalse();
    }));

    it("removes flows from deleted output ports", fakeAsync(() => {
      const project = projectA();
      const { flows } = project.pipeline.outputs.get("result");
      flows.set(
        "from_deleted_port",
        new OutputFlow({ from: "node_two", output: "deleted" }),
      );

      sanitized(project);

      expect(Array.from(flows.keys())).toEqual(["result_from_two"]);
    }));
  });

  describe("node flows", () => {
    it("removes flows to non-featured inputs and from deleted outputs", fakeAsync(() => {
      const project = projectA();
      const { flows } = project.pipeline;
      flows.set(
        "to_not_featured",
        new NodeFlow({
          from: "node_one",
          output: "text",
          to: "node_two",
          input: "flag",
        }),
      );
      flows.set(
        "from_deleted",
        new NodeFlow({
          from: "node_one",
          output: "deleted",
          to: "node_two",
          input: "text",
        }),
      );

      sanitized(project);

      expect(Array.from(flows.keys())).toEqual(["one_to_two"]);
    }));
  });

  describe("launch request nodes", () => {
    it("removes overrides equal to the default and keeps explicit falsy overrides", fakeAsync(() => {
      const project = projectA();
      const two = launchInputs(project, "node_two");
      two.set("flag", false);
      two.set("count", 0);
      two.set("label", "");
      launchInputs(project, "node_one").set("temperature", 0);

      sanitized(project);

      expect(launchInputs(project, "node_one").get("temperature")).toBe(0);
      expect(two.has("flag")).toBeFalse();
      expect(two.has("count")).toBeFalse();
      expect(two.has("label")).toBeFalse();
    }));

    it("keeps explicit falsy overrides that differ from the default", fakeAsync(() => {
      const project = projectA();
      const node = project.pipeline.nodes.get("node_two");
      node.inputs.get("flag").default = true;
      node.inputs.get("count").default = 5;
      node.inputs.get("label").default = "default label";
      const two = launchInputs(project, "node_two");
      two.set("flag", false);
      two.set("count", 0);
      two.set("label", "");

      sanitized(project);

      expect(two.get("flag")).toBe(false);
      expect(two.get("count")).toBe(0);
      expect(two.get("label")).toBe("");
    }));

    it("removes values for deleted input ports and unknown nodes", fakeAsync(() => {
      const project = projectA();
      launchInputs(project, "node_two").set("deleted", 1);
      project.launchRequest.nodes.set(
        "ghost",
        new NodeToLaunch({ inputs: new Map([["x", 1]]) }),
      );

      sanitized(project);

      expect(launchInputs(project, "node_two").has("deleted")).toBeFalse();
      expect(project.launchRequest.nodes.has("ghost")).toBeFalse();
    }));

    it("removes values for deleted output ports from outputs, not inputs", fakeAsync(() => {
      const project = projectA();
      const two = project.launchRequest.nodes.get("node_two");
      two.inputs.set("result", "input named like an output");
      two.outputs.set("deleted", "stale");

      sanitized(project);

      expect(two.outputs.has("deleted")).toBeFalse();
      expect(two.outputs.get("result")).toBe('{"data":{"answer":"42"}}');
      expect(two.inputs.has("count")).toBeTrue();
    }));

    it("removes deleted output values when the node has no inputs map", fakeAsync(() => {
      const project = projectA();
      project.launchRequest.nodes.set(
        "node_one",
        new NodeToLaunch({
          outputs: new Map([
            ["text", "kept"],
            ["deleted", "stale"],
          ]),
        }),
      );

      sanitized(project);

      const one = project.launchRequest.nodes.get("node_one");
      expect(one.outputs.has("deleted")).toBeFalse();
      expect(one.outputs.get("text")).toBe("kept");
    }));

    it("removes launch nodes left without inputs or outputs", fakeAsync(() => {
      const project = projectA();
      project.launchRequest.nodes.set("node_one", mapTo({}, NodeToLaunch));

      sanitized(project);

      expect(project.launchRequest.nodes.has("node_one")).toBeFalse();
    }));

    it("copies a cached upstream output into the downstream input", fakeAsync(() => {
      const project = projectA();
      project.launchRequest.nodes.set(
        "node_one",
        new NodeToLaunch({ outputs: new Map([["text", ""]]) }),
      );

      sanitized(project);

      expect(launchInputs(project, "node_two").get("text")).toBe("");
    }));
  });

  describe("json transformer", () => {
    const cases: [string, string, string, string | number | boolean][] = [
      ["string from string", "data.answer", "answer", "42"],
      ["string from number", "data.number", "answer", "7"],
      ["integer from number", "data.zero", "amount", 0],
      ["integer from string", "data.answer", "amount", 42],
      ["boolean from false", "data.no", "enabled", false],
      ["boolean from truthy", "data.answer", "enabled", true],
    ];

    for (const [name, path, input, expected] of cases) {
      it(`converts ${name}`, fakeAsync(() => {
        const plain = smallGraphWithJsonTransformer(path) as {
          flows: Record<string, { input: string }>;
          nodes: Record<string, { inputs: Record<string, object> }>;
        };
        // The fixture's integer input is named `size`, a Map.prototype getter
        // that class-transformer skips when building Maps; use another name.
        plain.nodes["node_three"].inputs["amount"] = {
          title: "Amount",
          type: "integer",
          featured: true,
        };
        plain.flows["two_to_three"].input = input;
        const project = projectWith(plain);
        project.launchRequest.nodes
          .get("node_two")
          .outputs.set(
            "result",
            '{"data":{"answer":"42","number":7,"zero":0,"no":false}}',
          );

        sanitized(project);

        expect(launchInputs(project, "node_three")?.get(input)).toEqual(
          expected,
        );
      }));
    }

    it("leaves the input unset for a missing path", fakeAsync(() => {
      const project = projectWith(smallGraphWithJsonTransformer("data.none"));

      sanitized(project);

      expect(project.launchRequest.nodes.has("node_three")).toBeFalse();
    }));

    it("leaves the input unset for malformed JSON without throwing", fakeAsync(() => {
      const project = projectWith(smallGraphWithJsonTransformer());
      project.launchRequest.nodes
        .get("node_two")
        .outputs.set("result", "{not json");

      sanitized(project);

      expect(project.launchRequest.nodes.has("node_three")).toBeFalse();
      expect(project.pipeline.flows.has("two_to_three")).toBeTrue();
    }));
  });

  describe("image array transformer", () => {
    const images = "a.png|b.png|c.png";
    const cases: [number, string | null][] = [
      [0, "a.png"],
      [1, "b.png"],
      [2, "c.png"],
      [10, "c.png"],
    ];

    for (const [index, expected] of cases) {
      it(`selects index ${index}`, fakeAsync(() => {
        const project = projectWith(smallGraphWithImageTransformer(index));
        project.launchRequest.nodes
          .get("node_two")
          .outputs.set("images", images);

        sanitized(project);

        expect(launchInputs(project, "node_four").get("image")).toBe(expected);
      }));
    }

    it("sets null for an empty image list", fakeAsync(() => {
      const project = projectWith(smallGraphWithImageTransformer(0));
      project.launchRequest.nodes.get("node_two").outputs.set("images", "");

      sanitized(project);

      expect(launchInputs(project, "node_four").get("image")).toBeNull();
    }));
  });
});
