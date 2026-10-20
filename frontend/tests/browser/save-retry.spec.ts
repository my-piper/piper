import { Plain, PROJECT_A_ID } from "../fixtures/plain";
import { expect, test } from "./support/test";

test("shows a failed save, retries on navigation and persists in order", async ({
  page,
  open,
  api,
  allowConsoleErrors,
}) => {
  // The first PATCH fails like backend `handle()` does for unknown errors.
  allowConsoleErrors(/status of 500/, /Process HTTP error 500/);
  api.override("PATCH", /^\/api\/projects\/project_aaaa\/patch\//, {
    status: 500,
    text: "SERVICE_OFFLINE|Our service temporarily unavailable",
  });
  await open(`/en/projects/${PROJECT_A_ID}`);
  const title = page.locator("header .title input");
  await expect(title).toHaveValue("Small graph");

  await title.fill("Renamed graph");
  await expect(page.locator("header .status")).toHaveAttribute(
    "data-status",
    "error",
  );
  await expect(
    page.getByText("SERVICE_OFFLINE|Our service temporarily unavailable"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ok" }).click();
  await page.getByTestId("project-back").click();

  await expect(page).toHaveURL(/\/en\/projects$/);
  const patches = api.callsTo("PATCH", /\/patch\//);
  expect(patches.map((c) => [c.path, c.status])).toEqual([
    [`/api/projects/${PROJECT_A_ID}/patch/rev_a_1`, 500],
    [`/api/projects/${PROJECT_A_ID}/patch/rev_a_1`, 200],
  ]);
  const order = api.calls.map((c) => `${c.method} ${c.path}`);
  expect(
    order.lastIndexOf(`PATCH /api/projects/${PROJECT_A_ID}/patch/rev_a_1`),
  ).toBeLessThan(order.lastIndexOf("GET /api/projects"));
  const stored = api.projects.get(PROJECT_A_ID);
  expect((stored["pipeline"] as Plain)["name"]).toBe("Renamed graph");

  await open(`/en/projects/${PROJECT_A_ID}`);
  await expect(title).toHaveValue("Renamed graph");
});
