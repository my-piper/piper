import { LAUNCH_ID, launchPlain } from "../fixtures/plain";
import { expect, test } from "./support/test";

/** Height of Taiga's navigation header (3rem) above every framed page. */
const HEADER = 48;

test("keeps the launch canvas visible and fills the viewport below the header after resizing", async ({
  page,
  open,
  api,
}) => {
  api.launches.set(LAUNCH_ID, launchPlain());

  await open(`/en/launches/${LAUNCH_ID}`);

  const canvas = page.locator("app-edit-pipeline-visual > .nodes");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS("height", `${900 - HEADER}px`);
  await expect(page.getByTestId("node-node_one")).toBeInViewport();

  await page.setViewportSize({ width: 1024, height: 600 });

  await expect(canvas).toHaveCSS("height", `${600 - HEADER}px`);
  await expect(page.getByTestId("node-node_one")).toBeInViewport();
});
