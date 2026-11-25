import { PROJECT_A_ID } from "../fixtures/plain";
import { expect, expectSaved, test } from "./support/test";

test("blocks a pipeline launch without a start node and runs after Auto start is enabled", async ({
  page,
  open,
  api,
}) => {
  const project = api.projects.get(PROJECT_A_ID);
  const pipeline = project["pipeline"] as { start: { nodes: string[] } };
  pipeline.start.nodes = [];
  await open(`/en/projects/${PROJECT_A_ID}`);

  await page.getByTestId("run-pipeline").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No start node selected");
  await expect(dialog).toContainText(
    "Enable Auto start for at least one node before launching.",
  );
  expect(api.callsTo("POST", /\/launch$/)).toHaveLength(0);
  await expect(page.getByTestId("run-pipeline")).not.toHaveClass(/busy/);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByTestId("node-node_one").locator("h2").click();
  await page.locator('input[formControlName="start"]').check();
  await expectSaved(page);
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByTestId("run-pipeline").click(),
  ]);

  await expect(tab).toHaveURL(/\/en\/launches\/launch_1$/);
  expect(api.callsTo("POST", /\/launch$/)).toHaveLength(1);
});

test("runs an individual node without selecting a pipeline start node", async ({
  page,
  open,
  api,
}) => {
  const project = api.projects.get(PROJECT_A_ID);
  const pipeline = project["pipeline"] as { start: { nodes: string[] } };
  pipeline.start.nodes = [];
  await open(`/en/projects/${PROJECT_A_ID}`);

  await page
    .getByTestId("node-node_one")
    .locator(":scope > .actions > button")
    .click();

  await expect(page).toHaveURL(/node_one:launch_1/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(api.callsTo("POST", /\/launch$/).map((call) => call.body)).toEqual([
    { options: { bucket: "outputs" }, inclusive: { nodes: ["node_one"] } },
  ]);
});
