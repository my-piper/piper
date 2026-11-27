import { PROJECT_A_ID } from "../fixtures/plain";
import { expect, test } from "./support/test";

const SCRIPT = `/en/projects/${PROJECT_A_ID}/nodes/node_one/edit/script`;

// The node editor overlay (#354): a solid page over the canvas, closed by the
// button Taiga dialogs draw, with its content on one 16px gutter.

test("covers the canvas with a solid overlay", async ({ page, open }) => {
  await open(SCRIPT);
  const overlay = page.locator(".modal:not(.hidden)");
  await expect(overlay).toBeVisible();

  const style = await overlay.evaluate((element) => {
    const { backgroundColor, backdropFilter } = getComputedStyle(element);
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--tui-background-base)";
    document.body.appendChild(probe);
    const base = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { backgroundColor, backdropFilter, base };
  });

  expect(style.backgroundColor).toBe(style.base);
  expect(style.backdropFilter).toBe("none");
});

test("closes the node editor from the top-right close button and with Esc", async ({
  page,
  open,
}) => {
  await open(SCRIPT);
  const overlay = page.locator(".modal:not(.hidden)");
  const close = overlay.getByTestId("modal-close");
  await expect(close).toBeVisible();

  const [box, area] = await Promise.all([
    close.boundingBox(),
    overlay.boundingBox(),
  ]);

  expect(area.x + area.width - (box.x + box.width)).toBe(16);
  expect(box.y - area.y).toBe(16);
  await expect(close).toHaveAccessibleName("Close");
  await expect(overlay.locator("[tuiBadge]")).toHaveCount(0);

  await close.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A_ID}$`));

  await open(SCRIPT);
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A_ID}$`));
});

test("keeps the node editor on one 16px gutter", async ({ page, open }) => {
  await open(SCRIPT);
  const overlay = page.locator(".modal:not(.hidden)");
  const content = overlay.locator(":scope > .content");
  await expect(content).toBeVisible();

  const [area, inner, footer] = await Promise.all([
    overlay.boundingBox(),
    content.boundingBox(),
    content.locator("app-edit-node-script footer").boundingBox(),
  ]);

  expect(inner.x - area.x).toBe(16);
  expect(area.x + area.width - (inner.x + inner.width)).toBe(16);
  // nothing overflows, so no scrollbar takes width from the content
  expect(footer.x + footer.width).toBe(inner.x + inner.width);
});
