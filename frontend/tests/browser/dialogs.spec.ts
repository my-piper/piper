import type { Locator, Page } from "@playwright/test";
import { Plain, PROJECT_A_ID } from "../fixtures/plain";
import { expect, test } from "./support/test";

// Dialog content layout (src/styles/dialogs.scss, docs/design.md#dialogs,
// #347) needs the global styles, so it is checked in the real build.

/** The left and right edges of everything that must stay inside the dialog. */
async function horizontalEdges(dialog: Locator, selector: string) {
  const box = (await dialog.boundingBox())!;
  const children = await dialog
    .locator(selector)
    .evaluateAll((elements) =>
      elements.map((e) => e.getBoundingClientRect().toJSON() as DOMRect),
    );
  return { box, children };
}

async function expectInside(page: Page, selector: string) {
  const dialog = page.locator("tui-dialog");
  await expect(dialog.locator(selector).first()).toBeVisible();

  const { box, children } = await horizontalEdges(dialog, selector);

  expect(children.length).toBeGreaterThan(0);
  for (const child of children) {
    expect(child.left).toBeGreaterThanOrEqual(box.x);
    expect(child.right).toBeLessThanOrEqual(box.x + box.width);
  }
}

test.describe("import package dialog", () => {
  test.use({ signedInAs: "admin" });

  test.beforeEach(({ api }) => {
    // backend/api/node-packages: the list and the update state
    api.on("GET", "/api/node-packages", () => ({ status: 200, json: [] }));
    api.on("GET", "/api/node-packages/updates/state", () => ({
      status: 200,
      json: { status: null, updates: [] },
    }));
  });

  test("names the dialog after the page and keeps its content inside", async ({
    page,
    open,
  }) => {
    await open("/en/packages/import");

    const dialog = page.locator("tui-dialog");
    await expect(dialog.locator("header")).toHaveText("Import package");
    await expect(dialog.locator("h1")).toHaveCount(0);
    await expectInside(page, ".editor, footer button, .archive button");
    const buttons = dialog.locator("footer button");
    await expect(buttons).toHaveText(["Cancel", "Import"]);
  });

  test("leaves no gap under the header and none between sections", async ({
    page,
    open,
  }) => {
    await open("/en/packages/import");

    const dialog = page.locator("tui-dialog");
    const header = (await dialog.locator("header").boundingBox())!;
    const archive = (await dialog.locator(".archive").boundingBox())!;
    const choose = (await dialog.locator(".archive button").boundingBox())!;
    const yamlTitle = (await dialog.locator("form h2").boundingBox())!;
    // the content is padded by space-4 only
    expect(archive.y - (header.y + header.height)).toBeLessThanOrEqual(16);
    expect(yamlTitle.y).toBeGreaterThan(choose.y + choose.height);
  });

  test("closes on Cancel", async ({ page, open }) => {
    await open("/en/packages/import");

    await page
      .locator("tui-dialog footer button", { hasText: "Cancel" })
      .click();

    await expect(page).toHaveURL(/\/en\/packages$/);
  });
});

test("keeps the import project dialog's editor and actions inside", async ({
  page,
  open,
}) => {
  await open("/en/projects/import");

  await expect(page.locator("tui-dialog header")).toHaveText(
    "Import a Pipeline (YAML or URL)",
  );
  await expectInside(page, ".editor, footer button");
});

test("fits the image picker inside its dialog", async ({ api, page, open }) => {
  const pipeline = api.projects.get(PROJECT_A_ID)["pipeline"] as Plain;
  pipeline["inputs"] = {
    ...(pipeline["inputs"] as Plain),
    picture: {
      order: 2,
      title: "Picture",
      type: "image",
      arrange: { x: 400, y: 240 },
      flows: {},
    },
  };
  // backend/api/artefacts/list.ts: the picker's first tab
  api.on("GET", "/api/artefacts", () => ({ status: 200, json: [] }));
  await open(`/en/projects/${PROJECT_A_ID}`);

  await page
    .locator("app-pipeline-input")
    .filter({ hasText: "Picture" })
    .locator(".container")
    .click();

  await expect(page.locator("tui-dialog header")).toHaveText("Select image");
  await expectInside(page, ".select-asset, .select-asset tui-textfield");
});
