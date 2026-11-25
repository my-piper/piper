import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import { getEnvironment } from "jobs/process-node/environment";
import { Environment } from "models/environment";
import { NodeEnvironment } from "models/node";
import { Project } from "models/project";
import { encrypt } from "packages/environment/crypt-environment";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(resetExecutionDoubles);

function encryptedEnvironment(variables: object) {
  const environment = toInstance({ variables }, Environment);
  encrypt(environment);
  return environment;
}

describe("node environment precedence and decryption", () => {
  function declare(launch: ReturnType<typeof launchFixture>, names: string[]) {
    const node = launch.pipeline.nodes.get("echo_node");
    node.environment = new Map(
      names.map((name) => [name, toInstance({}, NodeEnvironment)])
    );
    return node;
  }

  function storeGlobal(variables: object) {
    const global = encryptedEnvironment(variables);
    doubles.redis.get.mockImplementation(async (key) =>
      key === GLOBAL_ENVIRONMENT_KEY ? JSON.stringify(toPlain(global)) : null
    );
  }

  it("reads each variable from the project's override, else the global variable of the same name", async () => {
    const launch = launchFixture();
    const node = declare(launch, [
      "shared",
      "globalOnly",
      "overridden",
      "enabled",
      "count",
      "text",
      "missing",
    ]);
    storeGlobal({
      shared: "global",
      globalOnly: "global only",
      overridden: "global must not win",
      enabled: true,
      undeclared: "secret",
    });
    launch.environment = encryptedEnvironment({
      overridden: "project",
      enabled: false,
      count: 0,
      text: "",
    });

    const environment = await getEnvironment({ launch, node });

    expect(toPlain(environment)).toEqual({
      variables: {
        shared: "global",
        globalOnly: "global only",
        overridden: "project",
        enabled: false,
        count: 0,
        text: "",
      },
      scope: {
        shared: "global",
        globalOnly: "global",
        overridden: "pipeline",
        enabled: "pipeline",
        count: "pipeline",
        text: "pipeline",
      },
    });
    expect(launch.environment.variables.get("text")).not.toBe("");
  });

  it("reads a bound variable from the global variable it names, for whoever launches it", async () => {
    const launch = launchFixture();
    launch.project = toInstance(
      { _id: "project", createdBy: { _id: "owner" } },
      Project
    );
    const node = declare(launch, ["token", "missing"]);
    storeGlobal({
      token: "same-name token",
      work_token: "bound token",
      missing: "same-name must not be used",
    });
    launch.environment = toInstance(
      { variables: {}, bindings: { token: "work_token", missing: "gone" } },
      Environment
    );

    const environment = await getEnvironment({ launch, node });

    expect(toPlain(environment)).toEqual({
      variables: { token: "bound token" },
      scope: { token: "global" },
    });
  });

  it("reads global variables when the launch has no environment", async () => {
    const launch = launchFixture();
    const node = declare(launch, ["token"]);
    launch.environment = undefined;
    storeGlobal({ token: "global token" });

    const environment = await getEnvironment({ launch, node });

    expect(toPlain(environment)).toEqual({
      variables: { token: "global token" },
      scope: { token: "global" },
    });
  });

  it("returns an empty environment without storage reads when no variables are declared", async () => {
    const launch = launchFixture();

    const environment = await getEnvironment({
      launch,
      node: launch.pipeline.nodes.get("echo_node"),
    });

    expect(toPlain(environment)).toEqual({ scope: {}, variables: {} });
    expect(doubles.redis.get).not.toHaveBeenCalled();
  });

  it("wraps corrupted ciphertext as a fatal decryption error", async () => {
    const launch = launchFixture();
    const node = launch.pipeline.nodes.get("echo_node");
    node.environment = new Map([["key", toInstance({}, NodeEnvironment)]]);
    launch.environment = toInstance(
      { variables: { key: "invalid ciphertext" } },
      Environment
    );

    await expect(getEnvironment({ launch, node })).rejects.toThrow(FatalError);
  });
});
