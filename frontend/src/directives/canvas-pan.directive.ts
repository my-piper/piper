import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
} from "@angular/core";

/** Screen pixels the pointer must travel before a press becomes a pan. */
const PAN_THRESHOLD = 3;

const INTERACTIVE =
  "a, button, input, textarea, select, label, [contenteditable]";

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select"))
  );
}

/**
 * Pans a scroll container by dragging: left button on empty space (anything
 * not matching `ignore`), middle button anywhere, or Space + left button
 * anywhere. A pan that moved swallows the click that follows it.
 */
@Directive({ selector: "[canvasPan]" })
export class CanvasPanDirective implements OnDestroy {
  private ignore = INTERACTIVE;

  private space = false;
  private pan: {
    pointer: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null = null;
  private suppressClick = false;

  @Input("canvasPan")
  set config(config: { ignore?: string } | "") {
    const ignore = config ? config.ignore : null;
    this.ignore = ignore ? `${INTERACTIVE}, ${ignore}` : INTERACTIVE;
  }

  @HostBinding("attr.data-pan")
  get state() {
    return this.pan?.moved ? "panning" : this.space ? "ready" : null;
  }

  private readonly onClickCapture = (event: MouseEvent) => {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  constructor(private hostRef: ElementRef<HTMLElement>) {
    hostRef.nativeElement.addEventListener("click", this.onClickCapture, true);
  }

  ngOnDestroy() {
    this.hostRef.nativeElement.removeEventListener(
      "click",
      this.onClickCapture,
      true,
    );
  }

  @HostListener("pointerdown", ["$event"])
  start(event: PointerEvent) {
    if (event.pointerType === "touch" || this.pan) {
      return;
    }

    const target = event.target as Element;
    const middle = event.button === 1;
    const left =
      event.button === 0 && (this.space || !target.closest(this.ignore));
    if (!middle && !left) {
      return;
    }

    // Keeps the browser from selecting text, autoscrolling (middle button)
    // and firing the mousedown that starts a node drag (Space + drag).
    event.preventDefault();

    const el = this.hostRef.nativeElement;
    el.setPointerCapture?.(event.pointerId);
    this.pan = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
    this.suppressClick = false;
  }

  @HostListener("pointermove", ["$event"])
  move(event: PointerEvent) {
    const pan = this.pan;
    if (!pan || pan.pointer !== event.pointerId) {
      return;
    }

    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) {
      return;
    }
    pan.moved = true;

    const el = this.hostRef.nativeElement;
    el.scrollLeft = pan.left - dx;
    el.scrollTop = pan.top - dy;
  }

  @HostListener("pointerup", ["$event"])
  @HostListener("pointercancel", ["$event"])
  end(event: PointerEvent) {
    const pan = this.pan;
    if (!pan || pan.pointer !== event.pointerId) {
      return;
    }

    this.hostRef.nativeElement.releasePointerCapture?.(event.pointerId);
    this.pan = null;
    if (pan.moved) {
      this.suppressClick = true;
      // The click, if any, is dispatched right after pointerup.
      setTimeout(() => (this.suppressClick = false));
    }
  }

  @HostListener("document:keydown", ["$event"])
  keyDown(event: KeyboardEvent) {
    if (event.code !== "Space" || isEditable(event.target)) {
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(INTERACTIVE)
    ) {
      return;
    }

    event.preventDefault();
    this.space = true;
  }

  @HostListener("document:keyup", ["$event"])
  keyUp(event: KeyboardEvent) {
    if (event.code === "Space") {
      this.space = false;
    }
  }

  @HostListener("window:blur")
  blur() {
    this.space = false;
  }
}
