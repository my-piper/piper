import { Directive, ElementRef, HostListener, Renderer2 } from "@angular/core";

const ENABLE_TIMEOUT = 1000;

@Directive({
  selector: "[submitButton]",
})
export class SubmitButtonDirective {
  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  @HostListener("click")
  onClick() {
    this.renderer.setProperty(this.el.nativeElement, "disabled", true);
    setTimeout(() => {
      this.renderer.setProperty(this.el.nativeElement, "disabled", false);
    }, ENABLE_TIMEOUT);
  }
}
