import { TestBed } from "@angular/core/testing";
import { CanvasMinimapComponent } from "src/app/canvas-minimap/canvas-minimap.component";
import { Pipeline } from "src/models/pipeline";
import { toInstance } from "src/utils/models";
import { toMap } from "src/utils/minimap";

function pipeline() {
  return toInstance(
    {
      nodes: {
        a: {
          _id: "a",
          title: "A",
          arrange: { x: 0, y: 0 },
          inputs: {},
          outputs: {},
        },
        b: {
          _id: "b",
          title: "B",
          arrange: { x: 900, y: 500, w: 300 },
          inputs: {},
          outputs: {},
        },
      },
      layout: {
        left: 0,
        top: 0,
        zoom: 1,
        groups: {
          g: { title: "G", color: "blue", x: -20, y: -40, w: 300, h: 200 },
        },
      },
    },
    Pipeline,
  );
}

describe("CanvasMinimapComponent", () => {
  function render(view = { x: 0, y: 0, w: 800, h: 400 }) {
    const fixture = TestBed.createComponent(CanvasMinimapComponent);
    fixture.componentRef.setInput("pipeline", pipeline());
    fixture.componentRef.setInput("view", view);
    fixture.detectChanges();
    return fixture;
  }

  it("draws the nodes, the groups and the visible area", () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;

    const nodes = element.querySelectorAll(".mm-node");
    const group = element.querySelector<HTMLElement>(".mm-group");
    const view = element.querySelector<HTMLElement>(".mm-view");

    expect(nodes.length).toBe(2);
    expect(group.dataset["color"]).toBe("blue");
    expect(parseFloat(view.style.width)).toBeGreaterThan(0);
    expect(element.querySelector<HTMLElement>(".map").style.width).toBe(
      "220px",
    );
  });

  it("asks to centre the view on the clicked canvas point", () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    const centers: { x: number; y: number }[] = [];
    fixture.componentInstance.centerAt.subscribe((p) => centers.push(p));
    const frame = fixture.componentInstance.drawing.frame;
    const target = toMap({ x: 600, y: 300, w: 0, h: 0 }, frame);
    const map = element.querySelector<HTMLElement>(".map");
    const rect = element.getBoundingClientRect();

    map.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        clientX: rect.left + target.x,
        clientY: rect.top + target.y,
      }),
    );

    expect(centers.length).toBe(1);
    expect(centers[0].x).toBeCloseTo(600, 0);
    expect(centers[0].y).toBeCloseTo(300, 0);
  });

  it("frames the view too, so the outline never leaves the map", () => {
    const view = { x: 3000, y: 2000, w: 800, h: 400 };
    const fixture = render(view);

    const frame = fixture.componentInstance.drawing.frame;
    const box = toMap(view, frame);

    expect(box.x + box.w).toBeLessThanOrEqual(220);
    expect(box.y + box.h).toBeLessThanOrEqual(140);
  });
});
