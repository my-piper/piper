import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
} from "@angular/core";
import { filter, takeWhile } from "rxjs/operators";
import { PopoverContent, PopoverOptions } from "./popover.component";
import { PopoverInstance, PopoverService } from "./popover.service";

@Directive({
  selector: "[appPopover]",
  exportAs: "appPopover",
  standalone: false,
})
export class PopoverDirective implements OnInit, OnDestroy {
  private options: Partial<PopoverOptions> & { content: PopoverContent };
  private _instance: PopoverInstance;
  private destroyed = false;
  private listeners: Function[] = [];

  get tooltip() {
    return typeof this.options.content === "string";
  }

  set instance(instance: PopoverInstance) {
    this._instance = instance;
    if (!instance) {
      this.removed.emit();
    } else {
      this.attached.emit(instance);
    }
  }

  get instance() {
    return this._instance;
  }

  @Input("appPopover")
  set __options__(
    options: Partial<PopoverOptions> & { content: PopoverContent },
  ) {
    this.options = Object.assign(new PopoverOptions(options), {
      content: options.content,
    });
  }

  @Output()
  attached = new EventEmitter<PopoverInstance>();

  @Output()
  removed = new EventEmitter();

  constructor(
    private popover: PopoverService,
    private hostRef: ElementRef,
    private renderer: Renderer2,
    private zone: NgZone,
  ) {}

  ngOnInit() {
    this.popover.attached
      .pipe(
        takeWhile(() => !this.destroyed),
        filter(
          (target) => !!this.instance && target !== this.hostRef.nativeElement,
        ),
      )
      .subscribe(() => (this.instance = null));

    this.zone.runOutsideAngular(() => {
      this.listeners.push(
        this.renderer.listen("document", "mousemove", (e: Event) => {
          const path = e.composedPath();
          if (
            !!this.instance &&
            this.options.trigger === "hover" &&
            !this.picked(path)
          ) {
            this.hide(path);
          }
        }),
      );
      this.listeners.push(
        this.renderer.listen("document", "click", (e: Event) => {
          const path = e.composedPath();
          if (
            !!this.instance &&
            this.options.trigger === "click" &&
            !this.picked(path)
          ) {
            this.hide(path);
          }
        }),
      );
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (!!this.instance) {
      this.instance.hide();
      this.instance = null;
    }
    this.listeners.forEach((listener) => listener());
  }

  @HostListener("mouseenter")
  mouseEnter() {
    if (this.options.trigger === "hover") {
      this.show();
    }
  }

  @HostListener("click")
  click() {
    if (this.options.trigger === "hover" && this.tooltip) {
      this.hide();
    }
    if (this.options.trigger === "click") {
      !this.instance ? this.show() : this.hide();
    }
  }

  private picked(elements: Object[]) {
    return elements.indexOf(this.hostRef.nativeElement) !== -1;
  }

  private show() {
    if (this.options.content && !this.options.disabled) {
      this.instance = this.popover.show(
        this.hostRef,
        this.options.content,
        this.options,
      );
    }
  }

  private hide(path: Object[] = []) {
    if (!!this.instance && (!this.instance.picked(path) || this.tooltip)) {
      this.instance.hide();
      this.instance = null;
    }
  }
}
