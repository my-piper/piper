import { diff, patch } from "jsondiffpatch";
import { cloneDeep } from "lodash";
import { PipelineEvent, SetLaunchOutputEvent } from "src/models/events";
import {
  FloatData,
  JsonData,
  LaunchArtefact,
  StringData,
} from "src/models/launch";
import { LaunchRequest, NodeToLaunch } from "src/models/launch-request";
import { Node } from "src/models/node";
import { FlowTransformer, NodeFlow } from "src/models/node-flow";
import { Pipeline, PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { User, UserRole } from "src/models/user";
import { ajvFactory } from "src/providers/ajv";
import compiled from "src/schemas/compiled.json";
import { toInstance, toPlain } from "src/utils/models";
import {
  launch,
  launchRequest,
  projectA,
  projectB,
  smallGraph,
} from "../../fixtures/models";
import {
  launchRequestPlain,
  nodeEventPlain,
  PATCH_PROJECT_URL,
  PROJECT_A_ID,
  projectAPlain,
  setOutputEventPlain,
  smallGraphPipeline,
  smallGraphWithImageTransformer,
  smallGraphWithJsonTransformer,
} from "../../fixtures/plain";

const SCHEMAS = compiled as unknown as {
  pipeline: object;
  launchRequest: object;
};

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

describe("fixture contracts", () => {
  describe("schema validity", () => {
    const variants: [string, () => object][] = [
      ["small graph", smallGraphPipeline],
      ["json transformer", () => smallGraphWithJsonTransformer()],
      ["image transformer", () => smallGraphWithImageTransformer()],
    ];

    for (const [name, factory] of variants) {
      it(`validates the ${name} pipeline against the checked-in schema`, () => {
        const validate = ajvFactory().compile(SCHEMAS.pipeline);

        const valid = validate(factory());

        expect(validate.errors).toBeNull();
        expect(valid).toBeTrue();
      });
    }

    it("keeps a pipeline valid after a real-model round trip", () => {
      const validate = ajvFactory().compile(SCHEMAS.pipeline);

      const valid = validate(toPlain(smallGraph()));

      expect(validate.errors).toBeNull();
      expect(valid).toBeTrue();
    });

    it("validates launch request inputs/nodes/inclusive against the schema", () => {
      // The checked-in launchRequest schema declares `options.saveArtefacts`,
      // while frontend and backend models use `options.bucket` (contract drift
      // recorded in docs/frontend-testing-plan.md, T002 follow-ups).
      const validate = ajvFactory().compile(SCHEMAS.launchRequest);
      const { options, ...request } = launchRequestPlain();

      const valid = validate(request);

      expect(options).toEqual({ bucket: "outputs" });
      expect(validate.errors).toBeNull();
      expect(valid).toBeTrue();
    });

    it("rejects a pipeline node without its required title", () => {
      const validate = ajvFactory().compile(SCHEMAS.pipeline);
      const pipeline = smallGraphPipeline() as {
        nodes: Record<string, Record<string, unknown>>;
      };
      delete pipeline.nodes["node_one"]["title"];

      expect(validate(pipeline)).toBeFalse();
    });
  });

  describe("project conversion", () => {
    it("builds real Maps, class instances and Dates", () => {
      const project = projectA();

      expect(project).toBeInstanceOf(Project);
      expect(project.createdAt).toEqual(new Date("2026-02-01T10:00:00.000Z"));
      expect(project.createdBy).toBeInstanceOf(User);
      expect(project.pipeline).toBeInstanceOf(Pipeline);
      expect(project.pipeline.nodes).toBeInstanceOf(Map);
      expect(project.pipeline.nodes.get("node_one")).toBeInstanceOf(Node);
      expect(project.pipeline.inputs.get("topic")).toBeInstanceOf(
        PipelineInput,
      );
      expect(project.pipeline.flows.get("one_to_two")).toBeInstanceOf(NodeFlow);
      expect(project.launchRequest).toBeInstanceOf(LaunchRequest);
      expect(project.launchRequest.nodes.get("node_two")).toBeInstanceOf(
        NodeToLaunch,
      );
      expect(project.environment.variables.get("RETRIES")).toBe(0);
    });

    it("round-trips the pipeline wire shape with Maps serialized as keyed objects", () => {
      const plain = smallGraphPipeline();

      const roundTrip = toPlain(toInstance(plain, Pipeline));

      expect(json(roundTrip)).toEqual(plain);
    });

    it("serializes Dates to the ISO wire form", () => {
      const plain = json(toPlain(projectA()));

      expect(plain.createdAt).toBe("2026-02-01T10:00:00.000Z");
      expect(plain.pipeline.nodes.node_one.inputs.prompt.featured).toBeTrue();
    });

    it("drops unknown and unexposed properties", () => {
      const plain = {
        ...projectAPlain(),
        secret: "x",
        pipeline: { ...smallGraphPipeline(), internal: true },
      };

      const project = toInstance(plain, Project);

      expect("secret" in project).toBeFalse();
      expect("internal" in project.pipeline).toBeFalse();
    });

    it("keeps empty collections as empty Maps and missing optionals absent", () => {
      const project = toInstance(
        {
          _id: PROJECT_A_ID,
          pipeline: {
            name: "Empty",
            start: { nodes: [] },
            inputs: {},
            outputs: {},
            flows: {},
            nodes: {},
          },
          launchRequest: { inputs: {} },
        },
        Project,
      );

      expect(project.pipeline.nodes.size).toBe(0);
      expect(project.pipeline.inputs.size).toBe(0);
      expect(project.launchRequest.inputs.size).toBe(0);
      expect(project.launchRequest.nodes).toBeUndefined();
      expect(project.environment).toBeUndefined();
      expect(project.revision).toBeUndefined();
    });

    it("drops Map keys that collide with Map.prototype members", () => {
      // class-transformer skips such keys: a port named `size`, `get` or
      // `keys` silently disappears (follow-up in the testing plan).
      const plain = smallGraphPipeline() as {
        nodes: Record<string, { inputs: Record<string, unknown> }>;
      };
      plain.nodes["node_two"].inputs["size"] = {
        title: "Size",
        type: "integer",
      };

      const pipeline = toInstance(plain, Pipeline);

      expect(pipeline.nodes.get("node_two").inputs.has("size")).toBeFalse();
      expect(pipeline.nodes.get("node_two").inputs.has("count")).toBeTrue();
    });

    it("converts flow transformers into typed instances", () => {
      const pipeline = toInstance(smallGraphWithJsonTransformer(), Pipeline);

      const flow = pipeline.flows.get("two_to_three");

      expect(flow.transformer).toBeInstanceOf(FlowTransformer);
      expect(flow.transformer.type).toBe("json");
      expect(flow.transformer.path).toBe("data.answer");
    });
  });

  describe("launch request falsy values", () => {
    it("distinguishes absent, null, false, zero and empty string", () => {
      const plain = launchRequestPlain() as { inputs: Record<string, unknown> };
      plain.inputs["nothing"] = null;

      const request = toInstance(plain, LaunchRequest);
      const back = json(toPlain(request));

      expect(request.inputs.get("zero")).toBe(0);
      expect(request.inputs.get("off")).toBe(false);
      expect(request.inputs.get("empty")).toBe("");
      expect(request.inputs.get("nothing")).toBeNull();
      expect(request.inputs.has("absent")).toBeFalse();
      expect(back.inputs).toEqual({
        topic: "Cats",
        zero: 0,
        off: false,
        empty: "",
        nothing: null,
      });
    });

    it("keeps bucket and inclusive nodes", () => {
      const request = launchRequest();

      expect(request.options.bucket).toBe("outputs");
      expect(request.inclusive.nodes).toEqual(["node_one", "node_two"]);
      expect(request.nodes.get("node_one").inputs.get("temperature")).toBe(0);
    });
  });

  describe("fixture independence", () => {
    it("never shares nested objects between Project A and Project B", () => {
      const a = projectA();
      const b = projectB();

      a.pipeline.nodes.get("node_one").title = "mutated";
      a.pipeline.nodes.delete("node_two");
      a.launchRequest.inputs.set("topic", "Dogs");
      a.environment.variables.clear();

      expect(a._id).not.toBe(b._id);
      expect(a.revision).not.toBe(b.revision);
      expect(a.createdBy._id).not.toBe(b.createdBy._id);
      expect(b.pipeline.nodes.get("node_one").title).toBe("Generate text");
      expect(b.pipeline.nodes.has("node_two")).toBeTrue();
      expect(b.launchRequest.inputs.get("topic")).toBe("Cats");
      expect(b.environment.variables.size).toBe(2);
    });

    it("returns a fresh Project A on every call", () => {
      const first = projectA();
      first.pipeline.start.nodes.push("node_two");

      const second = projectA();

      expect(second.pipeline.start.nodes).toEqual(["node_one"]);
      expect(second.pipeline.nodes).not.toBe(first.pipeline.nodes);
    });
  });

  describe("patch sequence", () => {
    it("produces deltas that rebuild the edit from an independent old snapshot", () => {
      const project = projectA();
      const before = toPlain(project.pipeline);
      const baseline = cloneDeep(before);
      project.pipeline.nodes.get("node_one").arrange.x = 333;
      project.pipeline.start.nodes.push("node_two");

      const delta = diff(before, toPlain(project.pipeline));
      const rebuilt = patch(baseline, delta) as { nodes: object };

      expect(PATCH_PROJECT_URL(project._id, project.revision)).toBe(
        "/api/projects/project_aaaa/patch/rev_a_1",
      );
      expect(json(rebuilt)).toEqual(json(toPlain(project.pipeline)));
    });
  });

  describe("launch and events", () => {
    it("converts the launch with typed artefact data", () => {
      const converted = launch();

      const topic = converted.inputs.get("topic");

      expect(converted.launchedAt).toEqual(
        new Date("2026-03-01T12:00:00.000Z"),
      );
      expect(converted.pipeline.nodes.size).toBe(2);
      expect(topic.data).toBeInstanceOf(StringData);
      expect((topic.data as StringData).value).toBe("Cats");
    });

    it("maps node events to PipelineEvent without inventing an event field", () => {
      const event = toInstance(nodeEventPlain("node_two"), PipelineEvent);

      expect(event.launch).toBe("launch_one");
      expect(event.node).toBe("node_two");
      expect(event.event).toBeUndefined();
    });

    it("maps set_output to a typed JSON artefact", () => {
      const event = toInstance(
        setOutputEventPlain(),
        SetLaunchOutputEvent as new () => SetLaunchOutputEvent,
      );

      expect(event.id).toBe("result");
      expect(event.output).toBeInstanceOf(LaunchArtefact);
      expect(event.output.data).toBeInstanceOf(JsonData);
      expect((event.output.data as JsonData).value).toEqual({ answer: 42 });
    });

    it("maps float artefact data like the backend discriminator does", () => {
      const artefact = toInstance(
        {
          _id: "score",
          type: "float",
          data: { type: "float", value: 0.25 },
        },
        LaunchArtefact,
      );

      expect(artefact.data).toBeInstanceOf(FloatData);
      expect((artefact.data as FloatData).value).toBe(0.25);
    });
  });

  describe("authentication fixtures", () => {
    it("represents owner, engineer and admin roles as real users", () => {
      const roles = (["owner", "engineer", "admin"] as const).map(
        (kind) =>
          toInstance({ _id: kind, roles: kind === "owner" ? [] : [kind] }, User)
            .roles,
      );

      expect(roles).toEqual([[], [UserRole.engineer], [UserRole.admin]]);
    });
  });
});
