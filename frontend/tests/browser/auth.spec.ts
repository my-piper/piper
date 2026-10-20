import { CREDENTIALS } from "./support/api";
import { expect, test } from "./support/test";

test.describe("authentication", () => {
  test.use({ signedInAs: null });

  test("redirects anonymous users from a protected route to login", async ({
    page,
    open,
    api,
  }) => {
    await open("/en/projects");

    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    expect(api.callsTo("GET", /^\/api\/projects$/)).toEqual([]);
  });

  test("keeps invalid credentials on the form without persisting them", async ({
    page,
    open,
    api,
    allowConsoleErrors,
  }) => {
    // HttpService logs every mapped HTTP error; the 400 is the scenario.
    allowConsoleErrors(/status of 400/, /Process HTTP error 400/);
    await open("/en/login");

    await page
      .getByPlaceholder("User name or email")
      .fill(CREDENTIALS.identity);
    await page.getByPlaceholder("Password").fill("wrong");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(
      page.getByText("Email or password is incorrect"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login$/);
    expect(api.callsTo("POST", /^\/api\/login$/)[0].body).toEqual({
      identity: CREDENTIALS.identity,
      password: "wrong",
    });
    expect(
      await page.evaluate(() => localStorage.getItem("authorization")),
    ).toBeNull();
  });

  test("signs in, lands on projects and keeps the session after reload", async ({
    page,
    open,
    api,
  }) => {
    await open("/en/login");

    await page
      .getByPlaceholder("User name or email")
      .fill(CREDENTIALS.identity);
    await page.getByPlaceholder("Password").fill(CREDENTIALS.password);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByText("Project A")).toBeVisible();
    await page.reload();

    await expect(page).toHaveURL(/\/en\/projects$/);
    await expect(page.getByText("Project A")).toBeVisible();
    // Every list request was authenticated (the fixture answers 400
    // "You aren't logged" without a valid user-token), before and after reload.
    const statuses = api
      .callsTo("GET", /^\/api\/projects$/)
      .map((c) => c.status);
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(new Set(statuses)).toEqual(new Set([200]));
  });
});
