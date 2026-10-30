import { expect, test } from "./support/test";

const LIGHT_BACKGROUND = "rgb(247, 247, 249)";
const DARK_BACKGROUND = "rgb(14, 14, 19)";

test("follows the system color scheme until a theme is picked", async ({
  page,
  open,
}) => {
  await page.emulateMedia({ colorScheme: "light" });

  await open("/en/projects");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_BACKGROUND,
  );
});

test("switches theme from the header and keeps it after reload", async ({
  page,
  open,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open("/en/projects");

  await page.locator("header button:has(app-icon[icon='theme'])").click();
  await page.locator(".switcher label").filter({ hasText: "Dark" }).click();
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    DARK_BACKGROUND,
  );
});

test.describe("auth pages", () => {
  test.use({ signedInAs: null });

  test("switches theme from the login page", async ({ page, open }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open("/en/login");

    await page
      .locator(".frame-actions button:has(app-icon[icon='theme'])")
      .click();
    await page.locator(".switcher label").filter({ hasText: "Light" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".frame")).toHaveCSS(
      "background-color",
      "rgb(236, 236, 240)",
    );
  });
});
