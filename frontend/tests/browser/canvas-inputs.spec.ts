import { Locator } from "@playwright/test";
import { Plain, PROJECT_A_ID } from "../fixtures/plain";
import { expect, test } from "./support/test";

/** Single-line fields on canvas input nodes, from pipeline-input.component.scss. */
const FIELD_MIN_WIDTH = 200;
const FIELD_MAX_WIDTH = 300;
const VERY_LONG = "Cinematic ".repeat(20).trim();

function stringInput(order: number, title: string, options: Plain): Plain {
  return {
    order,
    title,
    type: "string",
    arrange: { x: 400, y: 120 * order },
    flows: {},
    ...options,
  };
}

/**
 * The width of the text a field's control shows, against the room its
 * padding leaves for it, in the control's own font.
 */
async function textFits(control: Locator, text: string) {
  return control.evaluate((element: HTMLElement, value) => {
    const style = getComputedStyle(element);
    const context = document.createElement("canvas").getContext("2d");
    context.font = style.font;
    const room =
      element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    return { text: context.measureText(value).width, room };
  }, text);
}

async function width(locator: Locator) {
  return (await locator.boundingBox()).width;
}

test.beforeEach(async ({ api }) => {
  const pipeline = api.projects.get(PROJECT_A_ID)["pipeline"] as Plain;
  pipeline["inputs"] = {
    ...(pipeline["inputs"] as Plain),
    endpoint: stringInput(2, "Endpoint", { default: "image-to-video" }),
    enhance: stringInput(3, "Enhance prompt", {
      enum: ["muleroute", "none"],
      default: "muleroute",
    }),
    style: stringInput(4, "Style", { enum: ["none", VERY_LONG] }),
    steps: {
      order: 5,
      title: "Steps",
      type: "integer",
      default: 30,
      arrange: { x: 400, y: 600 },
      flows: {},
    },
  };
});

test("fits single-line canvas inputs to their values", async ({
  page,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const node = (title: string) =>
    page.locator("app-pipeline-input").filter({ hasText: title });
  const endpoint = node("Endpoint");
  const enhance = node("Enhance prompt");
  const style = node("Style");
  const steps = node("Steps");
  await expect(endpoint).toBeVisible();

  const fields = [endpoint, enhance, style, steps].map((n) =>
    n.locator("tui-textfield"),
  );
  const fieldWidths = await Promise.all(fields.map(width));
  const endpointText = await textFits(
    endpoint.locator("input"),
    "image-to-video",
  );
  const enhanceText = await textFits(enhance.locator("select"), "muleroute");

  for (const w of fieldWidths) {
    expect(w).toBeGreaterThanOrEqual(FIELD_MIN_WIDTH);
    expect(w).toBeLessThanOrEqual(FIELD_MAX_WIDTH);
  }
  expect(endpointText.text).toBeLessThanOrEqual(endpointText.room);
  expect(enhanceText.text).toBeLessThanOrEqual(enhanceText.room);
});

test("shows the full label of a selected option wider than the field", async ({
  page,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const style = page.locator("app-pipeline-input").filter({ hasText: "Style" });
  const select = style.locator("select");

  await select.selectOption(VERY_LONG);

  await expect(select).toHaveAttribute("title", VERY_LONG);
  expect(await width(style.locator("tui-textfield"))).toBeLessThanOrEqual(
    FIELD_MAX_WIDTH,
  );
});

test("shows the clear button of a canvas text input only on hover", async ({
  page,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}`);
  const endpoint = page
    .locator("app-pipeline-input")
    .filter({ hasText: "Endpoint" });
  const clear = endpoint.getByRole("button", { name: "Clear" });
  await expect(endpoint).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(clear).toBeHidden();
  await endpoint.locator("tui-textfield").hover();
  await expect(clear).toBeVisible();
});
