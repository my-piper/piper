import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  Renderer2,
} from "@angular/core";

type Size = { width: number; height: number };

@Directive({
  selector: "[imageSize]",
})
export class ImageSizeDirective {
  private badge!: HTMLDivElement;
  private _url: string | Size;

  @Input("imageSize")
  set url(url: string | Size) {
    this._url = url;
    this.removeBadge();
    if (!!url) {
      this.createBadge();
      this.loadImageSize();
    }
  }

  get url() {
    return this._url;
  }

  constructor(
    private hostRef: ElementRef,
    private renderer: Renderer2
  ) {}

  private loadImageSize(): void {
    if (typeof this.url === "string") {
      const image = this.renderer.createElement("img");
      this.renderer.setAttribute(image, "src", this.url);
      this.renderer.setStyle(image, "display", "none");

      const { nativeElement: host } = this.hostRef;

      this.renderer.listen(image, "load", () => {
        const { naturalWidth: width, naturalHeight: height } = image;
        this.renderer.removeChild(host, image);

        this.renderer.setProperty(
          this.badge,
          "textContent",
          `${width} × ${height}`
        );
        this.updatePosition();
      });
      this.renderer.appendChild(host, image);
    } else if (typeof this.url === "object") {
      const { width, height } = this.url as Size;
      this.renderer.setProperty(
        this.badge,
        "textContent",
        `${width} × ${height}`
      );
    }
  }

  private createBadge() {
    const badge = this.renderer.createElement("div");
    this.renderer.setStyle(badge, "position", "absolute");
    this.renderer.setStyle(badge, "display", "none");
    this.renderer.setStyle(badge, "top", "0");
    this.renderer.setStyle(badge, "left", "0");
    this.renderer.setStyle(badge, "background", "rgba(0, 0, 0, 0.5)");
    this.renderer.setStyle(badge, "color", "#fff");
    this.renderer.setStyle(badge, "padding", "1px 4px");
    this.renderer.setStyle(badge, "fontSize", "10px");
    this.renderer.setStyle(badge, "zIndex", "1");
    this.renderer.setStyle(badge, "white-space", "nowrap");
    this.renderer.setStyle(badge, "pointerEvents", "none");

    const {
      nativeElement: { parentElement: parent },
    } = this.hostRef;
    this.renderer.setStyle(parent, "position", "relative");
    this.renderer.appendChild(parent, badge);

    this.badge = badge;
  }

  private removeBadge() {
    if (!!this.badge) {
      const {
        nativeElement: { parentElement: parent },
      } = this.hostRef;
      this.renderer.removeChild(parent, this.badge);
      this.badge = null;
    }
  }

  @HostListener("load", ["$event.target"])
  onLoad(): void {
    if (!!this.badge) {
      this.renderer.setStyle(this.badge, "display", "block");
      this.updatePosition();
    }
  }

  private updatePosition() {
    if (!this.badge) {
      return;
    }
    const img = this.hostRef.nativeElement as HTMLImageElement;

    const parent = img.parentElement as HTMLElement;
    const imgRect = img.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    const top = imgRect.top - parentRect.top;
    const left = imgRect.left - parentRect.left;

    this.renderer.setStyle(this.badge, "top", `${top}px`);
    this.renderer.setStyle(
      this.badge,
      "left",
      `${left + imgRect.width - this.badge.offsetWidth}px`
    );
  }

  @HostListener("error")
  onError() {
    if (!!this.badge) {
      this.renderer.setStyle(this.badge, "display", "none");
    }
  }

  @HostListener("window:resize")
  onResize() {
    this.updatePosition();
  }
}
