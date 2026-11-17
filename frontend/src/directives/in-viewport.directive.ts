import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from "@angular/core";

@Directive({
  selector: "[inViewport]",
  standalone: false,
})
export class InViewportDirective implements OnInit, OnDestroy {
  private root: HTMLElement;

  @Input()
  set config(config: { root?: HTMLElement }) {
    this.root = config.root;
  }

  @Output()
  visible = new EventEmitter<void>();

  private observer!: IntersectionObserver;

  constructor(private el: ElementRef) {}

  ngOnInit() {
    const { nativeElement } = this.el;
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.visible.emit();
            this.observer.disconnect();
          }
        });
      },
      { threshold: 0.5, root: this.root },
    );

    this.observer.observe(nativeElement);
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
