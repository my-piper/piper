import { BehaviorSubject, Subject } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { User, UserRole } from "src/models/user";
import { CanPipe } from "src/pipes/can";
import { InputFlowsPipe, OutputIndexPipe } from "src/pipes/node";
import { PipelineInputPipe } from "src/pipes/input";
import { MeManager } from "src/services/me.service";
import { ProjectManager } from "src/services/project.manager";
import { getPipelineEnvironment } from "src/utils/pipeline";
import { toInstance } from "src/utils/models";
import { smallGraph, user } from "../../fixtures/models";
import { smallGraphPipeline } from "../../fixtures/plain";

function meDouble(current: User | null) {
  const user$ = new BehaviorSubject<User | null>(current);
  const me = {
    user$,
    get user() {
      return user$.getValue();
    },
  };
  return me as unknown as MeManager & { user$: BehaviorSubject<User | null> };
}

function projectManagerDouble() {
  return { updates: new Subject<object | null>() } as unknown as ProjectManager;
}

describe("domain pipes", () => {
  describe("getPipelineEnvironment", () => {
    it("builds a required variables schema from every node environment", () => {
      const plain = smallGraphPipeline() as {
        nodes: Record<string, Record<string, unknown>>;
      };
      plain.nodes["node_one"]["environment"] = {
        OPENAI_KEY: {
          title: "OpenAI key",
          type: "string",
          description: "Get it **here**",
          scope: "user",
        },
      };
      plain.nodes["node_two"]["environment"] = {
        RETRIES: { title: "Retries", type: "integer", scope: "pipeline" },
      };

      const schema = getPipelineEnvironment(toInstance(plain, Pipeline));
      const { variables } = schema.properties;

      expect(variables.required).toEqual(["OPENAI_KEY", "RETRIES"]);
      expect(variables.properties["OPENAI_KEY"].type).toBe("string");
      expect(variables.properties["OPENAI_KEY"].description).toContain(
        "<strong>here</strong>",
      );
      expect(variables.properties["RETRIES"].description).toBeNull();
      expect(variables.additionalProperties).toBeFalse();
    });

    it("returns an empty variables schema when no node declares environment", () => {
      const schema = getPipelineEnvironment(smallGraph());

      expect(schema.properties.variables.required).toEqual([]);
      expect(schema.properties.variables.properties).toEqual({});
    });
  });

  describe("CanPipe", () => {
    const owner = () => user("owner");

    const cases: [string, User | null, boolean][] = [
      ["anonymous", null, false],
      ["owner", user("owner"), true],
      ["engineer", user("engineer"), true],
      ["admin", user("admin"), true],
      ["stranger", user("stranger"), false],
    ];

    for (const [name, current, expected] of cases) {
      it(`resolves engineer permission for ${name} on an owned resource`, () => {
        const pipe = new CanPipe(meDouble(current));

        const can = pipe.transform(
          UserRole.engineer,
          owner(),
        ) as BehaviorSubject<boolean>;

        expect(can.getValue()).toBe(expected);
      });
    }

    it("re-evaluates when the signed-in user changes", () => {
      const me = meDouble(null);
      const pipe = new CanPipe(me);
      const can = pipe.transform(
        UserRole.admin,
        owner(),
      ) as BehaviorSubject<boolean>;
      const before = can.getValue();

      me.user$.next(user("admin"));

      expect(before).toBeFalse();
      expect(can.getValue()).toBeTrue();
    });

    it("accepts repeated calls without an owner", () => {
      const pipe = new CanPipe(meDouble(user("admin")));
      pipe.transform(UserRole.admin);

      const can = pipe.transform(UserRole.admin) as BehaviorSubject<boolean>;

      expect(can.getValue()).toBeTrue();
    });
  });

  describe("flow lookup", () => {
    it("finds pipeline-input and node flows that feed one input", () => {
      const pipeline = smallGraph();
      const pipe = new InputFlowsPipe(projectManagerDouble());

      const prompt = pipe.transform(pipeline, "node_one", "prompt").getValue();
      const text = new InputFlowsPipe(projectManagerDouble())
        .transform(pipeline, "node_two", "text")
        .getValue();

      expect(prompt).toEqual([
        pipeline.inputs.get("topic").flows.get("topic_to_prompt"),
      ]);
      expect(text).toEqual([pipeline.flows.get("one_to_two")]);
    });

    it("recomputes flows when the project manager publishes an update", () => {
      const pipeline = smallGraph();
      const manager = projectManagerDouble();
      const flows = new InputFlowsPipe(manager).transform(
        pipeline,
        "node_two",
        "text",
      );

      pipeline.flows.delete("one_to_two");
      manager.updates.next(null);

      expect(flows.getValue()).toEqual([]);
    });

    it("indexes outputs in sorted key order", () => {
      const node = smallGraph().nodes.get("node_two");

      const index = new OutputIndexPipe().transform(node, "result");

      expect(index).toBe(1);
    });

    it("rejects unknown pipeline inputs explicitly", () => {
      const pipe = new PipelineInputPipe();

      expect(() => pipe.transform(smallGraph(), "missing")).toThrowError(
        "Input missing not found",
      );
    });
  });
});
