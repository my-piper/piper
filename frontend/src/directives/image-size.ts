import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Renderer2,
} from "@angular/core";

// thanks for ChatGPT here

type Size = { width: number; height: number };

@Directive({
  selector: "[imageSize]",
})
export class ImageSizeDirective implements OnInit, OnDestroy {
  private badge!: HTMLDivElement | null;
  private _url: string | Size;
  private parent: HTMLElement | null = null;

  private observers: { parent: MutationObserver | null } = { parent: null };

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
    private hostRef: ElementRef<HTMLImageElement>,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    const {
      nativeElement: { parentElement: parent },
    } = this.hostRef;
    this.parent = parent;

    const observer = new MutationObserver(() => this.updatePosition());
    observer.observe(parent, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    this.observers.parent = observer;
  }

  ngOnDestroy() {
    this.removeBadge();

    if (this.observers.parent) {
      this.observers.parent.disconnect();
    }
  }

  private loadImageSize(): void {
    if (typeof this.url === "string") {
      const image = this.renderer.createElement("img");
      this.renderer.setAttribute(image, "src", this.url);
      this.renderer.setStyle(image, "display", "none");

      const host = this.hostRef.nativeElement;

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
      this.updatePosition();
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

    const parentStyle = getComputedStyle(parent);
    if (parentStyle.position === "static") {
      this.renderer.setStyle(parent, "position", "relative");
    }

    this.renderer.appendChild(parent, badge);

    this.badge = badge;
    this.parent = parent;
  }

  private removeBadge() {
    if (this.badge && this.parent) {
      this.renderer.removeChild(this.parent, this.badge);
      this.badge = null;
    }
  }

  @HostListener("load")
  onLoad(): void {
    if (this.badge) {
      this.renderer.setStyle(this.badge, "display", "block");
      this.updatePosition();
    }
  }

  private updatePosition() {
    if (!this.badge) {
      return;
    }

    const img = this.hostRef.nativeElement;
    const parent = this.parent || img.parentElement;
    if (!img || !parent) {
      return;
    }

    const top = img.offsetTop;
    const left = img.offsetLeft + img.offsetWidth - this.badge.offsetWidth;

    this.renderer.setStyle(this.badge, "top", `${top}px`);
    this.renderer.setStyle(this.badge, "left", `${left}px`);
  }

  @HostListener("error")
  onError() {
    if (this.badge) {
      this.renderer.setStyle(this.badge, "display", "none");
    }
  }

  @HostListener("window:resize")
  onResize() {
    this.updatePosition();
  }
}
