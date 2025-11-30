import { Directive, ElementRef, OnDestroy, OnInit } from "@angular/core";

@Directive({
  selector: "[autoScroll]",
})
export class AutoScrollDirective implements OnInit, OnDestroy {
  private observer!: MutationObserver;

  constructor(private hostRef: ElementRef<HTMLElement>) {}

  ngOnInit() {
    const el = this.hostRef.nativeElement;
    this.observer = new MutationObserver(
      () => (el.scrollTop = el.scrollHeight)
    );

    this.observer.observe(el, { childList: true, subtree: true });
    el.scrollTop = el.scrollHeight;
  }

  ngOnDestroy(): void {
    if (!!this.observer) {
      this.observer.disconnect();
    }
  }
}
