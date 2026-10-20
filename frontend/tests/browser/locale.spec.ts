import { expect, test } from "./support/test";

test("direct-loads, reloads and navigates a Russian route within its locale", async ({
  page,
  open,
}) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") {
      scripts.push(new URL(r.url()).pathname);
    }
  });

  await open("/ru/projects");
  await expect(page).toHaveURL(/\/ru\/projects$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.reload();
  await expect(page).toHaveURL(/\/ru\/projects$/);
  await page.getByText("Project A").first().click();

  await expect(page).toHaveURL(/\/ru\/projects\/project-aaaa$/);
  await expect(page.locator("header .title input")).toHaveValue("Small graph");
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => !s.startsWith("/ru/"))).toEqual([]);
});
