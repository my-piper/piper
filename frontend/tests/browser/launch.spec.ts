import { Page } from "@playwright/test";
import {
  nodeEventPlain,
  Plain,
  PROJECT_A_ID,
  setErrorsEventPlain,
  setOutputEventPlain,
  USER_IDS,
} from "../fixtures/plain";
import { FixtureServer } from "./support/server";
import { expect, test } from "./support/test";

/** Waits until the app has joined a Socket.IO room on the fixture peer. */
async function joined(server: FixtureServer, room: string) {
  await expect
    .poll(() =>
      server.roomEvents.some((e) => e.type === "join" && e.room === room),
    )
    .toBe(true);
}

async function openPlayground(
  page: Page,
  open: (path: string) => Promise<void>,
) {
  // First visit shows the README (ShouldCheckReadmeGuard), then launches.
  await open("/en/play/project-aaaa");
  await expect(page).toHaveURL(/\/en\/play\/project-aaaa\/readme$/);
  await page
    .locator("app-play-with-project")
    .getByRole("link", { name: "Launches" })
    .click();
  await expect(page).toHaveURL(/\/en\/play\/project-aaaa$/);
}

test("runs the playground, shows scoped live results and launch failures", async ({
  page,
  open,
  api,
  server,
  allowConsoleErrors,
}) => {
  allowConsoleErrors(/status of 400/, /Process HTTP error 400/);
  await openPlayground(page, open);
  await joined(server, USER_IDS.owner);
  const topic = page.locator(".inputs").getByRole("textbox").first();
  await expect(topic).toHaveValue("Cats");

  await topic.fill("Dogs");
  await page.getByRole("button", { name: "Run" }).click();
  const card = page.locator("app-launches .card").first();
  await expect(card).toBeVisible();
  const [launch] = api.callsTo(
    "POST",
    /\/api\/projects\/project_aaaa\/launch$/,
  );
  const launchId = [...api.launches.keys()][0];
  // An event for another launch must not touch this card.
  server.emit(USER_IDS.owner, "set_output", {
    ...setOutputEventPlain("launch_other"),
    output: { type: "json", data: { type: "json", value: { answer: 7 } } },
  });
  server.emit(USER_IDS.owner, "set_output", setOutputEventPlain(launchId));
  server.emit(USER_IDS.owner, "set_errors", setErrorsEventPlain(launchId));

  expect((launch.body as Plain)["inputs"]).toEqual(
    expect.objectContaining({ topic: "Dogs" }),
  );
  expect((launch.body as Plain)["options"]).toEqual({ bucket: "artefacts" });
  await expect(card.locator("pre")).toContainText('"answer": 42');
  await expect(card.locator("pre")).not.toContainText('"answer": 7');
  await expect(card.locator(".errors")).toBeVisible();

  api.override("POST", /\/api\/projects\/project_aaaa\/launch$/, {
    status: 400,
    text: "Please, top up your balance",
  });
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Please, top up your balance")).toBeVisible();
  await expect(page.locator("app-launches .card")).toHaveCount(1);
});

test("runs from the canvas, follows node events and interrupts", async ({
  page,
  open,
  api,
  server,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const run = page.getByTestId("run-pipeline");
  await expect(page.getByTestId("node-node_one")).toBeVisible();

  await run.click();
  await expect(page).toHaveURL(/;launch=launch_1$/);
  await joined(server, "launch_1");
  api.nodeStatus.set("launch_1/node_one", { state: "error", error: "Boom" });
  server.emit("launch_1", "node_error", nodeEventPlain("node_one", "launch_1"));
  server.emit("launch_1", "node_error", nodeEventPlain("node_two", "launch_x"));
  await expect(
    page.getByTestId("node-node_one").locator("app-node > div.error"),
  ).toBeVisible();
  await expect(
    page.getByTestId("node-node_two").locator("app-node > div.error"),
  ).toHaveCount(0);
  await run.click();

  await expect(page).not.toHaveURL(/launch=/);
  expect(api.interrupted).toEqual(["launch_1"]);
  expect(api.callsTo("POST", /\/launch$/).map((c) => c.body)).toEqual([
    { options: { bucket: "outputs" } },
  ]);
});
