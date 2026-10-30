import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  Renderer2,
} from "@angular/core";

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2;
/** Multiplier applied by the zoom buttons and keyboard shortcuts. */
export const ZOOM_STEP = 1.2;
const ZOOM_SPEED = 0.01;
/** Caps a single wheel notch so mouse wheels zoom as smoothly as trackpads. */
const MAX_WHEEL_DELTA = 25;
const LINE_HEIGHT = 16;
const FIT_PADDING = 40;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select"))
  );
}

type Origin = { clientX: number; clientY: number };

/**
 * Scales the host inside its scrolling parent: ctrl/cmd + wheel (and trackpad
 * pinch) around the cursor, ctrl/cmd + `=`/`-`/`0` and shift + `1` (fit) from
 * the keyboard, or `zoomBy`/`zoomTo`/`fit` from a template reference.
 */
@Directive({
  selector: "[pitchZoom]",
  exportAs: "pitchZoom",
})
export class PitchZoomDirective {
  zoom = 1;

  /** Elements `fit()` frames; everything else in the host is ignored. */
  private items = "";

  @Input("pitchZoom")
  set config({ zoom, items }: { zoom: number; items?: string }) {
    this.zoom = zoom ?? 1;
    this.items = items ?? "";
    this.apply();
  }

  @Output("zoom")
  updated = new EventEmitter<number>();

  constructor(
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
  ) {
    this.renderer.setStyle(hostRef.nativeElement, "transform-origin", "0 0");
  }

  private get container() {
    return this.hostRef.nativeElement.parentElement as HTMLElement;
  }

  private apply() {
    const el = this.hostRef.nativeElement;
    this.renderer.setStyle(el, "transform", `scale(${this.zoom})`);
  }

  @HostListener("wheel", ["$event"])
  onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();

    const delta =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * LINE_HEIGHT
        : event.deltaY;
    const step = clamp(delta, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
    this.zoomTo(this.zoom * Math.exp(-step * ZOOM_SPEED), event);
  }

  @HostListener("document:keydown", ["$event"])
  onKey(event: KeyboardEvent) {
    if (isEditable(event.target) || event.altKey) {
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && (event.key === "=" || event.key === "+")) {
      this.zoomBy(ZOOM_STEP);
    } else if (modifier && event.key === "-") {
      this.zoomBy(1 / ZOOM_STEP);
    } else if (modifier && event.key === "0") {
      this.zoomTo(1);
    } else if (!modifier && event.shiftKey && event.code === "Digit1") {
      this.fit();
    } else {
      return;
    }

    event.preventDefault();
  }

  zoomBy(factor: number, origin?: Origin) {
    this.zoomTo(this.zoom * factor, origin);
  }

  /** Zooms keeping the point under `origin` (default: viewport center) fixed. */
  zoomTo(zoom: number, origin?: Origin) {
    const newZoom = +clamp(zoom, MIN_SCALE, MAX_SCALE).toFixed(3);
    if (newZoom === this.zoom) {
      return;
    }

    const container = this.container;
    const rect = container.getBoundingClientRect();
    const x = origin ? origin.clientX - rect.left : container.clientWidth / 2;
    const y = origin ? origin.clientY - rect.top : container.clientHeight / 2;

    const worldX = (container.scrollLeft + x) / this.zoom;
    const worldY = (container.scrollTop + y) / this.zoom;

    this.zoom = newZoom;
    this.apply();

    container.scrollLeft = worldX * this.zoom - x;
    container.scrollTop = worldY * this.zoom - y;

    this.updated.emit(this.zoom);
  }

  /** Zooms (never above 100%) and scrolls so that all `items` are visible. */
  fit() {
    const el = this.hostRef.nativeElement;
    const container = this.container;
    const items = this.items
      ? Array.from(el.querySelectorAll<HTMLElement>(this.items))
      : [];
    if (items.length === 0) {
      this.zoomTo(1);
      container.scrollLeft = 0;
      container.scrollTop = 0;
      return;
    }

    const host = el.getBoundingClientRect();
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const item of items) {
      const r = item.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    // Content box in unscaled canvas units.
    left = (left - host.left) / this.zoom;
    top = (top - host.top) / this.zoom;
    const width = (right - host.left) / this.zoom - left;
    const height = (bottom - host.top) / this.zoom - top;

    const viewW = container.clientWidth - FIT_PADDING * 2;
    const viewH = container.clientHeight - FIT_PADDING * 2;
    const zoom = +clamp(
      Math.min(viewW / width, viewH / height, 1),
      MIN_SCALE,
      MAX_SCALE,
    ).toFixed(3);

    const changed = zoom !== this.zoom;
    this.zoom = zoom;
    this.apply();

    container.scrollLeft =
      left * zoom - (container.clientWidth - width * zoom) / 2;
    container.scrollTop =
      top * zoom - (container.clientHeight - height * zoom) / 2;

    if (changed) {
      this.updated.emit(this.zoom);
    }
  }
}
