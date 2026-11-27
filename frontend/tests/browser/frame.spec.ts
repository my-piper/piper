import { expect, test } from "./support/test";

test("keeps the sidebar and top bar on screen while a long page scrolls", async ({
  page,
  open,
}) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await open("/en/projects");
  await expect(page.getByTestId("theme-menu")).toBeVisible();

  await page.mouse.wheel(0, 2000);

  await expect(page.getByTestId("theme-menu")).toBeInViewport();
  await expect(page.getByRole("link", { name: "Pipelines" })).toBeInViewport();
  await expect(page.getByTestId("app-topbar")).toBeInViewport();
});

test("names a sidebar section in a hint and goes there on click", async ({
  page,
  open,
}) => {
  await open("/en/projects");

  await page.getByTestId("nav-launches").hover();
  await expect(page.locator("tui-hint")).toHaveText("Launches");
  await page.getByTestId("nav-launches").click();

  await expect(page).toHaveURL(/\/en\/launches$/);
  await expect(page.getByTestId("app-crumbs")).toContainText("Launches");
  await expect(page.getByTestId("nav-launches")).toHaveClass(/active/);
});
