import { LAUNCH_ID, launchPlain } from "../fixtures/plain";
import { expect, test } from "./support/test";

test("lists all launches as a table with their state and opens one", async ({
  page,
  open,
  api,
}) => {
  api.launches.set(LAUNCH_ID, launchPlain());
  api.launches.set("launch_failed", {
    ...launchPlain(),
    _id: "launch_failed",
    errors: ["Boom"],
  });

  await open("/en/launches");

  const rows = page.getByTestId("launches-table").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(page.locator("app-launches .card")).toHaveCount(0);
  await expect(rows.getByTestId("launch-status")).toHaveText([
    "Failed",
    "Done",
  ]);

  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    rows.last().getByRole("link").click(),
  ]);
  await expect(tab).toHaveURL(new RegExp(`/en/launches/${LAUNCH_ID}$`));
});
