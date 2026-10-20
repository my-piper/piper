import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it, vi } from "vitest";

let scenario: ReturnType<typeof httpScenario>;

beforeEach(() => {
  scenario = httpScenario();
});

describe("launch balance checks across environment modes", () => {
  it.each([
    { billing: "no", mode: "production", remaining: 0, status: 200 },
    { billing: "yes", mode: "test", remaining: 0, status: 200 },
    { billing: "yes", mode: "development", remaining: 0, status: 200 },
    { billing: "yes", mode: "production", remaining: 10, status: 200 },
    { billing: "yes", mode: "production", remaining: 0, status: 400 },
    { billing: "yes", mode: "production", remaining: -1, status: 400 },
    { billing: "yes", mode: "production", remaining: undefined, status: 400 },
  ])(
    "BILLING_ACTIVE=$billing NODE_ENV=$mode remaining=$remaining returns $status",
    async ({ billing, mode, remaining, status }) => {
      vi.stubEnv("BILLING_ACTIVE", billing);
      vi.stubEnv("NODE_ENV", mode);
      scenario.users.get("owner-user").balance =
        remaining === undefined ? undefined : { remaining };
      const context = await createHttpApp([
        () => import("api/projects/launch-project"),
      ]);

      const response = await context.request
        .post("/api/projects/project-http/launch")
        .set("user-token", userToken())
        .send({})
        .timeout(2000);

      expect(response.status).toBe(status);
      if (status === 400) {
        expect(response.body.message).toBe("Please, charge you balance");
        expect(httpDoubles.projects.findOne).not.toHaveBeenCalled();
        expect(httpDoubles.launches.insertOne).not.toHaveBeenCalled();
        expect(httpDoubles.execute).not.toHaveBeenCalled();
      } else {
        expect(httpDoubles.launches.insertOne).toHaveBeenCalledOnce();
        expect(response.body.costs).toEqual(
          billing === "no" ? null : expect.objectContaining({ total: 1 })
        );
      }
    }
  );
});

describe("accrued balance tracking", () => {
  it.each([
    { billing: "yes", accrued: "0", status: 400 },
    { billing: "yes", accrued: "-1", status: 400 },
    { billing: "yes", accrued: "1", status: 200 },
    { billing: "no", accrued: "0", status: 400 },
  ])(
    "TRACK_BALANCE=yes BILLING_ACTIVE=$billing accrued=$accrued returns $status",
    async ({ billing, accrued, status }) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BILLING_ACTIVE", billing);
      vi.stubEnv("TRACK_BALANCE", "yes");
      vi.stubEnv("MIN_BALANCE_FOR_TRACK", "5");
      scenario.users.get("owner-user").balance.remaining = 1;
      httpDoubles.redis.evalSha.mockResolvedValue(accrued);
      const context = await createHttpApp([
        () => import("api/projects/launch-project"),
      ]);

      const response = await context.request
        .post("/api/projects/project-http/launch")
        .set("user-token", userToken())
        .send({})
        .timeout(2000);

      expect(response.status).toBe(status);
      expect(httpDoubles.redis.evalSha).toHaveBeenCalledExactlyOnceWith(
        "http-test-script",
        {
          keys: ["user:owner-user:projects:project-http:accrued-balance"],
          arguments: ["1", "1", "300"],
        }
      );
      if (status === 400) {
        expect(response.body.message).toBe("Please, top up your balance");
        expect(httpDoubles.launches.insertOne).not.toHaveBeenCalled();
        expect(httpDoubles.plans.rapid).not.toHaveBeenCalled();
      } else {
        expect(httpDoubles.launches.insertOne).toHaveBeenCalledOnce();
      }
    }
  );

  it("skips tracking when the balance exceeds the threshold", async () => {
    vi.stubEnv("BILLING_ACTIVE", "yes");
    vi.stubEnv("TRACK_BALANCE", "yes");
    vi.stubEnv("MIN_BALANCE_FOR_TRACK", "5");
    const context = await createHttpApp([
      () => import("api/projects/launch-project"),
    ]);

    const response = await context.request
      .post("/api/projects/project-http/launch")
      .set("user-token", userToken())
      .send({})
      .timeout(2000);

    expect(response.status).toBe(200);
    expect(httpDoubles.redis.evalSha).not.toHaveBeenCalled();
  });
});
