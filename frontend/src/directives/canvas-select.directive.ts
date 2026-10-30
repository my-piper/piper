import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  Renderer2,
} from "@angular/core";

/** Screen pixels the pointer must travel before a press becomes a marquee. */
const SELECT_THRESHOLD = 3;

const INTERACTIVE =
  "a, button, input, textarea, select, label, [contenteditable]";

/** Marquee bounds in client (viewport) coordinates. */
export type SelectArea = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * Draws a selection marquee over the host with Shift + left button on empty
 * space (anything not matching `ignore`) and emits its client bounds while it
 * changes. The host may be scaled: pass the same `zoom`. A marquee that moved
 * swallows the click that follows it.
 */
@Directive({ selector: "[canvasSelect]" })
export class CanvasSelectDirective implements OnDestroy {
  private ignore = INTERACTIVE;
  private zoom = 1;
  private disabled = false;

  private area: {
    pointer: number;
    x: number;
    y: number;
    moved: boolean;
  } | null = null;
  private marquee: HTMLElement | null = null;
  private suppressClick = false;

  @Input("canvasSelect")
  set config({
    ignore,
    zoom,
    disabled,
  }: {
    ignore?: string;
    zoom?: number;
    disabled?: boolean;
  }) {
    this.ignore = ignore ? `${INTERACTIVE}, ${ignore}` : INTERACTIVE;
    this.zoom = zoom || 1;
    this.disabled = !!disabled;
  }

  /** A marquee starts: the consumer may remember the current selection. */
  @Output()
  selectStart = new EventEmitter<void>();

  @Output()
  selecting = new EventEmitter<SelectArea>();

  private readonly onClickCapture = (event: MouseEvent) => {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  constructor(
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
  ) {
    hostRef.nativeElement.addEventListener("click", this.onClickCapture, true);
  }

  ngOnDestroy() {
    this.hostRef.nativeElement.removeEventListener(
      "click",
      this.onClickCapture,
      true,
    );
    this.removeMarquee();
  }

  @HostListener("pointerdown", ["$event"])
  start(event: PointerEvent) {
    if (
      this.disabled ||
      this.area ||
      event.pointerType === "touch" ||
      event.button !== 0 ||
      !event.shiftKey
    ) {
      return;
    }

    const target = event.target as Element;
    if (target.closest(this.ignore)) {
      return;
    }

    // Keeps the browser from selecting text while the marquee is drawn.
    event.preventDefault();

    this.hostRef.nativeElement.setPointerCapture?.(event.pointerId);
    this.area = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    this.suppressClick = false;
  }

  @HostListener("pointermove", ["$event"])
  move(event: PointerEvent) {
    const area = this.area;
    if (!area || area.pointer !== event.pointerId) {
      return;
    }

    const dx = event.clientX - area.x;
    const dy = event.clientY - area.y;
    if (!area.moved && Math.hypot(dx, dy) < SELECT_THRESHOLD) {
      return;
    }
    if (!area.moved) {
      area.moved = true;
      this.selectStart.emit();
    }

    const bounds: SelectArea = {
      left: Math.min(area.x, event.clientX),
      top: Math.min(area.y, event.clientY),
      right: Math.max(area.x, event.clientX),
      bottom: Math.max(area.y, event.clientY),
    };
    this.draw(bounds);
    this.selecting.emit(bounds);
  }

  @HostListener("pointerup", ["$event"])
  @HostListener("pointercancel", ["$event"])
  end(event: PointerEvent) {
    const area = this.area;
    if (!area || area.pointer !== event.pointerId) {
      return;
    }

    this.hostRef.nativeElement.releasePointerCapture?.(event.pointerId);
    this.area = null;
    this.removeMarquee();
    if (area.moved) {
      this.suppressClick = true;
      // The click, if any, is dispatched right after pointerup.
      setTimeout(() => (this.suppressClick = false));
    }
  }

  private draw({ left, top, right, bottom }: SelectArea) {
    const host = this.hostRef.nativeElement;
    if (!this.marquee) {
      this.marquee = this.renderer.createElement("div");
      this.renderer.addClass(this.marquee, "marquee");
      this.renderer.appendChild(host, this.marquee);
    }

    // Host coordinates are unscaled, the bounding rect is scaled.
    const rect = host.getBoundingClientRect();
    const zoom = this.zoom;
    const styles = {
      left: `${(left - rect.left) / zoom}px`,
      top: `${(top - rect.top) / zoom}px`,
      width: `${(right - left) / zoom}px`,
      height: `${(bottom - top) / zoom}px`,
    };
    for (const [style, value] of Object.entries(styles)) {
      this.renderer.setStyle(this.marquee, style, value);
    }
  }

  private removeMarquee() {
    if (this.marquee) {
      this.marquee.remove();
      this.marquee = null;
    }
  }
}
