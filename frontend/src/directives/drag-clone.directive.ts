import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  Renderer2,
} from "@angular/core";
import { DropZoneHub } from "src/services/drop-zone.hub";

@Directive({
  selector: "[dragClone]",
})
export class DragCloneDirective implements OnDestroy {
  @HostBinding("style.touchAction")
  touchAction = "none";

  private clonedElement?: HTMLElement;
  private dragging = false;
  private offsetX = 0;
  private offsetY = 0;
  private left = 0;
  private top = 0;
  private cloneW = 0;
  private cloneH = 0;

  private payload: any;

  @Input()
  set dragClone({ payload }: { payload: any }) {
    this.payload = payload;
  }

  constructor(
    private dropZoneHub: DropZoneHub,
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  @HostListener("pointerdown", ["$event"])
  onPointerDown(event: PointerEvent) {
    const { button, pointerType } = event;
    if (button !== 0 && pointerType !== "touch" && pointerType !== "pen")
      return;

    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select")) {
      return;
    }

    const host = this.hostRef.nativeElement;

    event.preventDefault();
    host.setPointerCapture?.(event.pointerId);

    const rect = host.getBoundingClientRect();
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;
    this.cloneW = rect.width;
    this.cloneH = rect.height;

    // 1) Make a deep clone
    const clone = host.cloneNode(true) as HTMLElement;

    // 2) Inline computed styles (host + subtree)
    inlineComputedStylesDeep(host, clone);

    this.clonedElement = clone;

    // 3) Override positioning for drag preview
    this.renderer.setStyle(clone, "position", "fixed");
    this.renderer.setStyle(clone, "left", `${rect.left}px`);
    this.renderer.setStyle(clone, "top", `${rect.top}px`);
    this.renderer.setStyle(clone, "width", `${rect.width}px`);
    this.renderer.setStyle(clone, "height", `${rect.height}px`);
    this.renderer.setStyle(clone, "cursor", "dragging");
    this.renderer.setStyle(clone, "opacity", "0.85");
    this.renderer.setStyle(clone, "zIndex", "9999");
    this.renderer.setStyle(clone, "userSelect", "none");
    this.renderer.setStyle(clone, "margin", "0");

    // 4) Append to body so it isn't clipped
    this.renderer.appendChild(document.body, clone);
    this.dragging = true;
  }

  @HostListener("document:pointermove", ["$event"])
  onPointerMove(ev: PointerEvent) {
    if (!this.dragging || !this.clonedElement) {
      return;
    }

    let left = ev.clientX - this.offsetX;
    let top = ev.clientY - this.offsetY;

    left = Math.min(Math.max(0, left), window.innerWidth - this.cloneW);
    top = Math.min(Math.max(0, top), window.innerHeight - this.cloneH);

    this.left = left;
    this.top = top;

    this.renderer.setStyle(this.clonedElement, "left", `${left}px`);
    this.renderer.setStyle(this.clonedElement, "top", `${top}px`);
  }

  @HostListener("document:pointerup", ["$event"])
  onPointerUp({ pointerId }: PointerEvent) {
    if (!this.dragging) {
      return;
    }

    const hints = document.elementsFromPoint(this.left, this.top);
    this.dropZoneHub.drop(hints, this.left, this.top, this.payload);

    this.hostRef.nativeElement.releasePointerCapture?.(pointerId);
    this.cleanup();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup() {
    this.dragging = false;
    if (this.clonedElement?.parentElement) {
      this.renderer.removeChild(
        this.clonedElement.parentElement,
        this.clonedElement
      );
    }
    this.clonedElement = null;
  }
}

function inlineComputedStylesDeep(src: HTMLElement, dst: HTMLElement) {
  copyComputedStyles(src, dst);

  const srcKids = src.querySelectorAll<HTMLElement>("*");
  const dstKids = dst.querySelectorAll<HTMLElement>("*");

  for (let i = 0; i < srcKids.length && i < dstKids.length; i++) {
    copyComputedStyles(srcKids[i], dstKids[i]);
  }
}

function copyComputedStyles(src: HTMLElement, dst: HTMLElement) {
  const computed = getComputedStyle(src);

  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    const val = computed.getPropertyValue(prop);
    if (!val) {
      continue;
    }
    const priority = computed.getPropertyPriority(prop);
    dst.style.setProperty(prop, val, priority);
  }
}
