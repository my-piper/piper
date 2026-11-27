import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
} from "@angular/core";
import { UI } from "src/consts/ui";
import { Pipeline } from "src/models/pipeline";
import { Box } from "src/utils/groups";
import {
  minimapFrame,
  MinimapFrame,
  MINIMAP,
  toCanvas,
  toMap,
} from "src/utils/minimap";
import { nodeLayout } from "src/utils/node-layout";

type MapBox = Box & { id: string; color?: string };

/**
 * An overview of the whole pipeline (#336): its nodes, its group frames
 * and the visible area. A click or drag on it asks the canvas to centre
 * the view on that point.
 */
@Component({
  selector: "app-canvas-minimap",
  templateUrl: "./canvas-minimap.component.html",
  styleUrls: ["./canvas-minimap.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CanvasMinimapComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input({ required: true })
  pipeline!: Pipeline;

  /** The visible area, in canvas px. */
  @Input({ required: true })
  view!: Box;

  /** A canvas point to centre the view on. */
  @Output()
  centerAt = new EventEmitter<{ x: number; y: number }>();

  readonly size = MINIMAP;

  /** Everything drawn, in map px, worked out on each change detection. */
  get drawing() {
    const nodes = [...(this.pipeline.nodes ?? new Map())].map(([id, node]) => ({
      id,
      x: node.arrange?.x ?? 0,
      y: node.arrange?.y ?? 0,
      w: node.arrange?.w || UI.node.width,
      h: nodeLayout(node).height,
      color: node.arrange?.["color"] as string | undefined,
    }));
    const groups = [...(this.pipeline.layout?.groups ?? new Map())].map(
      ([id, g]) => ({ id, x: g.x, y: g.y, w: g.w, h: g.h, color: g.color }),
    );
    const frame = minimapFrame([...nodes, ...groups, this.view]);
    const map = (b: MapBox): MapBox => ({ ...b, ...toMap(b, frame) });
    return {
      frame,
      nodes: nodes.map(map),
      groups: groups.map(map),
      view: toMap(this.view, frame),
    };
  }

  /** Centres the view under the pointer, and follows it while dragged. */
  press(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const frame = this.drawing.frame;
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser doesn't track (synthetic): moves still arrive.
    }
    const go = (e: PointerEvent) => this.center(e, frame);
    const up = () => {
      target.removeEventListener("pointermove", go);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", go);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
    go(event);
  }

  private center(event: PointerEvent, frame: MinimapFrame) {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.centerAt.emit(
      toCanvas(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        frame,
      ),
    );
  }
}
