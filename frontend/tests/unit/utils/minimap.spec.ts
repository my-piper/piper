import { ioBox, minimapFrame, toCanvas, toMap } from "src/utils/minimap";

describe("minimap geometry", () => {
  it("fits the bounds with a margin and centres them", () => {
    // 1000 × 300 plus 40 each side: 1080 × 380, width-bound at 220 px.
    const frame = minimapFrame([
      { x: 0, y: 0, w: 400, h: 100 },
      { x: 600, y: 200, w: 400, h: 100 },
    ]);

    const scale = 220 / 1080;
    expect(frame.scale).toBeCloseTo(scale, 6);
    expect(frame.x).toBeCloseTo(-40, 6);
    // 140 px fit 687 canvas px; 380 of them are content, centred.
    expect(frame.y).toBeCloseTo(-40 - (140 / scale - 380) / 2, 6);
  });

  it("maps boxes and points both ways", () => {
    const frame = { scale: 0.5, x: 100, y: 50 };

    const box = toMap({ x: 300, y: 150, w: 200, h: 80 }, frame);
    const point = toCanvas({ x: 100, y: 50 }, frame);

    expect(box).toEqual({ x: 100, y: 50, w: 100, h: 40 });
    expect(point).toEqual({ x: 300, y: 150 });
  });

  it("frames an empty canvas without dividing by zero", () => {
    const frame = minimapFrame([]);

    expect(Number.isFinite(frame.scale)).toBe(true);
  });

  it("anchors inputs by their right edge and outputs by their left", () => {
    const input = ioBox("input", { x: 100, y: 200 });
    const output = ioBox("output", { x: 100, y: 200 });

    expect(input).toEqual({ x: -120, y: 160, w: 220, h: 80 });
    expect(output).toEqual({ x: 100, y: 176, w: 100, h: 48 });
  });
});
