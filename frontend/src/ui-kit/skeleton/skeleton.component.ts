import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { UI } from "src/consts/ui";

@Component({
  selector: "app-skeleton",
  templateUrl: "./skeleton.component.html",
  styleUrls: ["./skeleton.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SkeletonComponent {
  ui = UI;

  @Input()
  type: "lines" | "cards";

  @Input()
  cols = 4;

  @Input()
  rows = 3;
}
