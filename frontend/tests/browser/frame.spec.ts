import { expect, test } from "./support/test";

test("keeps the navigation aside on screen while a long page scrolls", async ({
  page,
  open,
}) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await open("/en/projects");
  await expect(page.getByTestId("aside-toggle")).toBeVisible();

  await page.mouse.wheel(0, 2000);

  await expect(page.getByTestId("aside-toggle")).toBeInViewport();
  await expect(page.getByRole("link", { name: "Pipelines" })).toBeInViewport();
});
