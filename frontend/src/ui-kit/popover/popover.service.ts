import {
  ElementRef,
  EventEmitter,
  Injectable,
  NgZone,
  Renderer2,
  RendererFactory2,
} from "@angular/core";
import {
  PopoverComponent,
  PopoverContent,
  PopoverOptions,
} from "./popover.component";

export class PopoverInstance {
  hide: () => void;
  picked: (path: Object[]) => boolean;
  update: () => void;
}

@Injectable({ providedIn: "root" })
export class PopoverService {
  private popover: PopoverComponent;
  private renderer: Renderer2;
  private target: HTMLElement;
  private listeners: Function[] = [];
  attached = new EventEmitter<HTMLElement>();

  constructor(
    private zone: NgZone,
    public rendererFactory: RendererFactory2,
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  register(popover: PopoverComponent): void {
    this.popover = popover;
  }

  unregister(): void {
    this.popover = null;
  }

  private checkRegistration() {
    if (!this.popover) {
      throw new Error("popover component is not registered");
    }
  }

  private listenDocumentScroll() {
    this.zone.runOutsideAngular(() => {
      let mouseX = 0,
        mouseY = 0;
      this.listeners.push(
        this.renderer.listen(
          "document",
          "mousemove",
          ({ clientX, clientY }: MouseEvent) => {
            [mouseX, mouseY] = [clientX, clientY];
          },
        ),
      );
      this.listeners.push(
        this.renderer.listen("document", "scroll", () => {
          if (
            !this.popover.contains(document.elementFromPoint(mouseX, mouseY))
          ) {
            this.popover.hide();
            this.unlistenDocumentScroll();
            // TODO: waiting for OnPush
            // https://github.com/angular/angular/issues/11442
            // https://github.com/angular/angular/issues/22560
            this.zone.run(() => this.attached.emit(null));
          }
        }),
      );
    });
  }

  private unlistenDocumentScroll() {
    this.listeners.forEach((listener) => listener());
  }

  show(
    element: ElementRef | HTMLElement,
    content: PopoverContent,
    options: Partial<PopoverOptions> = {},
  ): PopoverInstance {
    this.checkRegistration();

    const target =
      element instanceof ElementRef ? element.nativeElement : element;

    this.popover.show(target, content, options);
    this.target = target;

    this.listenDocumentScroll();
    this.attached.emit(target);

    return {
      hide: () => this.hide(target),
      picked: (path: Object[]) => this.popover.picked(path),
      update: () => this.popover.update(),
    };
  }

  private hide(target: HTMLElement = null) {
    if (!this.target || this.target === target) {
      this.popover.hide();
      this.unlistenDocumentScroll();
      this.attached.emit(null);
    }
  }
}
