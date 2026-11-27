import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  Input,
  QueryList,
  ViewChildren,
  ChangeDetectionStrategy,
} from "@angular/core";
import first from "lodash/first";
import {
  ImageData,
  ImagesData,
  Launch,
  LaunchArtefact,
} from "src/models/launch";

/** A card shows at most this many thumbnails of an image array. */
const MAX_THUMBS = 10;

@Component({
  selector: "app-launch-outputs",
  templateUrl: "./launch-outputs.component.html",
  styleUrls: ["./launch-outputs.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LaunchOutputsComponent {
  private _launch: Launch;

  @HostBinding("attr.data-mode")
  @Input()
  mode: "card" | "full" = "card";

  /** A card without filled outputs says whether more may still come. */
  @Input()
  running = false;

  @Input()
  /** Outputs fill in live, so the default selection is not pinned here. */
  set launch(launch: Launch) {
    this._launch = launch;
  }

  get launch() {
    return this._launch;
  }

  @Input()
  active!: { id: string; index: number };

  @ViewChildren("buttonRef")
  buttons!: QueryList<ElementRef>;

  constructor(private cd: ChangeDetectorRef) {}

  /** The shown output: the chosen one, else the first filled one. */
  get selected(): { id: string; index: number } | undefined {
    if (this.active) {
      return this.active;
    }
    const id = this.defaultOutput();
    return id ? { id, index: 0 } : undefined;
  }

  /** Whether any output has data to show yet. */
  get filled(): boolean {
    return this.outputs().some((o) => !!o.data);
  }

  /** How many thumbnails a card's strip would hold. */
  get thumbs(): number {
    return this.outputs().reduce(
      (sum, o) =>
        sum +
        (o.type === "image[]"
          ? Math.min((o.data as ImagesData)?.images?.length ?? 0, MAX_THUMBS)
          : 1),
      0,
    );
  }

  private outputs(): LaunchArtefact[] {
    return [...(this.launch?.outputs?.values() ?? [])];
  }

  private defaultOutput(): string | undefined {
    const entries = [...(this.launch?.outputs?.entries() ?? [])];
    const filled = entries.find(([, o]) => !!o.data);
    return filled?.[0] ?? first(entries)?.[0];
  }

  activate(id: string, index: number = 0) {
    this.active = { id, index };
    this.cd.detectChanges();
  }

  startDrag(event: DragEvent, output: LaunchArtefact) {
    switch (output.type) {
      case "image": {
        const image = output.data as ImageData;
        event.dataTransfer.setData("text/uri", image.url);
        break;
      }
    }
  }
}
