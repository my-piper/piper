import {
  ComponentFactoryResolver,
  Directive,
  ElementRef,
  HostListener,
  Injector,
  Input,
  OnDestroy,
  OnInit,
  Renderer2,
} from "@angular/core";
import { InspectComponent } from "src/app/inspect/inspect.component";
import { ModalService } from "src/ui-kit/modal/modal.service";

type SourceType = "image" | "video";

const ICON = `
<svg width="24" height="24" viewBox="0 0 24 24"  stroke="white" stroke-width="1.5" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 6H18V10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 18H6V14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

@Directive({
  selector: "[inspect]",
})
export class InspectDirective implements OnInit, OnDestroy {
  private parent: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;

  private type: SourceType;
  private url: string;
  private text: string;

  private observers: { parent: MutationObserver | null } = { parent: null };

  @Input("inspect")
  set config({
    type,
    url,
    text,
  }: {
    type: SourceType;
    url?: string;
    text?: string;
  }) {
    [this.type, this.url, this.text] = [type, url, text];
  }

  constructor(
    private injector: Injector,
    private modal: ModalService,
    private cfr: ComponentFactoryResolver,
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    const {
      nativeElement: { parentElement: parent },
    } = this.hostRef;
    this.parent = parent;

    this.createButton();
    this.updatePosition();

    const observer = new MutationObserver(() => this.updatePosition());
    observer.observe(parent, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    this.observers.parent = observer;
  }

  ngOnDestroy() {
    this.removeButton();

    if (this.observers.parent) {
      this.observers.parent.disconnect();
    }
  }

  private createButton() {
    const button = this.renderer.createElement("button") as HTMLButtonElement;
    this.renderer.setStyle(button, "position", "absolute");
    this.renderer.setStyle(button, "border", "none");
    this.renderer.setStyle(button, "top", "0");
    this.renderer.setStyle(button, "left", "0");
    this.renderer.setStyle(button, "width", "40px");
    this.renderer.setStyle(button, "height", "40px");
    this.renderer.setStyle(button, "background", "rgba(0, 0, 0, .5)");
    this.renderer.setStyle(button, "cursor", "pointer");
    this.renderer.setStyle(button, "opacity", "0.75");
    this.renderer.setStyle(button, "outline", "none");
    this.renderer.setStyle(button, "display", "flex");
    this.renderer.setStyle(button, "alignItems", "center");
    this.renderer.setStyle(button, "justifyContent", "center");
    this.renderer.setStyle(button, "zIndex", "1");
    this.renderer.setProperty(button, "innerHTML", ICON);
    this.renderer.listen(button, "click", () => this.inspect());

    const {
      nativeElement: { parentElement: parent },
    } = this.hostRef;

    const parentStyle = getComputedStyle(parent);
    if (parentStyle.position === "static") {
      this.renderer.setStyle(parent, "position", "relative");
    }

    this.renderer.appendChild(parent, button);

    this.button = button;
    this.parent = parent;
  }

  private removeButton() {
    if (this.button && this.parent) {
      this.renderer.removeChild(this.parent, this.button);
      this.button = null;
    }
  }

  // For image/video load layout changes
  @HostListener("load")
  onLoad() {
    this.updatePosition();
  }

  private updatePosition() {
    if (!this.button) {
      return;
    }

    const host = this.hostRef.nativeElement;
    const parent = this.parent || host.parentElement;
    if (!host || !parent) {
      return;
    }
    const top = host.offsetTop + 5;
    const left = host.offsetLeft + 5;

    this.renderer.setStyle(this.button, "top", `${top}px`);
    this.renderer.setStyle(this.button, "left", `${left}px`);
  }

  private inspect() {
    const component = this.cfr
      .resolveComponentFactory(InspectComponent)
      .create(this.injector);
    [component.instance.type, component.instance.url, component.instance.text] =
      [this.type, this.url, this.text];
    this.modal.open(component, {
      title: $localize`:@@label.inspect:Inspect`,
    });
  }

  @HostListener("window:resize")
  onResize() {
    this.updatePosition();
  }
}
