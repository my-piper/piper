import { expect, Page, test as base } from "@playwright/test";
import { authorizationPlain, UserKind } from "../../fixtures/plain";
import {
  PlainAppConfig,
  testRuntimeConfig,
} from "../../fixtures/runtime-config";
import { ApiFixture } from "./api";
import { FixtureServer } from "./server";

type TestOptions = {
  /** Seed this user's authorization before the app boots; null = anonymous. */
  signedInAs: UserKind | null;
  runtimeConfig: PlainAppConfig;
};

type TestFixtures = {
  api: ApiFixture;
  /** Navigates relative to the fixture origin, e.g. `/en/projects`. */
  open: (path: string) => Promise<void>;
  /** Console errors matching these patterns are tolerated in this test. */
  allowConsoleErrors: (...patterns: RegExp[]) => void;
};

type WorkerFixtures = { server: FixtureServer };

const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

export const test = base.extend<TestOptions & TestFixtures, WorkerFixtures>({
  signedInAs: ["owner", { option: true }],
  runtimeConfig: [testRuntimeConfig(), { option: true }],

  server: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const server = new FixtureServer();
      await server.start();
      await use(server);
      await server.stop();
    },
    { scope: "worker" },
  ],

  api: async ({ context, server, signedInAs, runtimeConfig }, use) => {
    server.reset(runtimeConfig);
    const api = new ApiFixture();
    const external: string[] = [];

    // Registered first so the /api route below takes precedence.
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(server.url + "/")) {
        return route.continue();
      }
      if (FONT_HOSTS.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: "text/css",
          body: "",
        });
      }
      external.push(url);
      return route.abort("blockedbyclient");
    });
    await api.attach(context);

    if (signedInAs) {
      const authorization = authorizationPlain(signedInAs);
      // Seeds once per tab: reloads keep whatever state the test produced.
      await context.addInitScript((auth) => {
        if (!sessionStorage.getItem("__fixture_seeded")) {
          sessionStorage.setItem("__fixture_seeded", "1");
          localStorage.setItem("authorization", JSON.stringify(auth));
          localStorage.setItem("user", JSON.stringify(auth["user"]));
        }
      }, authorization);
    }

    await use(api);

    expect(api.unhandled, "API requests without a fixture handler").toEqual([]);
    expect(external, "Unexpected external requests").toEqual([]);
  },

  allowConsoleErrors: async ({ page }, use) => {
    const allowed: RegExp[] = [];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") {
        errors.push(m.text());
      }
    });

    await use((...patterns) => allowed.push(...patterns));

    const unexpected = errors.filter((e) => !allowed.some((p) => p.test(e)));
    expect(unexpected, "Unexpected browser errors").toEqual([]);
  },

  open: async ({ page, server, api, allowConsoleErrors }, use) => {
    void api;
    void allowConsoleErrors;
    await use(async (path) => {
      await page.goto(server.url + path);
    });
  },
});

export { expect };

/** Waits until ProjectManager reports `saved` in the project header. */
export async function expectSaved(page: Page) {
  await expect(page.locator("header .status")).toHaveAttribute(
    "data-status",
    "saved",
  );
}
