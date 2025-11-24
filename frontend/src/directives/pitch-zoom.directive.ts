import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  Renderer2,
} from "@angular/core";

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.5;
const ZOOM_SPEED = 0.01;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// thanks for ChatGPT here
@Directive({
  selector: "[pitchZoom]",
})
export class PitchZoomDirective implements OnInit {
  private zoom = 1;

  @Input("pitchZoom")
  set config({ zoom }: { zoom: number }) {
    this.zoom = zoom ?? 1;
  }

  @Output("zoom")
  updated = new EventEmitter<number>();

  constructor(
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    const el = this.hostRef.nativeElement;
    this.renderer.setStyle(el, "transform-origin", "0 0");
    this.renderer.setStyle(el, "transform", `scale(${this.zoom})`);
  }

  @HostListener("wheel", ["$event"])
  onWheel(event: WheelEvent) {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();

    const delta = -event.deltaY;
    const newZoom = clamp(this.zoom + delta * ZOOM_SPEED, MIN_SCALE, MAX_SCALE);
    if (newZoom === this.zoom) {
      return;
    }

    const content = this.hostRef.nativeElement;
    const container = content.parentElement as HTMLElement;

    const containerRect = container.getBoundingClientRect();

    const mxViewport = event.clientX - containerRect.left;
    const myViewport = event.clientY - containerRect.top;

    const worldX = (container.scrollLeft + mxViewport) / this.zoom;
    const worldY = (container.scrollTop + myViewport) / this.zoom;

    this.zoom = newZoom;
    this.renderer.setStyle(content, "transform", `scale(${this.zoom})`);

    const newScrollLeft = worldX * this.zoom - mxViewport;
    const newScrollTop = worldY * this.zoom - myViewport;

    container.scrollLeft = newScrollLeft;
    container.scrollTop = newScrollTop;

    this.updated.emit(this.zoom);
  }
}
