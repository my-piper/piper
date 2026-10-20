import { Component } from "@angular/core";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
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
          [pitchZoom]="{ zoom: zoom }"
          (zoom)="zooms.push($event)"
        >
          <div style="width: 2000px; height: 2000px"></div>
        </div>
      </div>`,
    })
    class HostComponent {
      zoom = 1;
      zooms: number[] = [];
    }

    let fixture: ComponentFixture<HostComponent>;
    let content: HTMLElement;

    function render(zoom = 1) {
      TestBed.configureTestingModule({
        declarations: [HostComponent, PitchZoomDirective],
      });
      fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.zoom = zoom;
      fixture.detectChanges();
      content = fixture.nativeElement.querySelector(".content");
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

    it("zooms in and out with ctrl+wheel", () => {
      render();

      wheel(-20);
      wheel(30);

      expect(fixture.componentInstance.zooms.map((z) => +z.toFixed(2))).toEqual(
        [1.2, 0.9],
      );
      expect(content.style.transform).toBe("scale(0.9)");
    });

    it("clamps zoom between 0.35 and 1.5 and stops emitting at the bounds", () => {
      render();

      wheel(-1000);
      wheel(-10);
      wheel(1000);
      wheel(10);

      expect(fixture.componentInstance.zooms).toEqual([1.5, 0.35]);
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

      expect(container.scrollLeft).toBe(50);
      expect(container.scrollTop).toBe(50);
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
