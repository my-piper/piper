import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

// `.field-grid` (src/styles/layout.scss, #299) has no consumer yet, so the
// test mounts one into a real page, where the global styles are loaded.
async function mountFieldGrid(page: Page, width: number) {
  await page.evaluate((px) => {
    const grid = document.createElement("div");
    grid.className = "field-grid";
    grid.dataset["testid"] = "field-grid";
    grid.style.width = `${px}px`;
    grid.innerHTML = `
      <input data-testid="name" />
      <input data-testid="folder" />
      <textarea class="full" data-testid="description"></textarea>
    `;
    document.body.append(grid);
  }, width);
}

async function columnCount(page: Page) {
  return page
    .getByTestId("field-grid")
    .evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
}

test("lays fields out in two columns from 560px", async ({ page, open }) => {
  await open("/en/projects");

  await mountFieldGrid(page, 600);

  expect(await columnCount(page)).toBe(2);
  const name = await page.getByTestId("name").boundingBox();
  const folder = await page.getByTestId("folder").boundingBox();
  expect(folder!.y).toBe(name!.y);
  expect(folder!.x).toBeGreaterThan(name!.x);
  const description = await page.getByTestId("description").boundingBox();
  expect(description!.width).toBe(600);
});

test("stacks fields in one column below 560px", async ({ page, open }) => {
  await open("/en/projects");

  await mountFieldGrid(page, 500);

  expect(await columnCount(page)).toBe(1);
  const name = await page.getByTestId("name").boundingBox();
  const folder = await page.getByTestId("folder").boundingBox();
  expect(folder!.y).toBeGreaterThan(name!.y);
});
