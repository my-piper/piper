import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([() => import("api/legacy-locales")]);
});

describe("links to a dropped locale", () => {
  it.each([
    { from: "/ru", to: "/en" },
    {
      from: "/ru/projects/project_a?tab=design",
      to: "/en/projects/project_a?tab=design",
    },
    { from: "/de/projects", to: "/en/projects" },
    { from: "/pt-br/launches", to: "/en/launches" },
    { from: "/zh-CN/projects", to: "/en/projects" },
  ])("redirects $from to $to", async ({ from, to }) => {
    const response = await context.request.get(from).redirects(0);

    expect(response.status).toBe(301);
    expect(response.headers["location"]).toBe(to);
  });

  it.each(["ru", "de"])(
    "forgets a remembered %s language",
    async (language) => {
      const response = await context.request
        .get("/de/projects")
        .set("Cookie", `language=${language}`)
        .redirects(0);

      expect(response.headers["set-cookie"]).toEqual([
        expect.stringMatching(/^language=; Path=\/; Expires=Thu, 01 Jan 1970/),
      ]);
    }
  );

  it("keeps a remembered English language", async () => {
    const response = await context.request
      .get("/de/projects")
      .set("Cookie", "language=en")
      .redirects(0);

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it.each(["/en/projects", "/russia", "/design"])(
    "leaves %s alone",
    async (path) => {
      const response = await context.request.get(path).redirects(0);

      expect(response.status).not.toBe(301);
    }
  );
});
