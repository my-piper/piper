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

  private anchorX = 0;
  private anchorY = 0;

  private grid = 10;

  private zoom: number = 1;

  private disabled = false;
  private dragged = false;

  @Input("appDragMove")
  set config({
    position,
    anchorX = 0,
    anchorY = 0,
    grid = 10,
    zoom,
    disabled,
  }: {
    position: Point;
    anchorX: number;
    anchorY: number;
    grid: number;
    zoom: number;
    disabled: boolean;
  }) {
    this.position = position;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.grid = grid;
    this.zoom = zoom;
    this.disabled = disabled;
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
    if (this.disabled) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select")) {
      return;
    }
    const { nativeElement: e } = this.hostRef;

    const hostRect = e.getBoundingClientRect();
    const zoom = this.zoom;

    this.hostW = e.offsetWidth / zoom;
    this.hostH = e.offsetHeight / zoom;

    this.shiftX = (event.clientX - hostRect.left) / zoom;
    this.shiftY = (event.clientY - hostRect.top) / zoom;

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
      const zoom = this.zoom;
      const parent = this.hostRef.nativeElement.parentNode;
      const rect = parent.getBoundingClientRect();

      const mouseX = event.clientX;
      const mouseY = event.clientY;

      let x = (mouseX - rect.left) / zoom - this.shiftX;
      let y = (mouseY - rect.top) / zoom - this.shiftY;

      x = Math.round(x / this.grid) * this.grid;
      y = Math.round(y / this.grid) * this.grid;

      x += this.hostW * this.anchorX * zoom;
      y += this.hostH * this.anchorY * zoom;

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
