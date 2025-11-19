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
  private parent: HTMLElement;
  private button: HTMLButtonElement;

  private type: SourceType;
  private url: string;

  @Input("inspect")
  set config({ type, url }: { type: SourceType; url: string }) {
    [this.type, this.url] = [type, url];
  }

  constructor(
    private injector: Injector,
    private modal: ModalService,
    private cfr: ComponentFactoryResolver,
    private hostRef: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    const {
      nativeElement: { parentElement: parent },
    } = this.hostRef;
    this.parent = parent;

    this.createButton();
    this.updatePosition();
  }

  ngOnDestroy() {
    this.removeButton();
  }

  private createButton() {
    const button = this.renderer.createElement("button");
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
    this.renderer.setStyle(parent, "position", "relative");
    this.renderer.appendChild(parent, button);

    this.button = button;
  }

  private removeButton() {
    if (!!this.button) {
      this.renderer.removeChild(this.parent, this.button);
      this.button = null;
    }
  }

  private updatePosition() {
    if (!this.button) {
      return;
    }
    const hostElement = this.hostRef.nativeElement as HTMLImageElement;

    const parent = hostElement.parentElement as HTMLElement;
    const hostRect = hostElement.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    const top = hostRect.top - parentRect.top;
    const left = hostRect.left - parentRect.left;

    this.renderer.setStyle(this.button, "top", `${top + 5}px`);
    this.renderer.setStyle(this.button, "left", `${left + 5}px`);
  }

  private inspect() {
    const component = this.cfr
      .resolveComponentFactory(InspectComponent)
      .create(this.injector);
    [component.instance.type, component.instance.url] = [this.type, this.url];
    this.modal.open(component, {
      title: $localize`:@@label.inspect:Inspect`,
    });
  }

  @HostListener("window:resize")
  onResize() {
    this.updatePosition();
  }
}
