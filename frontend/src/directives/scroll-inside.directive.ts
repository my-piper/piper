import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from "@angular/core";

type Config = { left: number; top: number; disabled: boolean };
type Position = { left: number; top: number };

@Directive({ selector: "[scrollInside]" })
export class ScrollInsideDirective {
  private disabled = false;
  private suppressNextScroll = false;

  @Input("scrollInside")
  set scrollInside({ left, top, disabled }: Config) {
    this.disabled = disabled;
    const el = this.hostRef.nativeElement;
    if (el.scrollLeft !== left || el.scrollTop !== top) {
      this.suppressNextScroll = true;
      el.scrollLeft = left;
      el.scrollTop = top;
      requestAnimationFrame(() => (this.suppressNextScroll = false));
    }
  }

  @Output()
  updated = new EventEmitter<Position>();

  constructor(private hostRef: ElementRef<HTMLElement>) {}

  @HostListener("scroll")
  onScroll() {
    if (this.disabled || this.suppressNextScroll) {
      return;
    }
    const el = this.hostRef.nativeElement;
    this.updated.emit({ left: el.scrollLeft, top: el.scrollTop });
  }
}
