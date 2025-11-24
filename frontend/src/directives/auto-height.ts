import {
  Directive,
  ElementRef,
  HostListener,
  OnInit,
  Renderer2,
} from "@angular/core";

// thanks for ChatGPT here
@Directive({
  selector: "[autoHeight]",
})
export class AutoHeightDirective implements OnInit {
  constructor(
    private hostRef: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    this.adjustHeight();
  }

  @HostListener("window:resize", ["$event"])
  onResize() {
    this.adjustHeight();
  }

  private adjustHeight() {
    const windowHeight = window.innerHeight;
    const { nativeElement: el } = this.hostRef;
    const top = el.getBoundingClientRect().top;
    const newHeight = windowHeight - top;
    this.renderer.setStyle(el, "height", `${newHeight}px`);
  }
}
