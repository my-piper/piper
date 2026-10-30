import { Component } from "@angular/core";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { CanvasPanDirective } from "src/directives/canvas-pan.directive";
import { DragCloneDirective } from "src/directives/drag-clone.directive";
import { DragMoveDirective } from "src/directives/drag-move.directive";
import { DropZoneDirective } from "src/directives/drop-zone.directive";
import { PitchZoomDirective } from "src/directives/pitch-zoom.directive";
import { DropZoneHub } from "src/services/drop-zone.hub";
import { Point } from "src/types/point";

/** Delay before a mousedown turns into a drag (drag-move.directive.ts). */
const MOVE_DELAY = 100;
const STOP_DELAY = 100;

function mouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  x: number,
  y: number,
) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
  );
}

function pointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: "mouse",
      pointerId: 1,
    }),
  );
}

describe("canvas directives", () => {
  describe("DragMoveDirective", () => {
    @Component({
      template: `<div
        class="pane"
        [style.transform]="'scale(' + zoom + ')'"
        style="position: absolute; left: 0; top: 0; width: 800px; height: 600px; transform-origin: 0 0"
      >
        <div
          class="item"
          style="position: absolute; width: 100px; height: 40px"
          [appDragMove]="{
            position: position,
            zoom: zoom,
            disabled: disabled,
            anchorX: 0,
            anchorY: 0,
            grid: 10,
          }"
          (moving)="moving.push($event)"
          (moved)="moved.push($event)"
        >
          <span class="label">drag me</span>
          <button>action</button>
        </div>
      </div>`,
    })
    class HostComponent {
      zoom = 1;
      disabled = false;
      position: Point = { x: 0, y: 0 };
      moving: Point[] = [];
      moved: Point[] = [];
    }

    let fixture: ComponentFixture<HostComponent>;
    let host: HostComponent;
    let item: HTMLElement;

    function render(changes: Partial<HostComponent> = {}) {
      TestBed.configureTestingModule({
        declarations: [HostComponent, DragMoveDirective],
      });
      fixture = TestBed.createComponent(HostComponent);
      host = fixture.componentInstance;
      Object.assign(host, changes);
      fixture.detectChanges();
      item = fixture.nativeElement.querySelector(".item");
    }

    function origin() {
      const { left, top } = item.getBoundingClientRect();
      return { left, top };
    }

    it("places the element at its configured position", () => {
      render({ position: { x: 120, y: 60 } });

      expect(item.style.left).toBe("120px");
      expect(item.style.top).toBe("60px");
    });

    it("ignores mouse movement before the drag delay elapses", fakeAsync(() => {
      render();
      const { left, top } = origin();

      mouse(item, "mousedown", left + 5, top + 5);
      tick(MOVE_DELAY - 1);
      mouse(document, "mousemove", left + 105, top + 65);
      mouse(document, "mouseup", left + 105, top + 65);
      tick(STOP_DELAY);

      expect(host.moving).toEqual([]);
      expect(host.moved).toEqual([]);
    }));

    it("snaps the moved position to the grid", fakeAsync(() => {
      render();
      const { left, top } = origin();

      mouse(item, "mousedown", left + 5, top + 5);
      tick(MOVE_DELAY);
      mouse(document, "mousemove", left + 5 + 104, top + 5 + 57);
      mouse(document, "mouseup", left + 5 + 104, top + 5 + 57);
      tick(STOP_DELAY);

      expect(host.moving).toEqual([{ x: 100, y: 60 }]);
      expect(host.moved).toEqual([{ x: 100, y: 60 }]);
      expect(item.style.left).toBe("100px");
    }));

    it("converts screen movement to canvas units when zoomed", fakeAsync(() => {
      render({ zoom: 2 });
      const { left, top } = origin();

      mouse(item, "mousedown", left + 10, top + 10);
      tick(MOVE_DELAY);
      mouse(document, "mousemove", left + 10 + 200, top + 10 + 120);
      mouse(document, "mouseup", left + 10 + 200, top + 10 + 120);
      tick(STOP_DELAY);

      expect(host.moved).toEqual([{ x: 100, y: 60 }]);
    }));

    it("does not drag when disabled", fakeAsync(() => {
      render({ disabled: true });
      const { left, top } = origin();

      mouse(item, "mousedown", left + 5, top + 5);
      tick(MOVE_DELAY);
      mouse(document, "mousemove", left + 200, top + 200);
      mouse(document, "mouseup", left + 200, top + 200);
      tick(STOP_DELAY);

      expect(host.moving).toEqual([]);
      expect(item.style.left).toBe("0px");
    }));

    it("does not start a drag from a form control", fakeAsync(() => {
      render();
      const button = item.querySelector("button");
      const { left, top } = origin();

      mouse(button, "mousedown", left + 5, top + 5);
      tick(MOVE_DELAY);
      mouse(document, "mousemove", left + 200, top + 200);
      mouse(document, "mouseup", left + 200, top + 200);
      tick(STOP_DELAY);

      expect(host.moved).toEqual([]);
    }));

    it("does not run pending drag timers after the view is destroyed", fakeAsync(() => {
      render();
      const { left, top } = origin();
      mouse(item, "mousedown", left + 5, top + 5);

      fixture.destroy();

      expect(() => tick(MOVE_DELAY)).not.toThrow();
    }));

    it("stops listening to the document after destruction", fakeAsync(() => {
      render();
      const { left, top } = origin();
      mouse(item, "mousedown", left + 5, top + 5);
      tick(MOVE_DELAY);
      const moving = host.moving;

      fixture.destroy();
      mouse(document, "mousemove", left + 300, top + 300);
      mouse(document, "mouseup", left + 300, top + 300);
      tick(STOP_DELAY);

      expect(moving).toEqual([]);
    }));
  });

  describe("PitchZoomDirective", () => {
    @Component({
      template: `<div
        class="container"
        style="width: 400px; height: 300px; overflow: auto"
      >
        <div
          class="content"
          style="position: relative"
          [pitchZoom]="{ zoom: zoom, items: items }"
          (zoom)="zooms.push($event)"
        >
          <div style="width: 4000px; height: 4000px"></div>
          <div
            class="item"
            style="position: absolute; left: 1000px; top: 1000px; width: 200px; height: 100px"
          ></div>
          <div
            class="item"
            style="position: absolute; left: 2000px; top: 1200px; width: 200px; height: 100px"
          ></div>
        </div>
      </div>`,
    })
    class HostComponent {
      zoom = 1;
      items = "";
      zooms: number[] = [];
    }

    let fixture: ComponentFixture<HostComponent>;
    let content: HTMLElement;

    function render(zoom = 1, items = "") {
      TestBed.configureTestingModule({
        declarations: [HostComponent, PitchZoomDirective],
      });
      fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.zoom = zoom;
      fixture.componentInstance.items = items;
      fixture.detectChanges();
      content = fixture.nativeElement.querySelector(".content");
    }

    function key(key: string, target: EventTarget = document.body) {
      const event = new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    }

    function wheel(deltaY: number, ctrlKey = true) {
      const event = new WheelEvent("wheel", {
        deltaY,
        ctrlKey,
        bubbles: true,
        cancelable: true,
      });
      content.dispatchEvent(event);
      return event;
    }

    it("applies the stored zoom on init", () => {
      render(0.5);

      expect(content.style.transform).toBe("scale(0.5)");
      expect(content.style.transformOrigin).toBe("0px 0px");
    });

    it("ignores wheel events without ctrl (plain scrolling)", () => {
      render();

      const event = wheel(-50, false);

      expect(event.defaultPrevented).toBeFalse();
      expect(fixture.componentInstance.zooms).toEqual([]);
    });

    it("zooms exponentially with ctrl+wheel", () => {
      render();

      wheel(-20);
      wheel(20);

      expect(fixture.componentInstance.zooms).toEqual([1.221, 1]);
      expect(content.style.transform).toBe("scale(1)");
    });

    it("caps a single mouse wheel notch", () => {
      render();

      wheel(-100);

      expect(fixture.componentInstance.zooms).toEqual([
        +Math.exp(0.25).toFixed(3),
      ]);
    });

    it("clamps zoom between 0.2 and 2 and stops emitting at the bounds", () => {
      render(1.9);
      const { zooms } = fixture.componentInstance;

      wheel(-25);
      wheel(-25);
      for (let i = 0; i < 20; i++) {
        wheel(25);
      }

      expect(zooms[0]).toBe(2);
      expect(zooms.filter((z) => z === 2).length).toBe(1);
      expect(zooms.at(-1)).toBe(0.2);
      expect(zooms.filter((z) => z === 0.2).length).toBe(1);
      expect(content.style.transform).toBe("scale(0.2)");
    });

    it("applies a zoom changed from outside after init", () => {
      render();

      fixture.componentInstance.zoom = 0.75;
      fixture.detectChanges();

      expect(content.style.transform).toBe("scale(0.75)");
    });

    it("zooms with ctrl+= / ctrl+- / ctrl+0 and leaves editable fields alone", () => {
      render();
      const input = document.createElement("input");
      content.appendChild(input);

      key("=");
      key("-");
      key("-");
      key("0");
      const typed = key("-", input);

      expect(fixture.componentInstance.zooms).toEqual([1.2, 1, 0.833, 1]);
      expect(typed.defaultPrevented).toBeFalse();
    });

    it("fits all items into the viewport, never above 100%", () => {
      render(1, ".item");
      const container = content.parentElement;
      const directive = fixture.debugElement
        .query(By.directive(PitchZoomDirective))
        .injector.get(PitchZoomDirective);
      const { clientWidth: w, clientHeight: h } = container;
      // Items span 1000..2200 × 1000..1300 with 40px padding on each side.
      const zoom = +Math.min((w - 80) / 1200, (h - 80) / 300, 1).toFixed(3);

      directive.fit();

      expect(fixture.componentInstance.zooms).toEqual([zoom]);
      expect(
        Math.abs(container.scrollLeft - (1000 * zoom - (w - 1200 * zoom) / 2)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(container.scrollTop - (1000 * zoom - (h - 300 * zoom) / 2)),
      ).toBeLessThanOrEqual(1);
    });

    it("keeps the point under the cursor fixed while zooming", () => {
      render();
      const container = content.parentElement;
      const rect = container.getBoundingClientRect();

      content.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -50,
          ctrlKey: true,
          clientX: rect.left + 100,
          clientY: rect.top + 100,
          bubbles: true,
          cancelable: true,
        }),
      );

      // One wheel notch is capped at 25: 100 × e^0.25 - 100 ≈ 28.4.
      expect(Math.abs(container.scrollLeft - 28.4)).toBeLessThanOrEqual(1);
      expect(Math.abs(container.scrollTop - 28.4)).toBeLessThanOrEqual(1);
    });
  });

  describe("CanvasPanDirective", () => {
    @Component({
      template: `<div
        class="container"
        style="width: 400px; height: 300px; overflow: auto"
        [canvasPan]="{ ignore: '.node' }"
        (click)="clicks = clicks + 1"
      >
        <div style="position: relative; width: 2000px; height: 2000px">
          <div
            class="node"
            style="position: absolute; left: 0; top: 0; width: 100px; height: 100px"
          ></div>
          <div
            class="empty"
            style="position: absolute; left: 150px; top: 150px; width: 10px; height: 10px"
          ></div>
        </div>
      </div>`,
    })
    class HostComponent {
      clicks = 0;
    }

    let fixture: ComponentFixture<HostComponent>;
    let container: HTMLElement;

    function render() {
      TestBed.configureTestingModule({
        declarations: [HostComponent, CanvasPanDirective],
      });
      fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      container = fixture.nativeElement.querySelector(".container");
      container.scrollLeft = 500;
      container.scrollTop = 500;
    }

    function press(
      target: Element,
      type: "pointerdown" | "pointermove" | "pointerup",
      x: number,
      y: number,
      button = 0,
    ) {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button,
        pointerType: "mouse",
        pointerId: 1,
      });
      target.dispatchEvent(event);
      return event;
    }

    function drag(target: Element, dx: number, dy: number, button = 0) {
      press(target, "pointerdown", 200, 200, button);
      press(target, "pointermove", 200 + dx, 200 + dy, button);
      press(target, "pointerup", 200 + dx, 200 + dy, button);
    }

    function space(type: "keydown" | "keyup") {
      document.body.dispatchEvent(
        new KeyboardEvent(type, { code: "Space", bubbles: true }),
      );
    }

    it("pans by dragging empty space", () => {
      render();

      drag(fixture.nativeElement.querySelector(".empty"), -120, -80);

      expect(container.scrollLeft).toBe(620);
      expect(container.scrollTop).toBe(580);
    });

    it("does not pan from ignored elements", () => {
      render();

      drag(fixture.nativeElement.querySelector(".node"), -120, -80);

      expect(container.scrollLeft).toBe(500);
    });

    it("pans from anywhere with the middle button or while Space is held", () => {
      render();
      const node = fixture.nativeElement.querySelector(".node");

      drag(node, -100, 0, 1);
      space("keydown");
      fixture.detectChanges();
      const ready = container.getAttribute("data-pan");
      drag(node, 0, -100);
      space("keyup");

      expect(container.scrollLeft).toBe(600);
      expect(container.scrollTop).toBe(600);
      expect(ready).toBe("ready");
    });

    it("swallows the click that ends a pan but not a plain click", fakeAsync(() => {
      render();
      const empty = fixture.nativeElement.querySelector(".empty");

      drag(empty, -50, 0);
      empty.click();
      tick();
      press(empty, "pointerdown", 200, 200);
      press(empty, "pointerup", 201, 200);
      empty.click();

      expect(fixture.componentInstance.clicks).toBe(1);
    }));

    it("ignores sub-threshold jitter", () => {
      render();

      drag(fixture.nativeElement.querySelector(".empty"), 2, 1);

      expect(container.scrollLeft).toBe(500);
    });
  });

  describe("DragCloneDirective + DropZoneDirective", () => {
    @Component({
      template: `<div
          class="source"
          style="position: fixed; left: 0; top: 0; width: 50px; height: 20px"
          [dragClone]="{ payload: payload }"
        >
          node <button>info</button>
        </div>
        <div
          *ngIf="zone"
          class="zone"
          dropZone
          style="position: fixed; left: 200px; top: 100px; width: 300px; height: 200px"
          (drop)="drops.push($event)"
        ></div>`,
    })
    class HostComponent {
      zone = true;
      payload = { node: "catalog_node" };
      drops: { top: number; left: number; payload: unknown }[] = [];
    }

    let fixture: ComponentFixture<HostComponent>;
    let source: HTMLElement;

    function render() {
      TestBed.configureTestingModule({
        declarations: [HostComponent, DragCloneDirective, DropZoneDirective],
      });
      fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      source = fixture.nativeElement.querySelector(".source");
    }

    function clones() {
      return Array.from(document.body.children).filter(
        (e) => (e as HTMLElement).style?.zIndex === "9999",
      );
    }

    it("drops the payload at zone-relative coordinates and removes the preview", () => {
      render();

      pointer(source, "pointerdown", 10, 10);
      const during = clones().length;
      pointer(document, "pointermove", 260, 150);
      pointer(document, "pointerup", 260, 150);

      expect(during).toBe(1);
      expect(fixture.componentInstance.drops).toEqual([
        { left: 50, top: 40, payload: { node: "catalog_node" } },
      ]);
      expect(clones()).toEqual([]);
      expect(document.body.style.cursor).toBe("");
    });

    it("drops nothing outside a zone", () => {
      render();

      pointer(source, "pointerdown", 10, 10);
      pointer(document, "pointermove", 600, 500);
      pointer(document, "pointerup", 600, 500);

      expect(fixture.componentInstance.drops).toEqual([]);
      expect(clones()).toEqual([]);
    });

    it("does not start dragging from a button inside the source", () => {
      render();

      pointer(source.querySelector("button"), "pointerdown", 10, 10);

      expect(clones()).toEqual([]);
    });

    it("removes the preview when destroyed mid-drag", () => {
      render();
      pointer(source, "pointerdown", 10, 10);

      fixture.destroy();

      expect(clones()).toEqual([]);
      expect(document.body.style.cursor).toBe("");
    });

    it("unregisters a destroyed drop zone", () => {
      render();
      const hub = TestBed.inject(DropZoneHub);
      const registered = hub.zones.size;

      fixture.componentInstance.zone = false;
      fixture.detectChanges();

      expect(registered).toBe(1);
      expect(hub.zones.size).toBe(0);
    });
  });
});
