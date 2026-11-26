import { isPlatformBrowser } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  ComponentRef,
  ElementRef,
  HostBinding,
  HostListener,
  Inject,
  Input,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  DOCUMENT,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { filter } from "rxjs/operators";
import { UI } from "src/consts/ui";
import { ModalService } from "./modal.service";
import { ModalClosedReason, ModalContent, ModalOptions } from "./modal.types";

const VERTICAL_CONTENT_PADDING = 32;
const HORIZONTAL_CONTENT_PADDING = 48;
const HEADER_HEIGHT = 60.8;
const BORDER_WIDTH = 2;
const MAX_HEIGHT_COEFFICIENT = 0.9;

@Component({
  selector: "app-modal",
  templateUrl: "./modal.component.html",
  styleUrls: ["modal.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ModalComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  ui = UI;

  contentTemplate: TemplateRef<any>;
  contentComponent: ComponentRef<any>;
  options = new ModalOptions();
  timers: { animation?: any } = {};

  @HostBinding("class.opened")
  @Input()
  opened: boolean;

  @HostBinding("attr.data-overlay")
  get overlay() {
    return this.opened ? "full" : null;
  }

  @ViewChild("container", { static: false, read: ViewContainerRef })
  set container(container: ViewContainerRef) {
    if (!!container) {
      container.clear();
      if (!!this.contentComponent) {
        container.insert(this.contentComponent.hostView);
      }
    }
  }

  set content(content: ModalContent) {
    [this.contentTemplate, this.contentComponent] = [null, null];

    if (content instanceof TemplateRef) {
      this.contentTemplate = content;
    } else if (content instanceof ComponentRef) {
      this.contentComponent = content;
    }
    this.cd.detectChanges();
  }

  @Input()
  set initialize({
    content,
    options,
  }: {
    content: ModalContent;
    options: Partial<ModalOptions>;
  }) {
    this.open(content, options);
  }

  constructor(
    private modalService: ModalService,
    private renderer: Renderer2,
    private hostRef: ElementRef,
    private cd: ChangeDetectorRef,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platform: string,
  ) {}

  ngOnInit() {
    this.modalService.register(this);
  }

  ngOnDestroy() {
    this.modalService.unregister();
  }

  // TODO: options to type with optionals?.
  open(content: ModalContent, options: Partial<ModalOptions> = {}) {
    clearTimeout(this.timers.animation);
    if (isPlatformBrowser(this.platform)) {
      if (!!options.content) {
        const { width, height, actionsWidth } = options.content;
        const ratio = width / height;
        const contentHeight = Math.min(
          window.innerHeight * MAX_HEIGHT_COEFFICIENT -
            HEADER_HEIGHT -
            VERTICAL_CONTENT_PADDING -
            BORDER_WIDTH,
          height,
        );
        options.width =
          contentHeight * ratio +
          HORIZONTAL_CONTENT_PADDING +
          BORDER_WIDTH +
          (actionsWidth || 0) +
          "px";
        options.maxWidth = options.maxWidth || "99vw";
      }
    }
    this.opened = true;
    this.options = new ModalOptions(options);
    this.content = content;
    this.cd.detectChanges();
  }

  close(reason: ModalClosedReason = "default") {
    const action = () => {
      this.opened = false;
      this.renderer.setProperty(this.hostRef.nativeElement, "scrollTop", 0);
      if (!!this.options?.closed) {
        this.options.closed(reason);
      }
      this.cd.detectChanges();
    };

    if (!!this.options?.beforeClose) {
      this.options
        .beforeClose(reason)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          filter((close: boolean) => close),
        )
        .subscribe(() => action());
    } else {
      action();
    }
  }

  @HostListener("window:keydown", ["$event"])
  catchEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.close("user");
    }
  }
}
