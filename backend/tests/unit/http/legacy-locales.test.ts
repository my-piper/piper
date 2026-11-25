import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([() => import("api/legacy-locales")]);
});

describe("Russian locale links", () => {
  it.each([
    { from: "/ru", to: "/en" },
    {
      from: "/ru/projects/project_a?tab=design",
      to: "/en/projects/project_a?tab=design",
    },
  ])("redirects $from to $to", async ({ from, to }) => {
    const response = await context.request.get(from).redirects(0);

    expect(response.status).toBe(301);
    expect(response.headers["location"]).toBe(to);
  });

  it("forgets a remembered Russian language", async () => {
    const response = await context.request
      .get("/ru/projects")
      .set("Cookie", "language=ru")
      .redirects(0);

    expect(response.headers["set-cookie"]).toEqual([
      expect.stringMatching(/^language=; Path=\/; Expires=Thu, 01 Jan 1970/),
    ]);
  });

  it("keeps another remembered language", async () => {
    const response = await context.request
      .get("/ru/projects")
      .set("Cookie", "language=de")
      .redirects(0);

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("leaves paths that only start with ru", async () => {
    const response = await context.request.get("/russia").redirects(0);

    expect(response.status).not.toBe(301);
  });
});
