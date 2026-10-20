import { Page } from "@playwright/test";
import { Plain, PROJECT_A_ID } from "../fixtures/plain";
import { expect, expectSaved, test } from "./support/test";

// Monaco renders spaces as U+00A0; anchors keep nested lines from matching.
const topLevel = (text: string) =>
  new RegExp(
    `^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[ \u00a0]")}$`,
  );

/** Replaces one top-level Monaco line, found by its exact text, by typing. */
async function replaceLine(page: Page, current: string, text: string) {
  const lines = page.locator(".monaco-editor .view-lines").first();
  await lines.locator(".view-line", { hasText: topLevel(current) }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.type(text);
  await expect(
    lines.locator(".view-line", { hasText: topLevel(text) }),
  ).toHaveCount(1);
}

test("edits YAML in Monaco, rejects invalid input, then applies a valid edit", async ({
  page,
  open,
  api,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}/yaml`);
  await expect(
    page.locator(".monaco-editor .view-line", { hasText: "name: Small graph" }),
  ).toHaveCount(1);
  const save = page.getByRole("button", { name: "Save" });

  await replaceLine(page, "name: Small graph", "name: Broken: yaml");
  await save.click();
  await expect(page.locator("app-informer")).toContainText(
    "Nested mappings are not allowed",
  );
  await page
    .locator("app-informer")
    .getByRole("button", { name: "OK" })
    .click();
  await replaceLine(page, "name: Broken: yaml", "name: YAML graph");
  await replaceLine(page, "version: 1", "version: wrong");
  await save.click();
  await expect(page.locator("app-informer")).toContainText(
    "Pipeline schema invalid",
  );
  await page
    .locator("app-informer")
    .getByRole("button", { name: "OK" })
    .click();
  expect(api.callsTo("PATCH", /\/patch\//)).toEqual([]);

  await replaceLine(page, "version: wrong", "version: 1");
  await save.click();
  await expect(page.locator("app-informer")).toHaveCount(0);
  await page.getByRole("link", { name: "Canvas" }).click();

  await expect(page.getByTestId("node-node_one")).toBeVisible();
  await expect(page.getByTestId("node-node_two")).toBeVisible();
  await expectSaved(page);
  const pipeline = api.projects.get(PROJECT_A_ID)["pipeline"] as Plain;
  expect(pipeline["name"]).toBe("YAML graph");
  expect(pipeline["version"]).toBe(1);
  expect(Object.keys(pipeline["nodes"] as Plain)).toEqual([
    "node_one",
    "node_two",
  ]);
  await page.reload();
  await expect(page.locator("header .title input")).toHaveValue("YAML graph");
});
