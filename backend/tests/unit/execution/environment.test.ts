import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { GLOBAL_ENVIRONMENT_KEY, USER_ENVIRONMENT_KEY } from "consts/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import { getEnvironment } from "jobs/process-node/environment";
import { Environment } from "models/environment";
import { NodeEnvironment } from "models/node";
import { encrypt } from "packages/environment/crypt-environment";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(resetExecutionDoubles);

function encryptedEnvironment(variables: object) {
  const environment = toInstance({ variables }, Environment);
  encrypt(environment);
  return environment;
}

describe("node environment precedence and decryption", () => {
  it("uses user overrides for global values, isolates scopes, and preserves falsy values", async () => {
    const launch = launchFixture();
    const node = launch.pipeline.nodes.get("echo_node");
    node.environment = new Map(
      Object.entries({
        shared: toInstance({ scope: "global" }, NodeEnvironment),
        globalOnly: toInstance({ scope: "global" }, NodeEnvironment),
        userOnly: toInstance({ scope: "user" }, NodeEnvironment),
        pipelineOnly: toInstance({ scope: "pipeline" }, NodeEnvironment),
        missingUser: toInstance({ scope: "user" }, NodeEnvironment),
        enabled: toInstance({ scope: "global" }, NodeEnvironment),
        count: toInstance({ scope: "user" }, NodeEnvironment),
        text: toInstance({ scope: "pipeline" }, NodeEnvironment),
      })
    );
    const global = encryptedEnvironment({
      shared: "global",
      globalOnly: "global only",
      missingUser: "must not leak",
      enabled: true,
      undeclared: "secret",
    });
    const user = encryptedEnvironment({
      shared: "user",
      userOnly: "user only",
      pipelineOnly: "must not override pipeline",
      enabled: false,
      count: 0,
    });
    launch.environment = encryptedEnvironment({
      pipelineOnly: "pipeline only",
      text: "",
    });
    const userCiphertext = user.variables.get("shared");
    doubles.redis.get.mockImplementation(async (key) =>
      key === GLOBAL_ENVIRONMENT_KEY
        ? JSON.stringify(toPlain(global))
        : key === USER_ENVIRONMENT_KEY(launch.launchedBy._id)
          ? JSON.stringify(toPlain(user))
          : null
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    const environment = await getEnvironment({
      launch,
      node,
      launchedBy: launch.launchedBy,
    });

    expect(toPlain(environment)).toEqual({
      variables: {
        shared: "user",
        globalOnly: "global only",
        userOnly: "user only",
        pipelineOnly: "pipeline only",
        enabled: false,
        count: 0,
        text: "",
      },
      scope: {
        shared: "user",
        globalOnly: "global",
        userOnly: "user",
        pipelineOnly: "pipeline",
        enabled: "user",
        count: "user",
        text: "pipeline",
      },
    });
    expect(user.variables.get("shared")).toBe(userCiphertext);
    expect(launch.environment.variables.get("text")).not.toBe("");
  });

  it("returns an empty environment without storage reads when no variables are declared", async () => {
    const launch = launchFixture();

    const environment = await getEnvironment({
      launch,
      launchedBy: launch.launchedBy,
      node: launch.pipeline.nodes.get("echo_node"),
    });

    expect(toPlain(environment)).toEqual({ scope: {}, variables: {} });
    expect(doubles.redis.get).not.toHaveBeenCalled();
  });

  it("wraps corrupted ciphertext as a fatal decryption error", async () => {
    const launch = launchFixture();
    const node = launch.pipeline.nodes.get("echo_node");
    node.environment = new Map([
      ["key", toInstance({ scope: "pipeline" }, NodeEnvironment)],
    ]);
    launch.environment = toInstance(
      { variables: { key: "invalid ciphertext" } },
      Environment
    );

    await expect(
      getEnvironment({ launch, node, launchedBy: launch.launchedBy })
    ).rejects.toThrow(FatalError);
  });
});
