import { Locator, Page } from "@playwright/test";
import { Plain, PROJECT_A_ID } from "../fixtures/plain";
import { expect, expectSaved, test } from "./support/test";

type Graph = {
  layout: { zoom: number };
  nodes: Record<string, { arrange: { x: number; y: number } }>;
  flows: Record<string, Plain>;
};

function storedPipeline(api: { projects: Map<string, Plain> }): Graph {
  return api.projects.get(PROJECT_A_ID)["pipeline"] as unknown as Graph;
}

/** Drags a canvas node by its title, waiting for DragMoveDirective's move mode. */
async function dragNode(page: Page, node: Locator, dx: number, dy: number) {
  const title = await node.locator("h2").boundingBox();
  const [x, y] = [title.x + 20, title.y + title.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(node).toHaveAttribute("data-mode", "move");
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await expect(node).toHaveAttribute("data-mode", "default");
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2] as const;
}

test("adds, connects and moves nodes, edits an input and keeps it after reload", async ({
  page,
  open,
  api,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const nodeOne = page.getByTestId("node-node_one");
  const nodeTwo = page.getByTestId("node-node_two");
  await expect(nodeOne).toBeVisible();

  // Add: drag a catalog card from the drawer onto the canvas.
  await page.getByTestId("add-node").click();
  await page.getByRole("button", { name: /Text/ }).click();
  const card = page
    .locator(".card")
    .filter({ has: page.getByRole("heading", { name: "Uppercase" }) });
  const pane = await page.locator(".pane").boundingBox();
  const cardBox = await card.boundingBox();
  const grab = await card.locator("article").boundingBox();
  await page.mouse.move(grab.x + 5, grab.y + 5);
  await page.mouse.down();
  await page.mouse.move(pane.x + 700, pane.y + 400, { steps: 10 });
  await page.mouse.up();
  const added = page.locator('[data-testid^="node-uppercase_"]');
  await expect(added).toBeVisible();

  // Connect: node_one "Text" output → new node "Loud input".
  await page.mouse.move(
    ...(await center(nodeOne.getByTestId("output-port-text"))),
  );
  await page.mouse.down();
  const target = await center(added.getByTestId("input-port-text"));
  await page.mouse.move(target[0], target[1], { steps: 8 });
  await page.mouse.up();

  // Move: node_two by +100/+60 screen px at zoom 1.
  await dragNode(page, nodeTwo, 100, 60);

  // Edit: node_one temperature through the inputs drawer.
  await nodeOne.locator("h2").click();
  const temperature = page
    .locator(".drawler.right .input")
    .filter({ hasText: "Temperature" })
    .locator("input");
  await temperature.fill("0.8");
  await expectSaved(page);

  const saved = storedPipeline(api);
  const addedId = Object.keys(saved.nodes).find((k) =>
    k.startsWith("uppercase_"),
  );
  const flows = Object.values(saved.flows);
  expect(addedId).toBeDefined();
  // DragCloneDirective drops the clone's top-left corner, converted into
  // pane content coordinates (zoom 1).
  const drop = saved.nodes[addedId].arrange;
  expect(drop.x).toBeCloseTo(700 - (grab.x + 5 - cardBox.x), 0);
  expect(drop.y).toBeCloseTo(400 - (grab.y + 5 - cardBox.y), 0);
  expect(flows).toContainEqual({
    from: "node_one",
    output: "text",
    to: addedId,
    input: "text",
  });
  expect(saved.nodes["node_two"].arrange).toEqual({ x: 660, y: 100 });
  const request = api.projects.get(PROJECT_A_ID)["launchRequest"] as {
    nodes: Record<string, { inputs: Record<string, unknown> }>;
  };
  expect(request.nodes["node_one"].inputs["temperature"]).toBe(0.8);

  await page.reload();

  await expect(page.getByTestId(`node-${addedId}`)).toHaveCSS(
    "left",
    `${drop.x}px`,
  );
  await expect(nodeTwo).toHaveCSS("left", "660px");
  await expect(nodeTwo).toHaveCSS("top", "100px");
  // The inputs drawer is part of the URL, so it is restored by the reload.
  await expect(page).toHaveURL(/\(right:nodes\/node_one\)$/);
  await expect(temperature).toHaveValue("0.8");
});

test("drags a node by canvas distance while zoomed", async ({
  page,
  open,
  api,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const nodeTwo = page.getByTestId("node-node_two");
  await expect(nodeTwo).toBeVisible();

  // The toolbar zooms out by one step: 1 / 1.2 ≈ 0.833.
  await page.getByTestId("zoom-out").click();
  await expect(page.getByTestId("zoom-reset")).toHaveText("83%");
  await expect(page.locator(".pane")).toHaveCSS(
    "transform",
    "matrix(0.833, 0, 0, 0.833, 0, 0)",
  );
  await dragNode(page, nodeTwo, 100, 50);
  await expectSaved(page);

  const saved = storedPipeline(api);
  expect(saved.layout.zoom).toBe(0.833);
  // 100 × 50 screen px at zoom 0.833 is 120 × 60 canvas px from (560, 40).
  expect(saved.nodes["node_two"].arrange).toEqual({ x: 680, y: 100 });
});

test("pans by dragging the empty canvas and fits the pipeline", async ({
  page,
  open,
  api,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const nodeOne = page.getByTestId("node-node_one");
  await nodeOne.locator("h2").click();
  await expect(page).toHaveURL(/\(right:nodes\/node_one\)$/);
  const canvas = page.locator(".nodes");
  const box = await canvas.boundingBox();
  const [x, y] = [box.x + 300, box.y + box.height - 150];

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 200, y - 120, { steps: 8 });
  await page.mouse.up();
  await expectSaved(page);

  const scroll = await canvas.evaluate((e) => [e.scrollLeft, e.scrollTop]);
  expect(scroll).toEqual([200, 120]);
  expect(storedPipeline(api).layout).toEqual(
    expect.objectContaining({ left: 200, top: 120 }),
  );
  // The click that ends a pan does not close the open drawer.
  await expect(page).toHaveURL(/\(right:nodes\/node_one\)$/);

  await page.getByTestId("zoom-fit").click();
  await expect(nodeOne).toBeInViewport();
  await expect(page.getByTestId("node-node_two")).toBeInViewport();
});

test("selects nodes with a Shift marquee and toggles them with Shift + click", async ({
  page,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const nodeOne = page.getByTestId("node-node_one");
  const nodeTwo = page.getByTestId("node-node_two");
  await expect(nodeOne).toBeVisible();
  const [one, two] = [await nodeOne.boundingBox(), await nodeTwo.boundingBox()];
  const start = [
    Math.min(one.x, two.x) - 20,
    Math.min(one.y, two.y) - 20,
  ] as const;
  const end = [
    Math.max(one.x + one.width, two.x + two.width) + 20,
    Math.max(one.y + one.height, two.y + two.height) + 20,
  ] as const;

  await page.keyboard.down("Shift");
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(...end, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  await expect(nodeOne).toHaveClass(/picked/);
  await expect(nodeTwo).toHaveClass(/picked/);

  await nodeOne.locator("h2").click({ modifiers: ["Shift"] });

  await expect(nodeOne).not.toHaveClass(/picked/);
  await expect(nodeTwo).toHaveClass(/picked/);
});

test("picks pipeline outputs with nodes and moves them together", async ({
  page,
  open,
  api,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const nodeTwo = page.getByTestId("node-node_two");
  const output = page.locator(".output").filter({ hasText: "Result" });
  await expect(nodeTwo).toBeVisible();
  const [node, result] = [
    await nodeTwo.boundingBox(),
    await output.boundingBox(),
  ];

  await page.keyboard.down("Shift");
  await page.mouse.move(node.x - 20, result.y + 2);
  await page.mouse.down();
  await page.mouse.move(
    result.x + result.width + 20,
    node.y + node.height + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Shift");

  await expect(nodeTwo).toHaveClass(/picked/);
  await expect(output).toHaveClass(/picked/);

  await dragNode(page, nodeTwo, 100, 60);
  await expectSaved(page);

  const saved = storedPipeline(api) as Graph & {
    outputs: Record<string, { arrange: { x: number; y: number } }>;
  };
  expect(saved.nodes["node_two"].arrange).toEqual({ x: 660, y: 100 });
  expect(saved.outputs["result"].arrange).toEqual({ x: 1000, y: 100 });
});
