import { expect, test } from "./support/test";

test("direct-loads, reloads and navigates a German route within its locale", async ({
  page,
  open,
}) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") {
      scripts.push(new URL(r.url()).pathname);
    }
  });

  await open("/de/projects");
  await expect(page).toHaveURL(/\/de\/projects$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  await expect(page).toHaveURL(/\/de\/projects$/);
  await page.getByText("Project A").first().click();

  await expect(page).toHaveURL(/\/de\/projects\/project_aaaa$/);
  await expect(page.locator("header .title input")).toHaveValue("Small graph");
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => !s.startsWith("/de/"))).toEqual([]);
});
