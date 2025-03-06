import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  Input,
  QueryList,
  ViewChildren,
} from "@angular/core";
import first from "lodash/first";
import { ImageData, Launch, LaunchOutput } from "src/models/launch";

@Component({
  selector: "app-launch-outputs",
  templateUrl: "./launch-outputs.component.html",
  styleUrls: ["./launch-outputs.component.scss"],
})
export class LaunchOutputsComponent {
  private _launch: Launch;

  @HostBinding("attr.data-mode")
  @Input()
  mode: "card" | "full" = "card";

  @Input()
  set launch(launch: Launch) {
    this._launch = launch;
    console.log(launch);
    const keys = [...launch.outputs.keys()];
    if (keys.length > 0) {
      this.active = { id: first(keys), index: 0 };
    }
  }

  get launch() {
    return this._launch;
  }

  @Input()
  active!: { id: string; index: number };

  @ViewChildren("buttonRef")
  buttons!: QueryList<ElementRef>;

  constructor(private cd: ChangeDetectorRef) {}

  activate(id: string, index: number = 0) {
    this.active = { id, index };
    this.cd.detectChanges();
  }

  startDrag(event: DragEvent, output: LaunchOutput) {
    switch (output.type) {
      case "image":
        const image = output.data as ImageData;
        event.dataTransfer.setData("text/uri", image.url);
        break;
    }
  }
}
