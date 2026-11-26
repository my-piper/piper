import { LAUNCH_ID, launchPlain } from "../fixtures/plain";
import { launchLogsPlain } from "../fixtures/launch-results";
import { expect, test } from "./support/test";

test("shows the logs of the whole launch and of one node on the launch page", async ({
  page,
  open,
  api,
}) => {
  api.launches.set(LAUNCH_ID, launchPlain());
  api.launchLogs.set(LAUNCH_ID, launchLogsPlain());
  await open(`/en/launches/${LAUNCH_ID}`);

  await page.getByTestId("launch-logs").click();

  const panel = page.locator("app-launch-logs");
  await expect(panel.locator("h2")).toHaveText("Launch logs");
  await expect(panel.locator(".line pre")).toHaveText([
    "started",
    "parsed",
    "failed",
  ]);
  await expect(panel.getByTestId("logs-dropped")).toHaveText(
    "5 earlier lines of Make JSON dropped",
  );

  await panel.getByRole("button", { name: "debug" }).click();

  await expect(panel.locator(".line pre")).toHaveText(["started", "failed"]);

  await page.getByTestId("node-node_one").click();
  await page
    .locator("app-node-in-launch")
    .getByRole("link", { name: "Logs" })
    .click();

  const nodeLogs = page.locator("app-node-in-launch app-launch-logs");
  await expect(nodeLogs.locator("h2")).toHaveText("Logs of Generate text");
  await expect(nodeLogs.locator(".line pre")).toHaveText(["started", "failed"]);
});
