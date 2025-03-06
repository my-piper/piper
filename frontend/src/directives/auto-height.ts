import {
  Directive,
  ElementRef,
  HostListener,
  OnInit,
  Renderer2,
} from "@angular/core";

@Directive({
  selector: "[autoHeight]",
})
export class AutoHeightDirective implements OnInit {
  constructor(
    private el: ElementRef,
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
    const top = this.el.nativeElement.getBoundingClientRect().top;
    const newHeight = windowHeight - top - 20;

    // Apply the calculated height
    this.renderer.setStyle(this.el.nativeElement, "height", `${newHeight}px`);
  }
}
