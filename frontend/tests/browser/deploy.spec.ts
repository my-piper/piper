import { Page } from "@playwright/test";
import { PROJECT_A_ID } from "../fixtures/plain";
import { ApiFixture } from "./support/api";
import { expect, test } from "./support/test";

const deployRow = (page: Page, path: string) =>
  page.locator("table tbody tr", { hasText: path });

async function deploy(page: Page, api: ApiFixture, path: string) {
  await expect(page.locator('input[name="root[slug]"]')).toHaveValue(
    "project-a-v1",
  );
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(deployRow(page, path)).toBeVisible();
  return api.callsTo("POST", /\/deploy$/);
}

test("creates a deployment after a failed attempt and lists it", async ({
  page,
  open,
  api,
  allowConsoleErrors,
}) => {
  allowConsoleErrors(/status of 500/, /Process HTTP error 500/);
  api.override("POST", /\/api\/projects\/project_aaaa\/deploy$/, {
    status: 500,
    text: "SERVICE_OFFLINE|Our service temporarily unavailable",
  });
  await open(`/en/projects/${PROJECT_A_ID}/deploy`);
  await expect(page.locator('input[name="root[slug]"]')).toHaveValue(
    "project-a-v1",
  );

  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.locator("app-informer")).toContainText("SERVICE_OFFLINE");
  await page
    .locator("app-informer")
    .getByRole("button", { name: "OK" })
    .click();
  const posts = await deploy(page, api, "user_owner/project-a-v1");

  expect(posts.map((c) => [c.status, c.body])).toEqual([
    [500, { prefix: "user_owner", slug: "project-a-v1" }],
    [204, { prefix: "user_owner", slug: "project-a-v1" }],
  ]);
  expect(api.deploys.map((d) => d["_id"])).toEqual(["user_owner_project-a-v1"]);
});

test.describe("as admin", () => {
  test.use({ signedInAs: "admin" });

  test("deletes a deployment and refreshes the list", async ({
    page,
    open,
    api,
  }) => {
    await open(`/en/projects/${PROJECT_A_ID}/deploy`);
    await deploy(page, api, "user_admin/project-a-v1");

    await deployRow(page, "user_admin/project-a-v1")
      .getByRole("button")
      .click();

    await expect(deployRow(page, "user_admin/project-a-v1")).toHaveCount(0);
    expect(api.callsTo("DELETE", /^\/api\/deploys\//)).toEqual([
      expect.objectContaining({
        path: "/api/deploys/user_admin/project-a-v1",
        status: 204,
      }),
    ]);
    expect(api.deploys).toEqual([]);
  });
});

// Regression: the UI used to send DELETE /api/deploys/<prefix>_<slug>, which
// backend/api/deploys/remove-deploy.ts routes to admin-only /api/deploys/:slug.
test("lets the owner delete their own deployment", async ({
  page,
  open,
  api,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}/deploy`);
  await deploy(page, api, "user_owner/project-a-v1");

  await deployRow(page, "user_owner/project-a-v1").getByRole("button").click();

  await expect(deployRow(page, "user_owner/project-a-v1")).toHaveCount(0, {
    timeout: 5_000,
  });
});
