import { toInstance, toPlain } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { Pipeline } from "models/pipeline";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { overridesFromUserEnvironment } from "packages/environment/user-environment-migration";
import { pipelineFixture } from "../../fixtures/pipeline";
import { describe, expect, it } from "vitest";

function pipelineDeclaring(names: string[]) {
  const plain = pipelineFixture();
  Object.assign(plain.nodes.echo_node, {
    environment: Object.fromEntries(
      names.map((name) => [name, { type: "string" }])
    ),
  });
  return toInstance(plain, Pipeline);
}

function encrypted(plain: object) {
  const environment = toInstance(plain, Environment);
  encrypt(environment);
  return environment;
}

function decrypted(environment: Environment) {
  const copy = toInstance(toPlain(environment), Environment);
  decrypt(copy);
  return {
    variables: Object.fromEntries(copy.variables),
    visible: copy.visible,
    bindings: copy.bindings && Object.fromEntries(copy.bindings),
  };
}

describe("moving a User Environment onto a Project", () => {
  it("turns the User Variables a Project read into its own overrides", () => {
    const pipeline = pipelineDeclaring([
      "INHERITED",
      "BOUND",
      "OWN",
      "BOUND_TO_MISSING",
      "GLOBAL_ONLY",
    ]);
    const project = encrypted({
      variables: { OWN: "project value" },
      bindings: { BOUND: "WORK_TOKEN", BOUND_TO_MISSING: "GONE" },
    });
    const user = encrypted({
      variables: {
        INHERITED: "user value",
        WORK_TOKEN: "work token",
        OWN: "must not win over the project",
        UNUSED: "not read by this project",
      },
      visible: ["INHERITED"],
    });

    const { environment, used, unresolved } = overridesFromUserEnvironment(
      pipeline,
      project,
      user
    );

    expect(decrypted(environment)).toEqual({
      variables: {
        OWN: "project value",
        INHERITED: "user value",
        BOUND: "work token",
      },
      visible: ["INHERITED"],
      bindings: { BOUND_TO_MISSING: "GONE" },
    });
    expect([...used].sort()).toEqual(["INHERITED", "WORK_TOKEN"]);
    expect(unresolved).toEqual(["BOUND_TO_MISSING"]);
  });

  it("gives a Project without an environment the User Variables it reads", () => {
    const pipeline = pipelineDeclaring(["TOKEN"]);
    const user = encrypted({ variables: { TOKEN: "user token", RETRIES: 3 } });

    const { environment } = overridesFromUserEnvironment(
      pipeline,
      undefined,
      user
    );

    expect(decrypted(environment)).toEqual({
      variables: { TOKEN: "user token" },
      visible: [],
    });
  });
});
