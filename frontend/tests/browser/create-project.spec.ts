import { expect, test } from "./support/test";

test("creates a project from the New project dialog and opens it", async ({
  page,
  api,
  open,
}) => {
  await open("/en/projects");

  await page.getByTestId("new-project").click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByTestId("project-title");
  await expect(title).toBeFocused();
  await expect(dialog.getByTestId("create-project")).toBeDisabled();
  await title.fill("  Fresh project ");
  await title.press("Enter");

  await expect(page).toHaveURL(/\/en\/projects\/project_new_\d+/);
  await expect(dialog).toBeHidden();
  const [created] = api.callsTo("POST", /^\/api\/projects$/);
  expect(created.body).toMatchObject({
    title: "Fresh project",
    pipeline: { name: "Fresh project" },
  });
  await expect(page.getByTestId("project-name")).toHaveValue("Fresh project");
});

test("refuses a title another project has and keeps the dialog open", async ({
  page,
  open,
  allowConsoleErrors,
}) => {
  allowConsoleErrors(/status of 409/, /Process HTTP error 409/);
  await open("/en/projects/new");
  const dialog = page.getByRole("dialog");
  const title = dialog.getByTestId("project-title");

  await title.fill("project a");
  await dialog.getByTestId("create-project").click();

  await expect(dialog.getByTestId("project-title-error")).toHaveText(
    "A project with this title already exists",
  );
  await expect(page).toHaveURL(/\/en\/projects\/new$/);

  await title.fill("Project A copy");

  await expect(dialog.getByTestId("project-title-error")).toBeHidden();
  await expect(dialog.getByTestId("create-project")).toBeEnabled();
});
