import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
  Renderer2,
} from "@angular/core";
import { Point } from "src/types/point";

const MOVE_DELAY = 100;
const STOP_DELAY = 100;

@Directive({ selector: "[appDragMove]", exportAs: "appDragMove" })
export class DragMoveDirective {
  _position!: Point;

  private timers: {
    start: ReturnType<typeof setTimeout> | null;
    stop: ReturnType<typeof setTimeout> | null;
  } = {
    start: null,
    stop: null,
  };

  @HostBinding("attr.data-mode")
  mode: "default" | "move" = "default";

  private shiftX = 0;
  private shiftY = 0;

  private hostW = 0;
  private hostH = 0;

  anchorX = 0;
  anchorY = 0;

  grid = 10;

  dragged = false;

  @Input("appDragMove")
  set config({
    position,
    anchorX = 0,
    anchorY = 0,
    grid = 10,
  }: {
    position: Point;
    anchorX: number;
    anchorY: number;
    grid: number;
  }) {
    this.position = position;
    this.grid = grid;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
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

  @HostListener("mousedown", ["$event"])
  startMove(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select")) {
      return;
    }

    const { nativeElement: e } = this.hostRef;
    const hostRect = e.getBoundingClientRect();

    [this.hostW, this.hostH] = [e.offsetWidth, e.offsetHeight];

    this.shiftX = event.clientX - hostRect.left;
    this.shiftY = event.clientY - hostRect.top;

    clearTimeout(this.timers.start);
    this.timers.start = setTimeout(() => {
      this.mode = "move";
      this.renderer.setStyle(e, "cursor", "grabbing");
      this.renderer.setStyle(e, "z-index", 1);
      this.cd.detectChanges();
    }, MOVE_DELAY);
  }

  @HostListener("document:mousemove", ["$event"])
  move(event: MouseEvent) {
    if (this.mode === "move") {
      const { parentNode } = this.hostRef.nativeElement;
      const rect = parentNode.getBoundingClientRect();
      let x = Math.floor(event.clientX - this.shiftX - rect.left);
      let y = Math.floor(event.clientY - this.shiftY - rect.top);
      x = Math.round(x / this.grid) * this.grid;
      y = Math.round(y / this.grid) * this.grid;

      x = x + Math.round(this.hostW * this.anchorX);
      y = y + Math.round(this.hostH * this.anchorY);

      this.position = { x, y };
      this.moving.emit(this.position);
      this.dragged = true;
    }
  }

  @HostListener("document:mouseup")
  stopMove() {
    clearTimeout(this.timers.start);
    if (this.mode === "move") {
      this.mode = "default";
      this.renderer.setStyle(this.hostRef.nativeElement, "cursor", "default");
      this.moved.emit(this.position);

      this.timers.stop = setTimeout(() => {
        this.dragged = false;
        this.cd.detectChanges();
      }, STOP_DELAY);
    }
  }
}
