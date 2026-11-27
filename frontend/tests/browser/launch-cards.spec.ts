import { PIXEL } from "../fixtures/launch-results";
import { LAUNCH_ID, launchPlain, USER_IDS } from "../fixtures/plain";
import { expect, test } from "./support/test";

const IMAGE = {
  type: "image",
  format: "png",
  url: PIXEL,
  width: 640,
  height: 480,
};

test("lists launches as cards that preview their media and open the outputs", async ({
  page,
  open,
  api,
}) => {
  api.launches.set(LAUNCH_ID, {
    ...launchPlain(),
    outputs: {
      image: { _id: "image", title: "Image", type: "image", data: IMAGE },
    },
  });
  api.launches.set("launch_video", {
    ...launchPlain(),
    _id: "launch_video",
    outputs: {
      video: {
        _id: "video",
        title: "Video",
        type: "video",
        data: {
          type: "video",
          format: "mp4",
          url: `${PIXEL}#video`,
          poster: `${PIXEL}#poster`,
          width: 1280,
          height: 720,
        },
      },
    },
  });
  api.launches.set("launch_failed", {
    ...launchPlain(),
    _id: "launch_failed",
    outputs: {},
    errors: ["Boom"],
  });

  // Cards load previews through the image proxy (pipes/image-proxy).
  await page.route("**/xyz/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(PIXEL.split(",")[1], "base64"),
    }),
  );

  await open("/en/launches");

  const cards = page.getByTestId("launches-cards").locator(".card");
  await expect(cards).toHaveCount(3);
  await expect(page.locator("app-launches table")).toHaveCount(0);
  await expect(cards.getByTestId("launch-status")).toHaveText([
    "Failed",
    "Done",
    "Done",
  ]);
  await expect(cards.nth(0).getByTestId("no-outputs")).toHaveText("No outputs");
  await expect(cards.nth(1).getByTestId("video-badge")).toBeVisible();
  await expect(
    cards.nth(2).locator(".results[data-type=image] img"),
  ).toHaveCount(1);

  await cards.nth(2).getByRole("link", { name: "Image" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/en/launches/outputs/${LAUNCH_ID}\\?id=image&index=0$`),
  );
  await expect(
    page.locator(".modal app-launch-outputs[data-mode=full] .results img"),
  ).toHaveAttribute("src", IMAGE.url);
});

test("opens and deletes a launch from the buttons on its card", async ({
  page,
  open,
  api,
}) => {
  const owned = { launchedBy: { _id: USER_IDS.owner }, outputs: {} };
  api.launches.set(LAUNCH_ID, { ...launchPlain(), ...owned });
  api.launches.set("launch_two", {
    ...launchPlain(),
    ...owned,
    _id: "launch_two",
  });
  await open("/en/launches");
  const card = page.locator(`.card[data-launch=${LAUNCH_ID}]`);
  const dialog = page.getByRole("dialog");

  await card.getByTestId("launch-delete").click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await card.getByTestId("launch-delete").click();
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page.locator(".card")).toHaveCount(1);
  await expect(page.locator(".card[data-launch=launch_two]")).toBeVisible();
  await expect(
    page.locator(".card[data-launch=launch_two]").getByTestId("launch-open"),
  ).toHaveAttribute("href", "/en/launches/launch_two");
  expect(api.launches.has(LAUNCH_ID)).toBe(false);
});
