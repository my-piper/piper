import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  Output,
  Renderer2,
} from "@angular/core";
import { Point } from "src/types/point";

@Directive({ selector: "[appDragMove]" })
export class DragMoveDirective implements OnDestroy {
  _position!: Point;

  @HostBinding("attr.data-mode")
  mode: "default" | "move" = "default";

  listeners: { dug?: Function } = {};

  @Input("appDragMove")
  set config({
    dug,
    position,
    disabled,
  }: {
    dug: HTMLElement;
    position: Point;
    disabled: boolean;
  }) {
    this.listeners.dug = this.renderer.listen(dug, "mousedown", () => {
      this.mode = "move";
    });
    this.position = position;
  }

  set position(position: Point) {
    this._position = position;

    const { x, y } = position;
    const { nativeElement: e } = this.hostRef;
    this.renderer.setStyle(e, "left", `${x}px`);
    this.renderer.setStyle(e, "top", `${y}px`);
  }

  get position() {
    return this._position;
  }

  @Output()
  moving = new EventEmitter<Point>();

  @Output()
  moved = new EventEmitter<Point>();

  constructor(
    private renderer: Renderer2,
    private hostRef: ElementRef,
    private cd: ChangeDetectorRef
  ) {}

  ngOnDestroy() {
    this.listeners.dug?.call(this);
  }

  @HostListener("document:mousemove", ["$event"])
  move(event: MouseEvent) {
    if (this.mode === "move") {
      const { parentNode } = this.hostRef.nativeElement;
      const rect = parentNode.getBoundingClientRect();
      const x = Math.floor(event.clientX - rect.left);
      const y = Math.floor(event.clientY - rect.top);
      this.position = { x, y };

      this.moving.emit(this.position);
    }
  }

  @HostListener("document:mouseup")
  stopMove() {
    if (this.mode === "move") {
      this.mode = "default";
      this.cd.detectChanges();

      this.moved.emit(this.position);
    }
  }
}
