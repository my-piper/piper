import { PROJECT_A_ID } from "../fixtures/plain";
import { expect, test } from "./support/test";

test("marks the project section of the current route as the active tab", async ({
  page,
  open,
}) => {
  const sections = page.getByTestId("project-sections");
  const tab = (name: string) => sections.getByRole("link", { name });

  await open(`/en/projects/${PROJECT_A_ID}/yaml`);

  await expect(tab("YAML")).toHaveClass(/_active/);
  await expect(tab("Canvas")).not.toHaveClass(/_active/);

  await tab("Canvas").click();

  await expect(page.getByTestId("node-node_one")).toBeVisible();
  await expect(tab("Canvas")).toHaveClass(/_active/);
  await expect(tab("YAML")).not.toHaveClass(/_active/);
});

test("starts on the canvas tab when a project opens", async ({
  page,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);

  const sections = page.getByTestId("project-sections");
  await expect(page.getByTestId("node-node_one")).toBeVisible();
  await expect(sections.getByRole("link", { name: "Canvas" })).toHaveClass(
    /_active/,
  );
  await expect(sections.locator("._active")).toHaveCount(1);
});

test("returns to the canvas tab when Back reopens the canvas with a node drawer", async ({
  page,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}/(right:nodes/node_one)`);
  const sections = page.getByTestId("project-sections");
  await expect(page.getByTestId("node-node_one")).toBeVisible();
  await sections.getByRole("link", { name: "Design" }).click();
  await expect(page).toHaveURL(/\/design/);

  await page.goBack();

  await expect(page.getByTestId("node-node_one")).toBeVisible();
  await expect(sections.getByRole("link", { name: "Canvas" })).toHaveClass(
    /_active/,
  );
  await expect(sections.locator("._active")).toHaveCount(1);
});

test("scrolls a project page taller than the viewport", async ({
  page,
  open,
}) => {
  await page.setViewportSize({ width: 1024, height: 260 });
  await open(`/en/projects/${PROJECT_A_ID}/yaml`);
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeAttached();

  await save.scrollIntoViewIfNeeded();

  await expect(save).toBeInViewport();
});
