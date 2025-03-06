import { Directive, ElementRef, HostListener, Renderer2 } from "@angular/core";

@Directive({
  selector: "[imageFallback]",
})
export class ImageFallbackDirective {
  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  @HostListener("error")
  onError() {
    const svg = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100%" height="100%" fill="red" opacity="0.5" />
        <g transform="translate(38, 38)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M6.324 9.068C3.885 9.401 2 11.47 2 14C2 16.761 4.239 19 7 19H18C20.209 19 22 17.209 22 15C22 12.791 20.209 11 18 11C18 7.686 15.314 5 12 5C9.363 5 7.129 6.703 6.324 9.068Z" stroke="#323232" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 13.33V10" stroke="#323232" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M11.999 15.667C11.907 15.667 11.832 15.742 11.833 15.834C11.833 15.925 11.908 16 12 16C12.092 16 12.167 15.925 12.167 15.833C12.167 15.741 12.092 15.667 11.999 15.667" stroke="#323232" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </g>
      </svg>`;
    this.renderer.setProperty(
      this.el.nativeElement,
      "src",
      `data:image/svg+xml;base64,${btoa(svg)}`
    );
  }
}
