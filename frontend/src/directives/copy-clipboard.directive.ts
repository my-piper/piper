import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  Renderer2,
} from "@angular/core";

const ENABLE_TIMEOUT = 1000;

@Directive({
  selector: "[copyToClipboard]",
})
export class CopyToClipboardDirective {
  @Input("copyToClipboard")
  text: string;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  @HostListener("click")
  onClick() {
    navigator.clipboard.writeText(this.text);
    this.renderer.setProperty(this.el.nativeElement, "disabled", true);
    setTimeout(() => {
      this.renderer.setProperty(this.el.nativeElement, "disabled", false);
    }, ENABLE_TIMEOUT);
  }
}
